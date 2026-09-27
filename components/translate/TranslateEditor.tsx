"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Noto_Sans_Myanmar } from "next/font/google";
import { ChevronDown, MoreHorizontal, RefreshCw, ChevronLeft, ClipboardPaste, Copy, LocateFixed, Pause, Play, SlidersHorizontal, Sparkles, Pencil, Download, Eye, Grip, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { ConfirmDialog, Dialog, Drawer, Input, Menu, MenuItem, MenuTrigger, Textarea, toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LinkButton, LoadingButton, MiniButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { apiClient, useRead, useWrite } from "@/lib/spoosh";
import { formatBytes, formatDuration } from "@/lib/movie-recap";
import { applyCueEdit, buildTranslateSrtPrompt, TRANSLATE_PROMPT_BATCH_SIZE, formatCueTime, parseCueTime, clampTranslateRect, formatSrtTime, mergeSrtBlocks, parseSrt, parseSrtBlocks, srtBlocksToText, translateCuesToSrt, translateBlurCssPx, translateCues, type TranslateCue, type TranslateProject, type TranslateRect } from "@/lib/translate";
import { replaceTranslateVideo, uploadTranslateVideo } from "@/lib/translate-upload";
import { toTranslateBundle, translateBundleFileName } from "@/lib/translate-transfer";
import { MOVIE_RECAP_SUBTITLE_LINE_EM, MOVIE_RECAP_SUBTITLE_PRESETS } from "@/lib/constants/movie-recap";

// Same face and metrics libass burns in (see lib/translate-render.ts); a system Burmese
// font draws the same size noticeably larger, so the preview would not match the export.
const subtitleFont = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["700"] });
const subtitleStyle = MOVIE_RECAP_SUBTITLE_PRESETS[0];
// Hidden for now at the user's request (2026-09-27); the generate route stays in place.
const SHOW_AI_TRANSLATE = false;

type Drag = {
  kind: "move" | "resize";
  index: number;
  startX: number;
  startY: number;
  rect: TranslateRect;
  width: number;
  height: number;
};

