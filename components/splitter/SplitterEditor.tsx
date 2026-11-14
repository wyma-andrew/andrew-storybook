"use client";

import { useEffect, useRef, useState } from "react";
import { Noto_Sans_Myanmar } from "next/font/google";
import { ChevronLeft, Download, Loader2, Play, Save, ScanSearch, Scissors } from "lucide-react";
import { Input, Select, SelectOption, Switch, toast } from "@geckoui/geckoui";
import { Button, LinkButton, LoadingButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { OverlayHandle } from "@/components/recap-v2/RecapV2OutputPreview";
import { MOVIE_RECAP_SUBTITLE_LINE_EM, MOVIE_RECAP_SUBTITLE_PRESETS } from "@/lib/constants/movie-recap";
import { formatDuration } from "@/lib/movie-recap";
import { apiClient, useRead, useWrite } from "@/lib/spoosh";
import { SPLITTER_SETTING_KEYS, SPLITTER_STALE_JOB_MS, splitterPartLabel, type SplitterPatch, type SplitterProject } from "@/lib/splitter";
import { outputFrameSize } from "@/lib/video-framing";

const textFont = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["700"] });
const MINUTES = [0.5, 1, 1.5, 2, 3, 4, 5, 10, 15, 20, 30, 60];
const EXTRA_SECONDS = [5, 10, 15, 20, 30, 45, 60];
const TEXT_SIZES = [2, 3, 4, 5, 6, 8, 10];
const OPACITIES = [0.3, 0.5, 0.7, 0.85, 1];
const CUT_LABEL = { exact: "exact", pause: "in a pause", breath: "in a breath", quietest: "quietest moment", end: "end" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">{label}</span>{children}</div>;
}

