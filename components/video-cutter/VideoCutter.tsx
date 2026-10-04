"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Film, LocateFixed, Pause, Play, Scissors, X } from "lucide-react";
import { Input, toast, useFilePicker } from "@geckoui/geckoui";
import type { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import { Button, LoadingButton } from "@/components/ui/Button";
import { TranslateTimeline } from "@/components/translate/TranslateTimeline";
import { formatBytes } from "@/lib/movie-recap";
import { formatCueTime, formatTimecode, frameIndex, frameTime, nearestFrameRate, parseCueTime } from "@/lib/translate";

// Single-threaded core: the multi-threaded one needs cross-origin isolation
// headers on the whole app, which would break the R2 and Supabase requests the
// other pages make.
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const INPUT_DIR = "/input";

type Output = { url: string; blob: Blob; name: string };

// The worker rejects with strings and ErrorEvents as well as Errors.
function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error instanceof ErrorEvent) return error.message || "worker error";
  if (error instanceof Event) return `${error.type} event`;
  return String(error);
}

function splitName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot + 1) } : { base: name, ext: "mp4" };
}

async function saveBlob(blob: Blob, name: string) {
  // Chromium's save dialog can overwrite an existing file in place; other
  // browsers fall back to a normal download.
  const picker = (window as Window & {
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Lossless trim, entirely in the browser: the file is never uploaded and
 * nothing is stored. Every cut is taken from the original file, and a new cut
 * replaces the previous output. See history/video-cutter.md.
 */
export function VideoCutter() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegLog = useRef<string[]>([]);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startText, setStartText] = useState(formatCueTime(0));
  const [endText, setEndText] = useState(formatCueTime(0));
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [fpsMeasured, setFpsMeasured] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);
  const [cutting, setCutting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const { dropzoneRef, dragging, openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, newFiles) => {
      if (newFiles[0]) selectFile(newFiles[0]);
    },
  });

  useEffect(() => () => {
    ffmpegRef.current?.terminate();
  }, []);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => () => {
    if (output) URL.revokeObjectURL(output.url);
  }, [output]);

  // Same frame-rate measurement and frame stepping as the Translate editor.
  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video || !sourceUrl || !("requestVideoFrameCallback" in video)) return;
    let first: { frames: number; time: number } | null = null;
    let last = 0;
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      if (!first || frame.mediaTime < last || frame.mediaTime - last > 0.25) first = { frames: frame.presentedFrames, time: frame.mediaTime };
      last = frame.mediaTime;
      if (frame.mediaTime - first.time >= 2) {
        setFps(nearestFrameRate((frame.presentedFrames - first.frames) / (frame.mediaTime - first.time)));
        setFpsMeasured(true);
        return;
      }
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => video.cancelVideoFrameCallback(handle);
  }, [sourceUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=slider]")) return;
      const video = sourceVideoRef.current;
      if (!video) return;
      event.preventDefault();
      const frames = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? Math.round(fps) : 1);
      const seconds = Math.min(duration, frameTime(frameIndex(video.currentTime, fps) + frames, fps));
      video.pause();
      video.currentTime = seconds;
      setCurrentTime(seconds);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fps, duration]);

  function selectFile(next: File) {
    setFile(next);
    setSourceUrl(URL.createObjectURL(next));
    setDuration(0);
    setStartText(formatCueTime(0));
    setEndText(formatCueTime(0));
    setOutput(null);
    setCurrentTime(0);
    setFps(30);
    setFpsMeasured(false);
  }

  function clear() {
    setFile(null);
    setSourceUrl(null);
    setDuration(0);
    setStartText(formatCueTime(0));
    setEndText(formatCueTime(0));
    setOutput(null);
    setProgress(0);
    setCurrentTime(0);
    setPlaying(false);
  }

  function markFromPlayhead(which: "start" | "end") {
    const at = sourceVideoRef.current?.currentTime ?? currentTime;
    if (which === "start") setStartText(formatCueTime(at));
    else setEndText(formatCueTime(at));
  }

  function togglePlay() {
    const video = sourceVideoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function seekTo(seconds: number) {
    if (sourceVideoRef.current) sourceVideoRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }

  async function retimeRange(_index: number, start: number, end: number) {
    setStartText(formatCueTime(start));
    setEndText(formatCueTime(end));
    return true;
  }

  async function loadFfmpeg() {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    if (!ffmpegRef.current) {
      // Imported here, not at the top: the package resolves to a stub without
      // FFFSType under the server's "node" condition, which breaks SSR.
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      ffmpegRef.current = new FFmpeg();
      ffmpegRef.current.on("progress", ({ progress: ratio }) => setProgress(Math.max(0, Math.min(1, ratio))));
      ffmpegRef.current.on("log", ({ message }) => {
        ffmpegLog.current = [...ffmpegLog.current.slice(-19), message];
      });
    }
    const ffmpeg = ffmpegRef.current;
    try {
      const { toBlobURL } = await import("@ffmpeg/util");
      await ffmpeg.load({
        // Served from public/ffmpeg rather than bundled: Turbopack rejects the
        // worker's dynamic `import(coreURL)` ("expression is too dynamic").
        // Those files are copies of @ffmpeg/ffmpeg's dist/esm worker, pinned to
        // the package version in package.json — recopy them on upgrade.
        classWorkerURL: new URL("/ffmpeg/worker.js", window.location.origin).href,
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
    } catch (error) {
      ffmpegRef.current = null;
      ffmpeg.terminate();
      throw new Error(`Could not load ffmpeg: ${describeError(error)}`);
    }
    return ffmpeg;
  }

  async function cut() {
    if (!file) return;
    const start = parseCueTime(startText);
    const end = parseCueTime(endText);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      toast.error("Use times like 1:30.00 or 1:02:30.50.");
      return;
    }
    if (end <= start) {
      toast.error("End must be after start.");
      return;
    }
    const { base, ext } = splitName(file.name);
    const outputName = `${base}-cut.${ext}`;
    const outputPath = `/${outputName}`;
    setCutting(true);
    setProgress(0);
    ffmpegLog.current = [];
    let ffmpeg: FFmpeg | null = null;
    try {
      ffmpeg = await loadFfmpeg();
      await ffmpeg.createDir(INPUT_DIR).catch(() => undefined);
      // WORKERFS reads the File in place, so a multi-GB source is never copied
      // into wasm memory — only the cut output is.
      await ffmpeg.mount("WORKERFS" as FFFSType, { files: [file] }, INPUT_DIR);
      // Stream copy keeps the original quality bit for bit. The cost: the cut
      // starts on the keyframe at or before `start`, so it can begin a little
      // early.
      const code = await ffmpeg.exec([
        "-ss", start.toFixed(3),
        "-i", `${INPUT_DIR}/${file.name}`,
        "-t", (end - start).toFixed(3),
        "-map", "0",
        "-dn",
        "-ignore_unknown",
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        outputPath,
      ]);
      if (code !== 0) {
        console.error("[VideoCutter] ffmpeg log:\n" + ffmpegLog.current.join("\n"));
        throw new Error(`ffmpeg could not cut this file: ${ffmpegLog.current.at(-1) ?? `exit code ${code}`}`);
      }
      const data = await ffmpeg.readFile(outputPath);
      if (typeof data === "string") throw new Error("ffmpeg returned no video data.");
      const blob = new Blob([data.slice()], { type: file.type || "video/mp4" });
      setOutput({ url: URL.createObjectURL(blob), blob, name: outputName });
      toast.success("Cut ready.");
    } catch (error) {
      console.error("[VideoCutter] cut failed", error);
      toast.error(describeError(error));
    } finally {
      if (ffmpeg) {
        await ffmpeg.deleteFile(outputPath).catch(() => undefined);
        await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
      }
      setCutting(false);
    }
  }

  async function save() {
    if (!output) return;
    setSaving(true);
    try {
      if (await saveBlob(output.blob, output.name)) toast.success("Saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the file.");
    } finally {
      setSaving(false);
    }
  }

  const rangeStart = parseCueTime(startText);
  const rangeEnd = parseCueTime(endText);
  const rangeValid = !Number.isNaN(rangeStart) && !Number.isNaN(rangeEnd) && rangeEnd > rangeStart;

  if (!file || !sourceUrl) {
    return (
      <div
        ref={dropzoneRef}
        onClick={() => void openFilePicker({ multiple: false })}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent-dim" : "border-line bg-panel-2"
        }`}
      >
        <Film size={22} className="text-fg-3" aria-hidden="true" />
        <p className="text-sm font-medium text-fg">Drop a video here, or click to choose one</p>
        <p className="text-xs text-fg-3">It stays on this device — nothing is uploaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Film size={14} className="text-fg-3" />
          <span className="min-w-0 truncate text-sm font-medium">{file.name}</span>
          <span className="shrink-0 text-xs text-fg-3">
            {formatBytes(file.size)}
            {duration ? ` · ${formatCueTime(duration)}` : ""}
          </span>
          <Button variant="ghost" className="ml-auto inline-flex !h-8 items-center gap-1.5 !px-2 text-xs" onClick={clear} disabled={cutting}>
            <X size={14} aria-hidden="true" />
            Clear
          </Button>
        </div>
        <div className="space-y-4 p-4">
          <video
            ref={sourceVideoRef}
            src={sourceUrl}
            preload="metadata"
            playsInline
            className="max-h-[480px] w-full cursor-pointer rounded-md bg-sunken"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => {
              const seconds = event.currentTarget.duration;
              setDuration(seconds);
              setEndText(formatCueTime(seconds));
            }}
          />
          {duration > 0 && (
            <TranslateTimeline
              duration={duration}
              currentTime={currentTime}
              fps={fps}
              cues={rangeValid ? [{ start: rangeStart, end: rangeEnd, text: "Cut range" }] : []}
              activeIndex={rangeValid && currentTime >= rangeStart && currentTime < rangeEnd ? 0 : -1}
              editable={!cutting}
              onSeek={seekTo}
              onRetime={retimeRange}
              onEdit={() => undefined}
              toolbar={<>
                <Button className="!h-8 !w-8 shrink-0 !rounded-full !p-0" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </Button>
                <span className="min-w-0 truncate font-mono text-xs tabular-nums text-fg-3" title={fpsMeasured ? `${fps} fps` : "Frame rate assumed 30 fps until the video plays"}>
                  {formatTimecode(currentTime, fps)} / {formatTimecode(duration, fps)}
                  <span className="hidden sm:inline"> · {fpsMeasured ? "" : "~"}{fps} fps · ← → steps one frame</span>
                </span>
              </>}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-medium text-fg-2">Start</div>
              <div className="flex gap-2">
                <Input value={startText} onChange={(event) => setStartText(event.target.value)} className="tabular-nums" />
                <Button className="inline-flex shrink-0 items-center gap-1.5" onClick={() => markFromPlayhead("start")}>
                  <LocateFixed size={14} aria-hidden="true" />
                  Now
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-fg-2">End</div>
              <div className="flex gap-2">
                <Input value={endText} onChange={(event) => setEndText(event.target.value)} className="tabular-nums" />
                <Button className="inline-flex shrink-0 items-center gap-1.5" onClick={() => markFromPlayhead("end")}>
                  <LocateFixed size={14} aria-hidden="true" />
                  Now
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LoadingButton variant="primary" loading={cutting} className="inline-flex items-center gap-2" onClick={() => void cut()}>
              <Scissors size={15} aria-hidden="true" />
              {output ? "Cut again" : "Cut"}
            </LoadingButton>
            {cutting && <span className="text-xs tabular-nums text-fg-2">{Math.round(progress * 100)}%</span>}
            <span className="text-xs text-fg-3">
              Lossless: the original quality is kept, and the cut starts on the nearest keyframe at or before Start.
            </span>
          </div>
        </div>
      </div>

      {output && (
        <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Scissors size={14} className="text-fg-3" />
            <span className="min-w-0 truncate text-sm font-medium">{output.name}</span>
            <span className="shrink-0 text-xs text-fg-3">{formatBytes(output.blob.size)}</span>
            <LoadingButton variant="primary" loading={saving} className="ml-auto inline-flex !h-8 items-center gap-1.5 !px-3 text-xs" onClick={() => void save()}>
              <Download size={14} aria-hidden="true" />
              Save
            </LoadingButton>
          </div>
          <div className="p-4">
            <video src={output.url} controls preload="metadata" className="max-h-[480px] w-full rounded-md bg-sunken" />
            <p className="mt-2 text-xs text-fg-3">Not saved until you click Save. Cutting again or clearing replaces it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