function NumberField({ value, min, max, step = 1, onCommit, label }: {
  value: number; min: number; max: number; step?: number; onCommit: (value: number) => void; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  return <Input type="number" aria-label={label} min={min} max={max} step={step}
    value={editing ? text : String(Number(value.toFixed(1)))}
    onFocus={() => { setText(String(Number(value.toFixed(1)))); setEditing(true); }}
    onChange={(event) => setText(event.target.value)}
    onBlur={() => { const next = Number(text); if (text.trim() && Number.isFinite(next)) onCommit(Math.min(max, Math.max(min, next))); setEditing(false); }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

const timingLabels: Record<TranslateProject["subtitleTimingMode"], string> = {
  original: "Original", aligned: "Synced Original", translated: "Synced Translated",
};

function CueEditForm({ cue, preview, onSave, onCancel }: {
  cue: TranslateCue;
  preview: (cue: TranslateCue) => { previousEnd: number | null; nextStart: number | null; error: string | null };
  onSave: (cue: TranslateCue) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(formatCueTime(cue.start));
  const [end, setEnd] = useState(formatCueTime(cue.end));
  const [text, setText] = useState(cue.text);
  const [saving, setSaving] = useState(false);
  const startValue = parseCueTime(start);
  const endValue = parseCueTime(end);
  const valid = start.trim() !== "" && end.trim() !== "" && Number.isFinite(startValue) && Number.isFinite(endValue)
    && startValue >= 0 && endValue > startValue && text.trim() !== "";
  const effect = valid ? preview({ start: startValue, end: endValue, text: text.trim() }) : null;
  return <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Edit subtitle</h2>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-fg-2"><span className="mb-1 block">Start</span><Input placeholder="1:33.50" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="text-xs text-fg-2"><span className="mb-1 block">End</span><Input placeholder="1:35.00" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
    </div>
    <label className="text-xs text-fg-2"><span className="mb-1 block">Text</span><Textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} /></label>
    {!valid && <p className="text-xs text-danger">Use m:ss.cc times (e.g. 1:33.50), end after start, and non-empty text.</p>}
    {effect?.error && <p className="text-xs text-danger">{effect.error}</p>}
    {effect && !effect.error && (effect.previousEnd !== null || effect.nextStart !== null) && <div className="space-y-0.5 text-xs text-fg-2">
      {effect.previousEnd !== null && <p>Previous subtitle will end at {formatCueTime(effect.previousEnd)}.</p>}
      {effect.nextStart !== null && <p>Next subtitle will start at {formatCueTime(effect.nextStart)}.</p>}
    </div>}
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <LoadingButton variant="primary" loading={saving} disabled={!valid || !!effect?.error} onClick={async () => {
        setSaving(true);
        const saved = await onSave({ start: startValue, end: endValue, text: text.trim() });
        setSaving(false);
        if (saved) onCancel();
      }}>Save</LoadingButton>
    </div>
  </div>;
}

function SrtPasteForm({ existing, reference, onSave, onCancel }: {
  existing: string | null; reference: TranslateCue[]; onSave: (text: string) => Promise<boolean>; onCancel: () => void;
}) {
  const [pasted, setPasted] = useState("");
  const [saving, setSaving] = useState(false);
  const merge = useMemo(() => mergeSrtBlocks(existing, pasted, reference), [existing, pasted, reference]);
  const count = merge.added + merge.updated;
  return <div className="flex max-h-[80vh] flex-col gap-4">
    <div>
      <h2 className="text-lg font-semibold">Paste translated SRT</h2>
      <p className="mt-1 text-xs text-fg-3">Blocks are matched by number: existing numbers are updated, new numbers are added.</p>
    </div>
    <Textarea rows={14} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={"101\n00:04:12,300 --> 00:04:14,100\n..."} className="font-mono text-xs" />
    <p className="text-xs text-fg-2">{count ? `${merge.added} new · ${merge.updated} updated` : pasted.trim() ? "No valid SRT blocks found." : "Paste SRT blocks to continue."}{merge.renumbered ? ` · ${merge.renumbered} renumbered by timing` : ""}{merge.duplicates ? ` · ${merge.duplicates} duplicate skipped` : ""}{merge.skipped ? ` · ${merge.skipped} skipped (no block number)` : ""}</p>
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <LoadingButton variant="primary" loading={saving} disabled={!count} onClick={async () => {
        setSaving(true);
        const saved = await onSave(merge.text);
        setSaving(false);
        if (saved) onCancel();
      }}>Apply</LoadingButton>
    </div>
  </div>;
}

export function TranslateEditor({ projectId }: { projectId: string }) {
  const { data, loading, error, trigger: refresh } = useRead((api) => api("translate-projects/:id").GET({ params: { id: projectId } }));
  const { trigger: patch, loading: saving } = useWrite((api) => api("translate-projects/:id").PATCH());
  const { trigger: render, loading: rendering } = useWrite((api) => api("translate-projects/:id/render").POST());
  const { trigger: pollProject } = useRead((api) => api("translate-projects/:id").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: generate, loading: generating } = useWrite((api) => api("translate-projects/:id/generate").POST());
  const { trigger: align, loading: aligning } = useWrite((api) => api("translate-projects/:id/align").POST());
  const [draft, setProject] = useState<TranslateProject | null>(null);
  const project = draft ?? data ?? null;
  const [dirty, setDirty] = useState(false);
  const [selectedBlur, setSelectedBlur] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<"full" | "range">("full");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const rangeStartValue = parseCueTime(rangeStart);
  const rangeEndValue = parseCueTime(rangeEnd);
  const rangeValid = Number.isFinite(rangeStartValue) && Number.isFinite(rangeEndValue) && rangeEndValue - rangeStartValue >= 1
    && rangeEndValue <= ((draft ?? data)?.sourceDurationSeconds ?? 0) + 0.05;
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [clock, setClock] = useState(0);
  const [timingTab, setTimingTab] = useState<TranslateProject["subtitleTimingMode"] | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setClock(Date.now()));
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setFrameSize({ width: frame.clientWidth, height: frame.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [project?.sourceUrl]);

  useEffect(() => {
    if (selectedBlur === null) return;
    const deselect = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!frameRef.current?.contains(target) && !(target instanceof Element && target.closest("[data-blur-panel]"))) setSelectedBlur(null);
    };
    document.addEventListener("pointerdown", deselect);
    return () => document.removeEventListener("pointerdown", deselect);
  }, [selectedBlur]);

  const renderStatus = project?.renderStatus;
  const renderStartedAt = project?.updatedAt;
  useEffect(() => {
    if (renderStatus !== "running" || !renderStartedAt || Date.now() - Date.parse(renderStartedAt) > 2 * 60 * 60 * 1000) return;
    const interval = window.setInterval(async () => {
      const result = await pollProject({ force: true });
      const latest = result.data;
      if (!latest) return;
      setProject((current) => current ? {
        ...current, renderStatus: latest.renderStatus, renderProgress: latest.renderProgress, renderError: latest.renderError,
        renderOutputUrl: latest.renderOutputUrl, updatedAt: latest.updatedAt,
      } : latest);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [renderStatus, renderStartedAt, pollProject]);

  const cues = useMemo(() => project ? translateCues(project) : [], [project]);
  const activeCueIndex = cues.findIndex((cue) => currentTime >= cue.start && currentTime < cue.end);
  const activeCue = cues[activeCueIndex];
  const cueListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = cueListRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-cue-index="${activeCueIndex}"]`);
    if (!list || !row) return;
    list.scrollTo({ top: row.offsetTop - (list.clientHeight - row.offsetHeight) / 2, behavior: "smooth" });
  }, [activeCueIndex]);
  const subtitleSample = activeCue?.text ?? (project?.srtText ? null : "ဒီနေရာမှာ စာသားပေါ်ပါမယ်");

  function change(patch: Partial<TranslateProject>) {
    setProject((current) => current || data ? { ...(current ?? data!), ...patch } : null);
    setDirty(true);
  }

  function changeBlur(index: number, rect: TranslateRect) {
    if (!project) return;
    change({ blurRegions: project.blurRegions.map((item, i) => i === index ? clampTranslateRect(rect) : item) });
  }

  async function saveSettings(next = project) {
    if (!next) return null;
    const result = await patch({ params: { id: projectId }, body: {
      name: next.name, srtFileName: next.srtFileName ?? undefined,
      srtText: next.srtText ?? undefined, subtitleCues: next.subtitleCues, subtitleTimingMode: next.subtitleTimingMode,
      translatedSrtFileName: next.translatedSrtFileName ?? undefined, translatedSrtText: next.translatedSrtText ?? undefined,
      blurRegions: next.blurRegions,
      subtitleY: next.subtitleY, subtitleSize: next.subtitleSize,
    } });
    if (!result.data) { toast.error(result.error?.error ?? "Could not save project."); return null; }
    setProject(result.data);
    setDirty(false);
    return result.data;
  }

  const { openFilePicker: chooseSrt } = useFilePicker<HTMLDivElement>({
    accept: ".srt,application/x-subrip,text/plain",
    onChange: (_files, files) => {
      const file = files[0];
      if (!file || !project) return;
      void file.text().then(async (text) => {
        if (!parseSrt(text).length || new TextEncoder().encode(text).length > 2_000_000) { toast.error("Choose a valid SRT file smaller than 2 MB."); return; }
        const saved = await saveSettings({ ...project, srtFileName: file.name, srtText: text,
          subtitleCues: null, subtitleTimingMode: "original" });
        if (saved) toast.success("SRT saved.");
      });
    },
  });

  const { openFilePicker: chooseTranslatedSrt, dropzoneRef: translatedDropzoneRef, dragging: draggingTranslatedSrt } = useFilePicker<HTMLDivElement>({
    accept: ".srt,application/x-subrip,text/plain",
    onChange: (_files, files) => {
      const file = files[0];
      if (!file || !project) return;
      void file.text().then(async (text) => {
        if (!parseSrt(text).length || new TextEncoder().encode(text).length > 2_000_000) { toast.error("Choose a valid SRT file smaller than 2 MB."); return; }
        const saved = await saveSettings({ ...project, translatedSrtFileName: file.name, translatedSrtText: text, subtitleTimingMode: "translated" });
        if (saved) { setTimingTab("translated"); toast.success("Translated SRT imported."); }
      });
    },
  });

  const { openFilePicker: chooseVideo } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, files) => {
      const file = files[0];
      if (!file || !project || uploading) return;
      setUploading(true);
      setUploadPercent(0);
      void (async () => {
        try {
          const saved = dirty ? await saveSettings() : project;
          if (!saved) return;
          const updated = saved.sourceUploadStatus === "ready"
            ? await replaceTranslateVideo(saved, file, setUploadPercent)
            : await uploadTranslateVideo(saved, file, setUploadPercent);
          setProject(updated);
          setCurrentTime(0);
          toast.success(saved.sourceUploadStatus === "ready" ? "Video replaced." : "Video upload complete.");
        } catch (uploadError) {
          toast.error(uploadError instanceof Error ? uploadError.message : "Video upload failed.");
          const latest = await refresh();
          if (latest.data) setProject(latest.data);
        } finally {
          setUploading(false);
        }
      })();
    },
  });

  function startDrag(event: React.PointerEvent<HTMLElement>, kind: Drag["kind"], index = 0) {
    const frame = frameRef.current;
    if (!frame || !project) return;
    const rect = project.blurRegions[index] ?? { x: 0, y: 0, width: 5, height: 5 };
    dragRef.current = { kind, index, startX: event.clientX, startY: event.clientY, rect,
      width: frame.clientWidth, height: frame.clientHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || !project) return;
    const dx = (event.clientX - drag.startX) / drag.width * 100;
    const dy = (event.clientY - drag.startY) / drag.height * 100;
    if (drag.kind === "resize") {
      changeBlur(drag.index, { ...drag.rect,
        width: Math.min(100 - drag.rect.x, Math.max(5, drag.rect.width + dx)),
        height: Math.min(100 - drag.rect.y, Math.max(5, drag.rect.height + dy)) });
    } else {
      changeBlur(drag.index, { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy });
    }
  }

  async function startRender() {
    if (renderMode === "range" && !rangeValid) return;
    const saved = await saveSettings();
    if (!saved) return;
    setProject({ ...saved, renderStatus: "running", renderProgress: 0 });
    const result = await render({ params: { id: projectId }, body: renderMode === "range" ? { start: rangeStartValue, end: rangeEndValue } : {} });
    if (result.data) { setProject(result.data); toast.success("Video rendered."); }
    else { toast.error(result.error?.error ?? "Render failed."); const latest = await refresh(); if (latest.data) setProject(latest.data); }
  }

  async function autoAlign() {
    const saved = dirty ? await saveSettings() : project;
    if (!saved) return;
    const result = await align({ params: { id: projectId } });
    if (!result.data) { toast.error(result.error?.error ?? "Could not align subtitles to speech."); return; }
    setProject(result.data);
    setDirty(false);
    const original = parseSrt(result.data.srtText ?? "");
    const unchanged = original.filter((cue) => result.data!.subtitleCues?.some((part) =>
      part.text === cue.text && Math.abs(part.start - cue.start) < 0.02 && Math.abs(part.end - cue.end) < 0.02
    )).length;
    if (unchanged) toast.warning(`${unchanged} of ${original.length} SRT cues kept their original timing. Review synced timing.`);
    else toast.success("Subtitle timing aligned to the video speech.");
  }

  async function download() {
    const result = await apiClient("translate-projects/:id/render/download").GET({ params: { id: projectId } });
    if (!result.data) { toast.error(result.error?.error ?? "Download unavailable."); return; }
    const anchor = document.createElement("a");
    anchor.href = result.data.url;
    anchor.click();
  }

  function exportProject() {
    if (!project) return;
    const bundle = toTranslateBundle(project);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = translateBundleFileName(bundle);
    anchor.click();
    URL.revokeObjectURL(url);
    if (dirty) toast.info("Exported including unsaved changes.");
  }

  function downloadSrt(kind: TranslateProject["subtitleTimingMode"]) {
    if (!project) return;
    const baseName = (project.srtFileName || "subtitles.srt").replace(/\.srt$/i, "");
    const [text, fileName] = kind === "aligned"
      ? [project.subtitleCues && translateCuesToSrt(project.subtitleCues), `${baseName}.synced.srt`]
      : kind === "translated" ? [project.translatedSrtText, project.translatedSrtFileName || `${baseName}.translated.srt`]
      : [project.srtText, project.srtFileName || "subtitles.srt"];
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-subrip;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function showTiming(kind: TranslateProject["subtitleTimingMode"]) {
    if (!project?.srtText) return;
    const srtCues = kind === "aligned" ? project.subtitleCues
      : kind === "translated" ? parseSrt(project.translatedSrtText ?? "") : parseSrt(project.srtText);
    if (!srtCues?.length) return;
    const title = timingLabels[kind];
    const fileName = kind === "translated" ? project.translatedSrtFileName : project.srtFileName;
    Dialog.show({
      className: "!w-[min(92vw,760px)] !max-w-none",
      content: ({ dismiss }) => <div className="flex max-h-[80vh] flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2><p className="truncate text-xs text-fg-3">{fileName} · {srtCues.length} {kind === "aligned" ? "timed parts" : "subtitles"}</p></div>
          <Button variant="ghost" onClick={dismiss}>Close</Button>
        </div>
        <ol className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {srtCues.map((cue, index) => <li key={`${index}-${cue.start}`} className="rounded-lg border border-line bg-panel-2 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-3"><span className="font-semibold text-fg">#{index + 1}</span><span>{formatSrtTime(cue.start)} → {formatSrtTime(cue.end)}</span></div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{cue.text}</p>
          </li>)}
        </ol>
      </div>,
    });
  }

  async function selectTiming(kind: TranslateProject["subtitleTimingMode"]) {
    setTimingTab(kind);
    if (!project || project.subtitleTimingMode === kind) return;
    if (kind === "aligned" && !project.subtitleCues) return;
    if (kind === "translated" && !project.translatedSrtText) return;
    await saveSettings({ ...project, subtitleTimingMode: kind });
  }

  async function copyTranslationPrompt(from: number) {
    if (!project?.subtitleCues) return;
    const batch = project.subtitleCues.slice(from, from + TRANSLATE_PROMPT_BATCH_SIZE);
    try {
      await navigator.clipboard.writeText(buildTranslateSrtPrompt(translateCuesToSrt(batch, from + 1), from + 1, from + batch.length));
      toast.success(`Prompt for subtitles ${from + 1}–${from + batch.length} copied.`);
    } catch {
      toast.error("Could not copy the translation prompt.");
    }
  }


  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function seekTo(seconds: number) {
    if (videoRef.current) videoRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function editTranslatedCue(index: number) {
    if (!project?.translatedSrtText) return;
    const current = project;
    const translated = parseSrtBlocks(project.translatedSrtText).sort((a, b) => a.start - b.start);
    Dialog.show({
      className: "!w-[min(92vw,560px)] !max-w-none",
      content: ({ dismiss }) => <CueEditForm cue={translated[index]} onCancel={dismiss}
        preview={(cue) => applyCueEdit(translated, index, cue)}
        onSave={async (cue) => {
          const result = applyCueEdit(translated, index, cue);
          if (result.error) return false;
          return !!await saveSettings({ ...current, translatedSrtText: srtBlocksToText(result.cues) });
        }} />,
    });
  }

  function pasteTranslatedSrt() {
    if (!project) return;
    const current = project;
    Dialog.show({
      className: "!w-[min(92vw,760px)] !max-w-none",
      content: ({ dismiss }) => <SrtPasteForm existing={current.translatedSrtText} reference={current.subtitleCues ?? []} onCancel={dismiss} onSave={async (text) => {
        const saved = await saveSettings({ ...current, translatedSrtFileName: current.translatedSrtFileName ?? "translated.srt",
          translatedSrtText: text, subtitleTimingMode: "translated" });
        if (saved) setTimingTab("translated");
        return !!saved;
      }} />,
    });
  }

  function confirmGenerateTranslation() {
    if (!project?.subtitleCues) return;
    const batches = Math.ceil(project.subtitleCues.length / TRANSLATE_PROMPT_BATCH_SIZE);
    ConfirmDialog.show({
      title: "Generate translation with AI?",
      content: `All ${project.subtitleCues.length} synced subtitles are translated to Burmese in ${batches} batch${batches === 1 ? "" : "es"} of up to ${TRANSLATE_PROMPT_BATCH_SIZE}. Matching blocks in the current translated SRT are replaced. This uses OpenAI credits and can take a few minutes.`,
      confirmButtonLabel: "Generate",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        dismiss();
        const saved = dirty ? await saveSettings() : project;
        if (!saved) return;
        const result = await generate({ params: { id: projectId } });
        if (!result.data) { toast.error(result.error?.error ?? "AI translation failed."); return; }
        setProject(result.data);
        setDirty(false);
        setTimingTab("translated");
        toast.success("Translation generated.");
      },
    });
  }

  function confirmDeleteSyncedTiming() {
    if (!project?.subtitleCues) return;
    ConfirmDialog.show({
      title: "Delete synced timing?",
      content: "The original SRT stays saved. To use synced timing again, you will need to run Auto sync to speech.",
      confirmButtonLabel: "Delete timing",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const saved = await saveSettings({ ...project, subtitleCues: null, subtitleTimingMode: "original" });
        if (saved) dismiss();
      },
    });
  }

  if (loading && !project) return <><TopBar><LinkButton variant="ghost" href="/translate"><ChevronLeft size={16} /> Translate</LinkButton></TopBar><Body><Wrap>Loading project…</Wrap></Body></>;
  if (error && !project) return <><TopBar><LinkButton variant="ghost" href="/translate"><ChevronLeft size={16} /> Translate</LinkButton></TopBar><Body><Wrap><p className="text-danger">{error.error}</p></Wrap></Body></>;
  if (!project) return null;

  const selected = selectedBlur === null ? undefined : project.blurRegions[selectedBlur];
  const subtitlePx = Math.max(12 / MOVIE_RECAP_SUBTITLE_LINE_EM, frameSize.height * project.subtitleSize / 100);
  const subtitleOutlinePx = Math.max(frameSize.height / project.sourceHeight, subtitlePx * subtitleStyle.outlineEm);
  const originalSrtCues = parseSrt(project.srtText ?? "");
  const unchangedSyncedCues = originalSrtCues.filter((cue) => project.subtitleCues?.some((part) =>
    part.text === cue.text && Math.abs(part.start - cue.start) < 0.02 && Math.abs(part.end - cue.end) < 0.02
  )).length;
  const tab = timingTab ?? project.subtitleTimingMode;
  const sourceReady = project.sourceUploadStatus === "ready" && !!project.sourceUrl;
  const renderRunning = project.renderStatus === "running" && (clock === 0 || clock - Date.parse(project.updatedAt) < 2 * 60 * 60 * 1000);

  const settingsPanel = <>
      <div><label className="mb-1 block text-sm font-medium">Project name</label><Input value={project.name} onChange={(event) => change({ name: event.target.value })} maxLength={200} /></div>
      <div data-blur-panel className="border-t border-line pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Blur areas</h3><Button disabled={project.blurRegions.length >= 8} className="!h-8 !px-2" onClick={() => { change({ blurRegions: [...project.blurRegions, { x: 35, y: 40, width: 30, height: 20 }] }); setSelectedBlur(project.blurRegions.length); }}><Plus size={14} /> Add</Button></div>
        {project.blurRegions.map((rect, index) => <div key={index} className="mb-2 flex items-center gap-2"><Button variant={selectedBlur === index ? "primary" : "secondary"} className="!h-8 flex-1 !justify-start !px-2 text-xs" onClick={() => setSelectedBlur(index)}>Area {index + 1} · {Math.round(rect.width)} × {Math.round(rect.height)}%</Button><Button variant="ghost" className="!h-8 !px-2" aria-label={`Remove blur area ${index + 1}`} onClick={() => { change({ blurRegions: project.blurRegions.filter((_, i) => i !== index) }); setSelectedBlur(null); }}><Trash2 size={14} /></Button></div>)}
        {project.blurRegions.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3">{(["x", "y", "width", "height"] as const).map((field) => <label key={field} className="text-xs text-fg-2"><span className="mb-1 block capitalize">{field} %</span>{selected
          ? <NumberField label={`Blur ${field}`} min={field === "width" || field === "height" ? 5 : 0} max={100} value={selected[field]} onCommit={(value) => changeBlur(selectedBlur!, { ...selected, [field]: value })} />
          : <Input aria-label={`Blur ${field}`} disabled readOnly value="" placeholder="—" />}</label>)}</div>}
      </div>
      <div className="border-t border-line pt-4"><h3 className="mb-3 text-sm font-semibold">Subtitle placement</h3><div className="space-y-3"><div><div className="mb-2 flex justify-between text-xs text-fg-2"><span>Vertical position</span><span>{Math.round(project.subtitleY)}%</span></div><Input type="range" aria-label="Subtitle vertical position" min={5} max={98} value={project.subtitleY} onChange={(event) => change({ subtitleY: Number(event.target.value) })} className="!min-h-0 !border-0 !p-0" inputClassName="w-full accent-accent" /></div><label className="block text-xs text-fg-2"><span className="mb-1 block">Text size (% of video height)</span><NumberField label="Subtitle text size" min={1} max={10} step={0.5} value={project.subtitleSize} onCommit={(value) => change({ subtitleSize: value })} /></label></div></div>
      <div className="border-t border-line pt-4">
        <h3 className="mb-3 text-sm font-semibold">Render</h3>
        <div role="tablist" aria-label="Render mode" className="inline-flex gap-1 rounded-full border border-line bg-panel-2 p-1">
          {(["full", "range"] as const).map((mode) => <Button key={mode} role="tab" aria-selected={renderMode === mode} variant={renderMode === mode ? "primary" : "ghost"}
            className="!h-7 !rounded-full !px-3 text-xs" onClick={() => {
              setRenderMode(mode);
              if (mode === "range" && !rangeStart && !rangeEnd) {
                setRangeStart(formatCueTime(currentTime));
                setRangeEnd(formatCueTime(Math.min(project.sourceDurationSeconds, currentTime + 60)));
              }
            }}>{mode === "full" ? "Full" : "Range"}</Button>)}
        </div>
        {renderMode === "range" && <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([["Start", rangeStart, setRangeStart], ["End", rangeEnd, setRangeEnd]] as const).map(([label, value, setValue]) => <label key={label} className="text-xs text-fg-2">
              <span className="mb-1 flex items-center justify-between">{label}<Button variant="ghost" className="!h-5 !px-1 text-[11px]" aria-label={`Set ${label.toLowerCase()} to playhead`} onClick={() => setValue(formatCueTime(currentTime))}><LocateFixed size={12} /> Now</Button></span>
              <Input value={value} placeholder="1:33.50" onChange={(event) => setValue(event.target.value)} />
            </label>)}
          </div>
          {rangeValid ? <p className="text-xs text-fg-3">{formatCueTime(rangeEndValue - rangeStartValue)} clip</p> : <p className="text-xs text-danger">Use m:ss.cc times, at least 1 second, inside the video.</p>}
        </div>}
      </div>
      <div className="border-t border-line pt-4"><div className="flex gap-2"><LoadingButton loading={saving} disabled={!dirty || rendering || aligning} onClick={() => void saveSettings()}>Save changes</LoadingButton><LoadingButton variant="primary" loading={rendering} disabled={!sourceReady || !cues.length || renderRunning || aligning || (renderMode === "range" && !rangeValid)} onClick={() => void startRender()}>{rendering ? <><Loader2 size={15} /> Rendering…</> : "Render"}</LoadingButton></div>{renderRunning && <div className="mt-3" role="progressbar" aria-label="Render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((project.renderProgress ?? 0) * 100)}><div className="mb-1 flex justify-between text-xs text-fg-2"><span>{(project.renderProgress ?? 0) >= 0.95 ? "Uploading…" : "Rendering…"}</span><span>{Math.round((project.renderProgress ?? 0) * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round((project.renderProgress ?? 0) * 100)}%` }} /></div></div>}{project.renderError && <p className="mt-2 text-xs text-danger">{project.renderError}</p>}</div>
  </>;

  return <>
    <TopBar><LinkButton variant="ghost" href="/translate"><ChevronLeft size={16} /> Translate</LinkButton><span className="text-fg-3">/</span><span className="min-w-0 truncate font-medium">{project.name}</span><Button className="ml-auto shrink-0" onClick={exportProject}><Download size={15} /> <span className="hidden sm:inline">Export</span></Button></TopBar>
    <Body><Wrap wide>
      <div className="space-y-5">
      {sourceReady ? <section>
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-semibold" title={`${formatBytes(project.sourceSizeBytes)} · ${formatDuration(project.sourceDurationSeconds)} · ${project.sourceWidth} × ${project.sourceHeight}`}>{project.sourceFileName}</h2>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button className="shrink-0" disabled={uploading || rendering || aligning || saving || renderRunning} onClick={() => chooseVideo({ multiple: false })}><Upload size={15} /> Replace video</Button>
            {project.srtText && <LoadingButton variant="primary" className="shrink-0" loading={aligning} disabled={rendering || saving} onClick={() => void autoAlign()}><RefreshCw size={15} /> Auto Sync</LoadingButton>}
          </div>
          <Menu className="shrink-0 sm:hidden" placement="bottom-end" menuClassName="min-w-[180px] bg-panel">
            <MenuTrigger>{({ toggleMenu }) => <Button className="!h-9 !w-9 !p-0" aria-label="Video actions" onClick={toggleMenu}>{aligning ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} />}</Button>}</MenuTrigger>
            <MenuItem disabled={uploading || rendering || aligning || saving || renderRunning} onClick={() => chooseVideo({ multiple: false })}><span className="flex items-center gap-2"><Upload size={15} /> Replace video</span></MenuItem>
            {project.srtText && <MenuItem disabled={aligning || rendering || saving} onClick={() => void autoAlign()}><span className="flex items-center gap-2"><RefreshCw size={15} /> Auto Sync</span></MenuItem>}
          </Menu>
        </div>
        {project.sourceReplacement && !uploading && <p className="mt-1 text-xs text-fg-3">A replacement upload is pending. The current video remains available; select the same file to resume.</p>}
        {uploading && <div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-accent" style={{ width: `${uploadPercent}%` }} /></div><span className="text-xs tabular-nums text-fg-2">{uploadPercent}%</span></div>}
      </section> : <section className="rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">1. Video</h2>
              <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-fg-2">{uploading ? `Uploading ${uploadPercent}%` : "Upload incomplete"}</span>
            </div>
            <p className="mt-1 text-xs text-fg-3">{project.sourceFileName} · {formatBytes(project.sourceSizeBytes)} · {formatDuration(project.sourceDurationSeconds)} · {project.sourceWidth} × {project.sourceHeight}</p>
          </div>
          <Button className="shrink-0" disabled={uploading || rendering || aligning || saving || renderRunning} onClick={() => chooseVideo({ multiple: false })}><Upload size={15} /> Reselect video to resume</Button>
        </div>
        {uploading && <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-accent" style={{ width: `${uploadPercent}%` }} /></div>}
      </section>}

      <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_320px]">
        {sourceReady && <section className="flex min-w-0 flex-col rounded-xl border border-line bg-panel p-4">
          <div className="mb-3"><h2 className="font-semibold">3. Customize</h2><p className="mt-1 text-xs text-fg-3">Move and resize blur areas. Use the slider to set subtitle height.</p></div>
          <div className="h-[min(60vh,560px)] shrink-0" style={{ containerType: "size" }}>
            <div ref={frameRef} className="relative mx-auto overflow-hidden rounded-lg bg-sunken" style={{ aspectRatio: `${project.sourceWidth} / ${project.sourceHeight}`, width: `min(100cqw, ${(100 * project.sourceWidth / project.sourceHeight).toFixed(3)}cqh)` }}>
              <video ref={videoRef} src={project.sourceUrl ?? undefined} preload="metadata" playsInline className="block h-full w-full cursor-pointer object-contain" onClick={() => { setSelectedBlur(null); togglePlay(); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} />
              {project.blurRegions.map((rect, index) => <div key={index} className={`absolute touch-none border-2 ${selectedBlur === index ? "border-accent" : "cursor-pointer border-transparent"}`} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, backdropFilter: `blur(${translateBlurCssPx(rect, project.sourceWidth, project.sourceHeight, frameSize.width).toFixed(2)}px)` }} onPointerDown={(event) => { setSelectedBlur(index); startDrag(event, "move", index); }} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }}>
                {selectedBlur === index && <><div className="pointer-events-none absolute top-1 left-1 rounded bg-panel/80 p-0.5 text-accent"><Grip size={13} /></div>
                <div className="absolute -right-1 -bottom-1 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-accent bg-panel" onPointerDown={(event) => { event.stopPropagation(); setSelectedBlur(index); startDrag(event, "resize", index); }} onPointerMove={(event) => { event.stopPropagation(); moveDrag(event); }} onPointerUp={(event) => { event.stopPropagation(); dragRef.current = null; }} /></>}
              </div>)}
              {subtitleSample && <div className={`pointer-events-none absolute z-20 w-[88%] whitespace-pre-line text-center ${subtitleFont.className}`} style={{ left: "50%", top: `${project.subtitleY}%`, fontSize: `${subtitlePx.toFixed(2)}px`, lineHeight: MOVIE_RECAP_SUBTITLE_LINE_EM, color: subtitleStyle.color, fontWeight: subtitleStyle.weight, WebkitTextStrokeWidth: `${subtitleOutlinePx.toFixed(2)}px`, WebkitTextStrokeColor: subtitleStyle.outlineColor, paintOrder: "stroke fill", transform: "translate(-50%, -100%)" }}>{subtitleSample}</div>}
            </div>
          </div>
          <div className="mt-3 flex shrink-0 items-center gap-3">
            <Button className="!h-8 !w-8 shrink-0 !rounded-full !p-0" aria-label={playing ? "Pause preview" : "Play preview"} onClick={togglePlay}>{playing ? <Pause size={14} /> : <Play size={14} />}</Button>
            <Input type="range" aria-label="Seek preview" min={0} max={project.sourceDurationSeconds} step={0.05} value={Math.min(currentTime, project.sourceDurationSeconds)} onChange={(event) => seekTo(Number(event.target.value))} className="!min-h-0 flex-1 !border-0 !p-0" inputClassName="w-full accent-accent" />
            <span className="shrink-0 font-mono text-xs tabular-nums text-fg-3">{formatCueTime(currentTime)} / {formatCueTime(project.sourceDurationSeconds)}</span>
          </div>
          {cues.length > 0 && <div ref={cueListRef} className="relative mt-3 mb-4 max-h-20 shrink-0 space-y-1 overflow-y-auto">{cues.map((cue, index) => <div key={`${index}-${cue.start}`} data-cue-index={index} className="group flex items-start gap-1">
            <Button variant="ghost" className={`!h-auto min-w-0 !justify-start !px-2 !py-1 text-left text-xs ${index === activeCueIndex ? "!bg-hover" : ""}`} onClick={() => seekTo(cue.start)}><span className="mr-2 shrink-0 font-mono tabular-nums text-fg-3">{formatCueTime(cue.start)}–{formatCueTime(cue.end)}</span><span className="min-w-0 whitespace-normal">{cue.text}</span></Button>
            {project.subtitleTimingMode === "translated" && <Button variant="ghost" className="!h-7 !w-7 shrink-0 !p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Edit subtitle ${index + 1}`} disabled={aligning || saving || rendering} onClick={() => editTranslatedCue(index)}><Pencil size={13} /></Button>}
          </div>)}</div>}
          {sourceReady && project.srtText && <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5">
            <MiniButton aria-label="View" onClick={() => showTiming(project.subtitleTimingMode)}><Eye size={13} /> <span className="hidden sm:inline">View</span></MiniButton>
            {project.subtitleTimingMode === "aligned" && project.subtitleCues && <>
              <Menu placement="bottom-start" menuClassName="max-h-72 min-w-[180px] overflow-y-auto bg-panel">
                <MenuTrigger>{({ toggleMenu }) => <MiniButton aria-label="Copy prompt" onClick={toggleMenu}><Copy size={13} /> <span className="hidden sm:inline">Prompt</span> <ChevronDown size={12} /></MiniButton>}</MenuTrigger>
                {Array.from({ length: Math.ceil(project.subtitleCues.length / TRANSLATE_PROMPT_BATCH_SIZE) }, (_, batch) => {
                  const from = batch * TRANSLATE_PROMPT_BATCH_SIZE;
                  return <MenuItem key={from} onClick={() => void copyTranslationPrompt(from)}>Subtitles {from + 1}–{Math.min(from + TRANSLATE_PROMPT_BATCH_SIZE, project.subtitleCues!.length)}</MenuItem>;
                })}
              </Menu>
            </>}
            {project.subtitleTimingMode === "translated" && <>
              {SHOW_AI_TRANSLATE && <MiniButton disabled={aligning || saving || rendering || generating || !project.subtitleCues} aria-label="Generate with AI" onClick={confirmGenerateTranslation}>{generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} <span className="hidden sm:inline">Generate with AI</span></MiniButton>}
              <MiniButton disabled={aligning || saving || rendering} aria-label="Paste SRT" onClick={pasteTranslatedSrt}><ClipboardPaste size={13} /> <span className="hidden sm:inline">Paste</span></MiniButton>
            </>}
            <Menu placement="bottom-start" menuClassName="min-w-[180px] bg-panel">
              <MenuTrigger>{({ toggleMenu }) => <MiniButton className="!px-1.5" aria-label="More subtitle actions" onClick={toggleMenu}><MoreHorizontal size={14} /></MiniButton>}</MenuTrigger>
              <MenuItem onClick={() => downloadSrt(project.subtitleTimingMode)}><span className="flex items-center gap-2"><Download size={15} /> Download</span></MenuItem>
              {project.subtitleTimingMode === "original" && <MenuItem disabled={aligning || saving || rendering} onClick={() => chooseSrt({ multiple: false })}><span className="flex items-center gap-2"><Upload size={15} /> Replace SRT</span></MenuItem>}
              {project.subtitleTimingMode === "translated" && <MenuItem disabled={aligning || saving || rendering} onClick={() => chooseTranslatedSrt({ multiple: false })}><span className="flex items-center gap-2"><Upload size={15} /> Replace translated SRT</span></MenuItem>}
              {project.subtitleTimingMode === "aligned" && <MenuItem disabled={aligning || saving || rendering} onClick={confirmDeleteSyncedTiming}><span className="flex items-center gap-2 text-danger"><Trash2 size={15} /> Delete synced timing</span></MenuItem>}
            </Menu>
            <span className="ml-auto min-w-0 truncate text-[11px] text-fg-3">{project.subtitleTimingMode === "translated" && <span className="hidden sm:inline">{project.translatedSrtFileName} · </span>}{cues.length} {project.subtitleTimingMode === "aligned" ? "parts" : "subtitles"}</span>
            {project.subtitleTimingMode === "aligned" && unchangedSyncedCues > 0 && <p className="w-full text-[11px] text-fg-2">{unchangedSyncedCues} of {originalSrtCues.length} SRT cues still use their original timing.</p>}
          </div>}
          <div className="mt-4 shrink-0">
            {!project.srtText && <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-fg-3">Upload the video&apos;s original-language SRT.</p>
              <Button className="shrink-0" onClick={() => chooseSrt({ multiple: false })}><Upload size={15} /> Choose SRT</Button>
            </div>}
            {aligning && <div className="mb-3" role="progressbar" aria-label="Auto sync to speech" aria-valuetext="Transcribing speech and aligning subtitles">
              <p className="mb-2 text-xs text-fg-2">Transcribing speech and aligning subtitles…</p>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full w-1/3 animate-pulse rounded-full bg-accent" /></div>
            </div>}
            {project.srtText && <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label="Subtitle timing" className="inline-flex min-w-0 gap-1 overflow-x-auto rounded-full border border-line bg-panel-2 p-1">
                  {(["original", "aligned", "translated"] as const).map((kind) => <Button key={kind} role="tab" aria-selected={tab === kind}
                    variant={tab === kind ? "primary" : "ghost"} className="!h-8 shrink-0 !rounded-full !px-3 text-xs"
                    disabled={aligning || saving || rendering} onClick={() => void selectTiming(kind)}>
                    {timingLabels[kind]}
                  </Button>)}
                </div>
              </div>
              <div className="mt-3 empty:hidden">
                {tab === "aligned" && !project.subtitleCues && <p className="text-xs text-fg-3">Run Auto Sync to create synced timing.</p>}
                {tab === "translated" && !project.translatedSrtText && <div ref={translatedDropzoneRef} className={`flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${draggingTranslatedSrt ? "border-accent bg-accent-dim" : "border-line-2 bg-panel-2"}`}>
                  <Upload size={22} className="text-fg-3" />
                  <div>
                    <p className="text-sm font-medium">Drop the translated SRT here</p>
                    <p className="mt-1 text-xs text-fg-3">Download Synced Original, translate it, then import it here.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={aligning || saving || rendering} onClick={() => chooseTranslatedSrt({ multiple: false })}><Upload size={15} /> Import</Button>
                    <Button disabled={aligning || saving || rendering} onClick={pasteTranslatedSrt}><ClipboardPaste size={15} /> Paste SRT</Button>
                {SHOW_AI_TRANSLATE && <LoadingButton variant="primary" loading={generating} disabled={aligning || saving || rendering || !project.subtitleCues} onClick={confirmGenerateTranslation}><Sparkles size={15} /> Generate with AI</LoadingButton>}
                  </div>
                </div>}
              </div>
            </div>}
          </div>
        </section>}
        <aside className="relative col-start-2 hidden min-h-[320px] min-w-0 md:block">
          <div className="absolute inset-0 space-y-5 overflow-y-auto rounded-xl border border-line bg-panel p-4">{settingsPanel}</div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 -mb-5 mt-5 flex gap-2 border-t border-line bg-panel px-4 py-3 md:hidden">
        <Button className="flex-1" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={15} /> Settings</Button>
        <LoadingButton variant="primary" className="flex-1" loading={rendering} disabled={!sourceReady || !cues.length || renderRunning || aligning || (renderMode === "range" && !rangeValid)} onClick={() => void startRender()}>Render</LoadingButton>
      </div>
      <Drawer open={settingsOpen} handleClose={() => setSettingsOpen(false)} placement="bottom"
        className="max-h-[75vh] space-y-5 overflow-y-auto rounded-t-[14px] border-t border-line bg-panel p-4 md:hidden" backdropClassName="md:hidden">
        {settingsPanel}
      </Drawer>

      {project.renderOutputUrl && <section className="rounded-xl border border-line bg-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{project.renderStatus === "idle" ? "Previous rendered video" : "Rendered video"}</h2><Button onClick={() => void download()}><Download size={15} /> Download MP4</Button></div><video src={project.renderOutputUrl} preload="metadata" controls className="max-h-[560px] w-full rounded-lg bg-sunken" /></section>}
      </div>
    </Wrap></Body>
  </>;
}