function Preview({ project, onMove }: { project: SplitterProject; onMove: (key: "text" | "part", x: number, y: number) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => setFrame({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.aspectRatio]);
  const [width, height] = outputFrameSize({ ratio: project.aspectRatio, quality: project.quality, sourceWidth: project.sourceWidth, sourceHeight: project.sourceHeight });
  const fill = project.aspectRatio === "original" ? "bars" : project.fitMode;
  const total = Math.max(1, project.parts.length || Math.ceil(project.sourceDurationSeconds / (project.partMinutes * 60)));
  const textStyle = (size: number, opacity: number) => ({
    fontSize: `${(frame.height * size / 100).toFixed(2)}px`, lineHeight: MOVIE_RECAP_SUBTITLE_LINE_EM, color: "var(--color-video-subtitle)", opacity,
    WebkitTextStrokeWidth: project.textBox ? 0 : `${Math.max(1, frame.height * size / 100 * 0.08).toFixed(2)}px`, WebkitTextStrokeColor: MOVIE_RECAP_SUBTITLE_PRESETS[0].outlineColor, paintOrder: "stroke fill",
  } as React.CSSProperties);
  return <div className="flex justify-center rounded-lg bg-sunken p-3">
    <div ref={frameRef} className={`relative overflow-hidden rounded-md bg-black ${height > width ? "h-[min(70vh,560px)]" : "w-full max-w-[720px]"}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {fill === "blur" && <video src={project.sourceUrl ?? undefined} muted playsInline preload="metadata" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-lg" />}
      <video src={project.sourceUrl ?? undefined} muted playsInline preload="metadata" controls className={`absolute inset-0 h-full w-full ${fill === "cover" ? "object-cover" : "object-contain"}`} />
      {project.textValue.trim() && <OverlayHandle x={project.textX} y={project.textY} onMove={(x, y) => onMove("text", x, y)}>
        <div className={`whitespace-pre text-center ${textFont.className} ${project.textBox ? "rounded-lg bg-black/50 px-3 py-1" : ""}`} style={textStyle(project.textSize, project.textOpacity)}>{project.textValue}</div>
      </OverlayHandle>}
      {project.partNumberEnabled && <OverlayHandle x={project.partNumberX} y={project.partNumberY} onMove={(x, y) => onMove("part", x, y)}>
        <div className={`whitespace-pre text-center ${textFont.className} ${project.textBox ? "rounded-lg bg-black/50 px-3 py-1" : ""}`} style={textStyle(project.partNumberSize, 1)}>{splitterPartLabel(project.partNumberTemplate, 1, total)}</div>
      </OverlayHandle>}
    </div>
  </div>;
}

export function SplitterEditor({ projectId }: { projectId: string }) {
  const { data, error } = useRead((api) => api("splitter-projects/:id").GET({ params: { id: projectId } }));
  const { trigger: poll } = useRead((api) => api("splitter-projects/:id").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: pollProgress } = useRead((api) => api("splitter-projects/:id/progress").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: patch, loading: saving } = useWrite((api) => api("splitter-projects/:id").PATCH());
  const { trigger: plan } = useWrite((api) => api("splitter-projects/:id/plan").POST());
  const { trigger: split } = useWrite((api) => api("splitter-projects/:id/split").POST());
  const [server, setServer] = useState<SplitterProject | null>(null);
  const [settings, setSettings] = useState<Partial<SplitterProject>>({});

  const base = server ?? data ?? null;
  const project = base ? { ...base, ...settings } : null;
  const dirty = Object.keys(settings).length > 0;
  const running = project?.jobStatus === "running";

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(async () => {
      const { data: progress } = await pollProgress({ force: true });
      if (!progress) return;
      if (progress.jobStatus !== "running") {
        const result = await poll({ force: true });
        if (result.data) setServer(result.data);
        return;
      }
      if (Date.now() - Date.parse(progress.updatedAt) >= SPLITTER_STALE_JOB_MS) window.clearInterval(interval);
      setServer((current) => {
        const latest = current ?? data ?? null;
        return latest?.jobStatus === "running" ? { ...latest, ...progress } : current;
      });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [running, data, poll, pollProgress]);

  if (error) return <Body><Wrap><p className="text-danger">{error.error}</p></Wrap></Body>;
  if (!project || !base) return <Body><Wrap><p className="text-fg-3">Loading project…</p></Wrap></Body>;

  function change(next: Partial<SplitterProject>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  async function save() {
    if (!dirty) return base;
    const body: SplitterPatch = {};
    for (const key of SPLITTER_SETTING_KEYS) if (key in settings) Object.assign(body, { [key]: settings[key] });
    const result = await patch({ params: { id: projectId }, body });
    if (!result.data) { toast.error(result.error?.error ?? "Could not save."); return null; }
    setServer(result.data);
    setSettings({});
    return result.data;
  }

  async function runJob(kind: "plan" | "split") {
    const saved = await save();
    if (!saved) return;
    setServer({ ...saved, jobStatus: "running", jobStage: null, jobProgress: 0, jobError: null });
    const result = await (kind === "plan" ? plan : split)({ params: { id: projectId } });
    if (result.data) {
      setServer(result.data);
      toast.success(kind === "plan" ? `${result.data.parts.length} parts planned.` : `${result.data.parts.length} parts ready.`);
    } else {
      toast.error(result.error?.error ?? "The split failed.");
      const latest = await poll({ force: true });
      if (latest.data) setServer(latest.data);
    }
  }

  async function download(n: number) {
    const result = await apiClient("splitter-projects/:id/parts/:n/download").GET({ params: { id: projectId, n: String(n) } });
    if (!result.data) { toast.error(result.error?.error ?? "Download unavailable."); return; }
    const anchor = document.createElement("a");
    anchor.href = result.data.url;
    anchor.click();
  }

  const rendered = project.parts.some((part) => part.url);

  return <>
    <TopBar>
      <LinkButton variant="ghost" href="/splitter"><ChevronLeft size={16} /> Splitter</LinkButton><span className="text-fg-3">/</span>
      <span className="min-w-0 truncate font-medium">{project.name}</span>
      <div className="ml-auto flex gap-2">
        {dirty && <LoadingButton loading={saving} disabled={running} onClick={() => void save()}><Save size={16} /> Save</LoadingButton>}
      </div>
    </TopBar>
    <Body><Wrap wide>
      {project.sourceUploadStatus !== "ready" && <p className="mb-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg-2">This video has not finished uploading. Open <LinkButton variant="ghost" href="/splitter/new">New project</LinkButton> and reselect the same file to resume.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Preview project={project} onMove={(key, x, y) => change(key === "text" ? { textX: x, textY: y } : { partNumberX: x, partNumberY: y })} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={running || project.sourceUploadStatus !== "ready"} onClick={() => void runJob("plan")}><ScanSearch size={16} /> Check cuts</Button>
            <Button variant="primary" disabled={running || project.sourceUploadStatus !== "ready"} onClick={() => void runJob("split")}>{running ? <Loader2 size={16} className="animate-spin" /> : rendered ? <Scissors size={16} /> : <Play size={16} />} {rendered ? "Split again" : "Start split"}</Button>
            {running && <span className="text-xs text-fg-2">{project.jobStage ?? "Starting…"}{project.jobProgress == null ? "" : ` · ${Math.round(project.jobProgress * 100)}%`}</span>}
            {!running && project.jobStatus === "failed" && project.jobError && <span className="text-xs break-words text-danger">{project.jobError}</span>}
          </div>
          <div>
            <h2 className="mb-2 text-base font-semibold">Parts</h2>
            {!project.parts.length ? <p className="text-sm text-fg-3">Check cuts to see where the video will be cut, or start the split.</p>
              : <div className="space-y-2">{project.parts.map((part) => <div key={part.n} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                <span className="w-16 font-semibold">Part {part.n}</span>
                <span className="font-mono text-xs text-fg-2 tabular-nums">{formatDuration(part.start)} → {formatDuration(part.end)}</span>
                <span className="text-xs text-fg-3">{formatDuration(part.end - part.start)} · {CUT_LABEL[part.cut]}</span>
                {part.url && <Button variant="ghost" className="ml-auto !h-8 !px-2 text-xs" onClick={() => void download(part.n)}><Download size={14} /> Download</Button>}
              </div>)}</div>}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="space-y-4 rounded-xl border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold">Parts</h2>
            <Field label="Each part"><Select value={String(project.partMinutes)} onChange={(value) => change({ partMinutes: Number(value) })}>
              {MINUTES.map((minutes) => <SelectOption key={minutes} value={String(minutes)} label={`${minutes} min`} />)}
            </Select></Field>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Smart cut<span className="block text-xs text-fg-3">When time is up mid-sentence, wait for the next pause.</span></span><Switch checked={project.smartCut} onChange={(checked) => change({ smartCut: checked })} /></label>
            {project.smartCut && <Field label="Wait at most"><Select value={String(project.smartCutSeconds)} onChange={(value) => change({ smartCutSeconds: Number(value) })}>
              {EXTRA_SECONDS.map((seconds) => <SelectOption key={seconds} value={String(seconds)} label={`${seconds} s`} />)}
            </Select></Field>}
          </section>
          <section className="space-y-4 rounded-xl border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold">Frame</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ratio"><Select value={project.aspectRatio} onChange={(value) => change({ aspectRatio: value as SplitterProject["aspectRatio"] })}>
                <SelectOption value="original" label="Original" />
                {["16:9", "9:16", "1:1"].map((ratio) => <SelectOption key={ratio} value={ratio} label={ratio} />)}
              </Select></Field>
              <Field label="Fill"><Select value={project.fitMode} disabled={project.aspectRatio === "original"} onChange={(value) => change({ fitMode: value as SplitterProject["fitMode"] })}>
                <SelectOption value="blur" label="Blur background" />
                <SelectOption value="bars" label="Black bars" />
                <SelectOption value="cover" label="Crop to fill" />
              </Select></Field>
            </div>
            <Field label="Quality"><Select value={project.quality} onChange={(value) => change({ quality: value as SplitterProject["quality"] })}>
              <SelectOption value="1080" label="1080p — best" />
              <SelectOption value="720" label="720p — faster" />
              <SelectOption value="480" label="480p — fastest" />
            </Select></Field>
          </section>
          <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold">Text and part number</h2>
            <p className="text-xs text-fg-3">Drag each one in the preview to place it.</p>
            <Field label="Text box"><div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2">
              <Input value={project.textValue} maxLength={300} placeholder="Shown on every part" onChange={(event) => change({ textValue: event.target.value })} />
              <Select value={String(project.textSize)} onChange={(value) => change({ textSize: Number(value) })}>
                {TEXT_SIZES.map((size) => <SelectOption key={size} value={String(size)} label={`${size}%`} />)}
              </Select>
            </div></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opacity"><Select value={String(project.textOpacity)} onChange={(value) => change({ textOpacity: Number(value) })}>
                {OPACITIES.map((opacity) => <SelectOption key={opacity} value={String(opacity)} label={`${Math.round(opacity * 100)}%`} />)}
              </Select></Field>
              <label className="flex items-end justify-between gap-3 pb-2 text-sm">Dark box<Switch checked={project.textBox} onChange={(checked) => change({ textBox: checked })} /></label>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">Part number<Switch checked={project.partNumberEnabled} onChange={(checked) => change({ partNumberEnabled: checked })} /></label>
            {project.partNumberEnabled && <Field label="Label"><div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2">
              <Input value={project.partNumberTemplate} maxLength={300} onChange={(event) => change({ partNumberTemplate: event.target.value })} />
              <Select value={String(project.partNumberSize)} onChange={(value) => change({ partNumberSize: Number(value) })}>
                {TEXT_SIZES.map((size) => <SelectOption key={size} value={String(size)} label={`${size}%`} />)}
              </Select>
            </div></Field>}
            {project.partNumberEnabled && <p className="text-xs text-fg-3">{"{n}"} = 1, 2, 3 · {"{mm}"} = ၁, ၂, ၃ · {"{total}"} = how many parts. e.g. “အပိုင်း {"{mm}"}/{"{total}"}”.</p>}
          </section>
        </aside>
      </div>
    </Wrap></Body>
  </>;
}
