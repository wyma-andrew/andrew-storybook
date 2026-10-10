"use client";

import { useEffect, useRef, useState } from "react";
import { Noto_Sans_Myanmar } from "next/font/google";
import { Grip, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/movie-recap";
import { MOVIE_RECAP_LOOK, MOVIE_RECAP_SUBTITLE_LINE_EM, MOVIE_RECAP_SUBTITLE_PRESETS, movieRecapBackfillBlurCssPx } from "@/lib/constants/movie-recap";
import { recapV2CaptionChunks, type RecapV2Project, type RecapV2Unit } from "@/lib/recap-v2";
import { CAPTION_HOLD_S } from "@/lib/recap-v2-audio";
import { clampTranslateRect, translateBlurCssPx, type TranslateRect } from "@/lib/translate";

const subtitleFont = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["700"] });
const subtitleStyle = MOVIE_RECAP_SUBTITLE_PRESETS[0];
const FRAME_ASPECT = { "16:9": "16 / 9", "9:16": "9 / 16", "1:1": "1 / 1" } as const;

// The preview plays the source, so a line's caption follows the Chinese speech
// it translates: it appears when that speech starts, is split across the
// speech by length, and clears shortly after it, as the render does.
// The render times captions from the Burmese voice instead.
function previewCaption(units: RecapV2Unit[], currentS: number) {
  const unit = units.findLast((item) => item.speechStart <= currentS);
  if (!unit?.text.trim() || unit.muted || currentS > unit.speechEnd + CAPTION_HOLD_S) return null;
  const chunks = recapV2CaptionChunks(unit.text);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const progress = Math.min(0.999, Math.max(0, (currentS - unit.speechStart) / Math.max(0.001, unit.speechEnd - unit.speechStart))) * total;
  let seen = 0;
  return chunks.find((chunk) => (seen += chunk.length) > progress) ?? chunks.at(-1)!;
}

type BlurDrag = { kind: "move" | "resize"; index: number; startX: number; startY: number; rect: TranslateRect };

// Mirrors recapV2PartFilter's order: blur on the source picture, fit into the
// frame, zoom the fitted picture, mirror, then captions on the finished frame.
// Blur boxes live inside the mirrored picture box, so they are edited in source
// coordinates while being seen where the render will put them.
export function RecapV2OutputPreview({ project, selectedBlur, onSelectBlur, onBlurChange, onSubtitleY, seekRequest }: {
  project: RecapV2Project;
  selectedBlur: number | null;
  onSelectBlur: (index: number | null) => void;
  onBlurChange: (index: number, rect: TranslateRect) => void;
  onSubtitleY: (y: number) => void;
  seekRequest: { seconds: number; nonce: number } | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundRef = useRef<HTMLVideoElement>(null);
  const draggingRef = useRef(false);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [currentS, setCurrentS] = useState(0);
  const [playing, setPlaying] = useState(false);
  const seekingRef = useRef(false);
  const blurDragRef = useRef<BlurDrag | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekRequest) return;
    video.currentTime = seekRequest.seconds;
  }, [seekRequest]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => setFrame({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.aspectRatio]);

  const fit = project.fitMode === "contain"
    ? Math.min(frame.width / project.sourceWidth, frame.height / project.sourceHeight)
    : Math.max(frame.width / project.sourceWidth, frame.height / project.sourceHeight);
  const pictureWidth = project.sourceWidth * fit * project.zoom;
  const pictureHeight = project.sourceHeight * fit * project.zoom;
  const mirrored = project.mirror && MOVIE_RECAP_LOOK.mirrorAspectRatios.includes(project.aspectRatio);
  const colorFilter = `contrast(${MOVIE_RECAP_LOOK.contrast}) saturate(${MOVIE_RECAP_LOOK.saturation})`;
  const subtitlePx = Math.max(12 / MOVIE_RECAP_SUBTITLE_LINE_EM, frame.height * project.subtitleSize / 100);
  const outlinePx = Math.max(1, subtitlePx * subtitleStyle.outlineEm);
  const caption = previewCaption(project.units, currentS);
  // With nothing to say at this moment, a faint sample stays so the caption can still be positioned.
  const sample = caption ?? "မြန်မာ စာတန်း နမူနာ";

  function syncBackground() {
    const video = videoRef.current;
    const background = backgroundRef.current;
    if (!video || !background) return;
    if (Math.abs(background.currentTime - video.currentTime) > 0.3) background.currentTime = video.currentTime;
    if (video.paused !== background.paused) void (video.paused ? background.pause() : background.play().catch(() => undefined));
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function seekTo(event: React.PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * project.sourceDurationSeconds;
    video.currentTime = next;
    setCurrentS(next);
    syncBackground();
  }

  function startBlurDrag(event: React.PointerEvent<HTMLElement>, kind: BlurDrag["kind"], index: number) {
    event.stopPropagation();
    event.preventDefault();
    onSelectBlur(index);
    event.currentTarget.setPointerCapture(event.pointerId);
    blurDragRef.current = { kind, index, startX: event.clientX, startY: event.clientY, rect: project.blurRegions[index] };
  }

  function moveBlurDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = blurDragRef.current;
    if (!drag || !pictureWidth || !pictureHeight) return;
    event.stopPropagation();
    // The picture box is flipped when mirrored, so a screen-right drag is source-left.
    const dx = (event.clientX - drag.startX) / pictureWidth * 100 * (mirrored ? -1 : 1);
    const dy = (event.clientY - drag.startY) / pictureHeight * 100;
    onBlurChange(drag.index, clampTranslateRect(drag.kind === "resize"
      ? { ...drag.rect, width: drag.rect.width + dx, height: drag.rect.height + dy }
      : { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }));
  }

  function endBlurDrag(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
    blurDragRef.current = null;
  }

  function dragSubtitle(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const y = Math.round((event.clientY - bounds.top) / bounds.height * 200) / 2;
    onSubtitleY(Math.min(98, Math.max(5, y)));
  }

  return <div className="flex flex-col items-center gap-3 rounded-lg bg-sunken p-3">
    <div ref={frameRef} className={`relative overflow-hidden rounded-md bg-black ${project.aspectRatio === "9:16" ? "h-[min(70vh,560px)]" : "w-full max-w-[720px]"}`}
      style={{ aspectRatio: FRAME_ASPECT[project.aspectRatio] }}>
      {project.fitMode === "contain" && <video ref={backgroundRef} src={project.sourceUrl ?? undefined} aria-hidden="true" muted playsInline preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ transform: `scale(1.1)${mirrored ? " scaleX(-1)" : ""}`, filter: `blur(${movieRecapBackfillBlurCssPx(frame.width, project.aspectRatio).toFixed(2)}px) ${colorFilter}` }} />}
      <div className="absolute top-1/2 left-1/2" style={{ width: pictureWidth, height: pictureHeight, transform: `translate(-50%, -50%)${mirrored ? " scaleX(-1)" : ""}`, filter: colorFilter }}>
        <video ref={videoRef} src={project.sourceUrl ?? undefined} muted playsInline preload="metadata" className="h-full w-full cursor-pointer"
          onClick={() => { if (selectedBlur !== null) onSelectBlur(null); else togglePlay(); }}
          onPlay={() => { setPlaying(true); syncBackground(); }} onPause={() => { setPlaying(false); syncBackground(); }} onEnded={() => setPlaying(false)} onSeeked={syncBackground}
          onTimeUpdate={(event) => { setCurrentS(event.currentTarget.currentTime); syncBackground(); }} />
        {project.blurRegions.map((rect, index) => <div key={index} className={`absolute touch-none border-2 ${selectedBlur === index ? "border-accent" : "cursor-pointer border-accent/40"}`}
          style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, backdropFilter: `blur(${translateBlurCssPx(rect, project.sourceWidth, project.sourceHeight, pictureWidth).toFixed(2)}px)` }}
          onPointerDown={(event) => startBlurDrag(event, "move", index)} onPointerMove={moveBlurDrag} onPointerUp={endBlurDrag}>
          {selectedBlur === index && <>
            <div className="pointer-events-none absolute top-1 left-1 rounded bg-panel/80 p-0.5 text-accent"><Grip size={13} /></div>
            <div className="absolute -right-1 -bottom-1 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-accent bg-panel"
              onPointerDown={(event) => startBlurDrag(event, "resize", index)} onPointerMove={moveBlurDrag} onPointerUp={endBlurDrag} />
          </>}
        </div>)}
      </div>
      {project.subtitlesEnabled && <div className={`absolute z-20 w-[88%] cursor-ns-resize touch-none text-center select-none ${caption ? "" : "opacity-30"} ${subtitleFont.className}`}
        style={{ left: "50%", top: `${project.subtitleY}%`, transform: "translate(-50%, -100%)", fontSize: `${subtitlePx.toFixed(2)}px`, lineHeight: MOVIE_RECAP_SUBTITLE_LINE_EM,
          color: subtitleStyle.color, fontWeight: subtitleStyle.weight, WebkitTextStrokeWidth: `${outlinePx.toFixed(2)}px`, WebkitTextStrokeColor: subtitleStyle.outlineColor, paintOrder: "stroke fill" }}
        onPointerDown={(event) => { draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
        onPointerMove={dragSubtitle}
        onPointerUp={() => { draggingRef.current = false; }}>{sample}</div>}
    </div>
    <div className={`flex items-center gap-3 ${project.aspectRatio === "9:16" ? "w-[min(100%,420px)]" : "w-full max-w-[720px]"}`}>
      <Button className="!h-8 !w-8 shrink-0 !rounded-full !p-0" aria-label={playing ? "Pause preview" : "Play preview"} onClick={togglePlay}>
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-px" />}
      </Button>
      <div role="slider" aria-label="Seek preview" aria-valuemin={0} aria-valuemax={Math.round(project.sourceDurationSeconds)} aria-valuenow={Math.round(currentS)} tabIndex={0}
        className="relative h-6 flex-1 cursor-pointer touch-none"
        onPointerDown={(event) => { seekingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekTo(event); }}
        onPointerMove={(event) => { if (seekingRef.current) seekTo(event); }}
        onPointerUp={() => { seekingRef.current = false; }}
        onKeyDown={(event) => {
          const video = videoRef.current;
          if (!video || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          video.currentTime = Math.min(project.sourceDurationSeconds, Math.max(0, video.currentTime + (event.key === "ArrowRight" ? 5 : -5)));
        }}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-line-2">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, currentS / project.sourceDurationSeconds * 100)}%` }} />
        </div>
        {project.units.slice(1).map((unit) => <div key={unit.id} className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-fg-3/60" style={{ left: `${unit.videoStart / project.sourceDurationSeconds * 100}%` }} />)}
        <div className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-accent" style={{ left: `${Math.min(100, currentS / project.sourceDurationSeconds * 100)}%` }} />
      </div>
      <span className="shrink-0 font-mono text-xs text-fg-3 tabular-nums">{formatDuration(currentS)} / {formatDuration(project.sourceDurationSeconds)}</span>
    </div>
    <p className="text-xs text-fg-3">Ticks mark where each line starts. Drag blur boxes over the source subtitles and drag the subtitle up or down · {project.subtitleY}% height. Timing here follows the source; the render retimes it to the narration.</p>
  </div>;
}
