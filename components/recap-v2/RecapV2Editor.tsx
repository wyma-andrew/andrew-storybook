"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Download, Languages, Loader2, Mic, Play, Plus, RotateCcw, Save, Scissors, Sparkles, Trash2, Volume2, VolumeX } from "lucide-react";
import { ConfirmDialog, Select, SelectOption, Switch, Textarea, toast } from "@geckoui/geckoui";
import { Button, LinkButton, LoadingButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { apiClient, useRead, useWrite } from "@/lib/spoosh";
import { formatDuration } from "@/lib/movie-recap";
import { formatUnitTime, RECAP_V2_STALE_JOB_MS, type RecapV2JobKind, type RecapV2Project, type RecapV2ProjectPatch } from "@/lib/recap-v2";
import { clampTranslateRect, type TranslateRect } from "@/lib/translate";
import { listVoices } from "@/lib/tts/voices";
import { RecapV2OutputPreview } from "@/components/recap-v2/RecapV2OutputPreview";

const SETTING_KEYS = ["voiceId", "aspectRatio", "fitMode", "zoom", "mirror", "subtitlesEnabled", "shortPauses", "subtitleY", "subtitleSize", "blurRegions"] as const;
const VOICES = listVoices("movie-recap");
const ZOOMS = [1, 1.05, 1.1, 1.15, 1.2, 1.25];
const SUBTITLE_SIZES = [2.6, 3, 3.4, 4, 4.6, 5.4];
const STEPS = [
  { kind: "transcribe", label: "Transcribe Chinese", icon: Mic },
  { kind: "translate", label: "Translate to Burmese", icon: Languages },
  { kind: "render", label: "Render Smart Sync", icon: Sparkles },
] as const;

function JobProgress({ stage, fraction }: { stage: string | null; fraction: number | null }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.floor((now - startedAt) / 1000);
  return <div className="mt-2">
    <div className="mb-1 flex items-baseline gap-2 text-xs text-fg-2">
      <span className="min-w-0 flex-1 truncate">{stage ?? "Starting…"}</span>
      <span className="shrink-0 font-mono tabular-nums text-fg-3">{fraction == null ? "" : `${Math.round(fraction * 100)}% · `}{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
      {fraction == null
        ? <div className="h-full w-full animate-pulse bg-accent/60" />
        : <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }} />}
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">{label}</span>{children}</div>;
}

export function RecapV2Editor({ projectId }: { projectId: string }) {
  const { data, error } = useRead((api) => api("recap-v2-projects/:id").GET({ params: { id: projectId } }));
  const { trigger: poll } = useRead((api) => api("recap-v2-projects/:id").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: pollProgress } = useRead((api) => api("recap-v2-projects/:id/progress").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: patch, loading: saving } = useWrite((api) => api("recap-v2-projects/:id").PATCH());
  const { trigger: transcribe } = useWrite((api) => api("recap-v2-projects/:id/transcribe").POST());
  const { trigger: resplit } = useWrite((api) => api("recap-v2-projects/:id/resplit").POST());
  const { trigger: translate } = useWrite((api) => api("recap-v2-projects/:id/translate").POST());
  const { trigger: render } = useWrite((api) => api("recap-v2-projects/:id/render").POST());
  const [server, setServer] = useState<RecapV2Project | null>(null);
  const [settings, setSettings] = useState<Partial<RecapV2Project>>({});
  const [lineEdits, setLineEdits] = useState<Record<number, string>>({});
  const [lineMutes, setLineMutes] = useState<Record<number, boolean>>({});
  const [selectedBlur, setSelectedBlur] = useState<number | null>(null);
  const [view, setView] = useState<"output" | "result">("output");
  const [seekRequest, setSeekRequest] = useState<{ seconds: number; nonce: number } | null>(null);

  const base = server ?? data ?? null;
  const project = base ? { ...base, ...settings, units: base.units.map((unit) => unit.id in lineMutes ? { ...unit, muted: lineMutes[unit.id] } : unit) } : null;
  const settingsDirty = Object.keys(settings).length > 0;
  const linesDirty = Object.keys(lineEdits).length > 0 || Object.keys(lineMutes).length > 0;
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
      if (Date.now() - Date.parse(progress.updatedAt) >= RECAP_V2_STALE_JOB_MS) window.clearInterval(interval);
      setServer((current) => {
        const latest = current ?? data ?? null;
        return latest?.jobStatus === "running" ? { ...latest, ...progress } : current;
      });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [running, data, poll, pollProgress]);

  const translatedCount = useMemo(() => project?.units.filter((unit) => unit.muted || (lineEdits[unit.id] ?? unit.text).trim()).length ?? 0, [project?.units, lineEdits]);

  if (error) return <Body><Wrap><p className="text-danger">{error.error}</p></Wrap></Body>;
  if (!project || !base) return <Body><Wrap><p className="text-fg-3">Loading project…</p></Wrap></Body>;

  function change(next: Partial<RecapV2Project>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function changeBlur(index: number, rect: TranslateRect) {
    change({ blurRegions: project!.blurRegions.map((item, i) => i === index ? clampTranslateRect(rect) : item) });
  }

  async function save() {
    if (!settingsDirty && !linesDirty) return base;
    const body: RecapV2ProjectPatch = {};
    for (const key of SETTING_KEYS) if (key in settings) Object.assign(body, { [key]: settings[key] });
    if (Object.keys(lineEdits).length) body.unitTexts = Object.entries(lineEdits).map(([id, text]) => ({ id: Number(id), text }));
    if (Object.keys(lineMutes).length) body.unitMutes = Object.entries(lineMutes).map(([id, muted]) => ({ id: Number(id), muted }));
    const result = await patch({ params: { id: projectId }, body });
    if (!result.data) { toast.error(result.error?.error ?? "Could not save."); return null; }
    setServer(result.data);
    setSettings({});
    setLineEdits({});
    setLineMutes({});
    return result.data;
  }

  async function runJob(kind: RecapV2JobKind, resplitOnly = false) {
    const saved = await save();
    if (!saved) return;
    setServer({ ...saved, jobKind: kind, jobStatus: "running", jobStage: null, jobProgress: 0, jobError: null });
    const trigger = resplitOnly ? resplit : kind === "transcribe" ? transcribe : kind === "translate" ? translate : render;
    const result = await trigger({ params: { id: projectId } });
    if (result.data) {
      setServer(result.data);
      if (kind === "render") setView("result");
      toast.success(kind === "transcribe" ? `${result.data.units.length} lines found.` : kind === "translate" ? "Translation ready." : "Recap rendered.");
    } else {
      toast.error(result.error?.error ?? "The step failed.");
      const latest = await poll({ force: true });
      if (latest.data) setServer(latest.data);
    }
  }

  function confirmRun(kind: "transcribe" | "translate") {
    const hasWork = kind === "transcribe" ? project!.units.length > 0 : project!.units.some((unit) => unit.text.trim());
    if (!hasWork) { void runJob(kind); return; }
    ConfirmDialog.show({
      title: kind === "transcribe" ? "Transcribe again?" : "Translate again?",
      content: kind === "transcribe" ? "All lines and their Burmese narration will be replaced." : "Every Burmese line, including your edits, will be replaced.",
      confirmButtonLabel: kind === "transcribe" ? "Transcribe" : "Translate",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => { dismiss(); void runJob(kind); },
    });
  }

  function confirmResplit() {
    ConfirmDialog.show({
      title: "Re-split lines?",
      content: "Lines are rebuilt from the saved speech transcript with the current splitting rules — no new listening cost. All Burmese narration and the render are replaced; translate again afterwards.",
      confirmButtonLabel: "Re-split",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => { dismiss(); void runJob("transcribe", true); },
    });
  }

  async function download() {
    const result = await apiClient("recap-v2-projects/:id/render/download").GET({ params: { id: projectId } });
    if (!result.data) { toast.error(result.error?.error ?? "Download unavailable."); return; }
    const anchor = document.createElement("a");
    anchor.href = result.data.url;
    anchor.click();
  }

  function seek(seconds: number) {
    setView("output");
    setSeekRequest((current) => ({ seconds, nonce: (current?.nonce ?? 0) + 1 }));
  }

  const shownView = view === "result" && !project.renderOutputUrl ? "output" : view;
  const stepDone = { transcribe: project.units.length > 0, translate: project.units.length > 0 && translatedCount === project.units.length };

  return <>
    <TopBar>
      <LinkButton variant="ghost" href="/recap-v2"><ChevronLeft size={16} /> Recap V2</LinkButton><span className="text-fg-3">/</span>
      <span className="min-w-0 truncate font-medium">{project.name}</span>
      <div className="ml-auto flex gap-2">
        {(settingsDirty || linesDirty) && <LoadingButton loading={saving} disabled={running} onClick={() => void save()}><Save size={16} /> Save</LoadingButton>}
        {project.renderOutputUrl && <Button onClick={() => void download()}><Download size={16} /><span className="hidden sm:inline">Download</span></Button>}
      </div>
    </TopBar>
    <Body><Wrap wide>
      {project.sourceUploadStatus !== "ready" && <p className="mb-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg-2">This video has not finished uploading. Open <LinkButton variant="ghost" href="/recap-v2/new">New project</LinkButton> and reselect the same file to resume.</p>}
      <ol className="mb-5 grid gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => {
          const enabled = step.kind === "transcribe" ? project.sourceUploadStatus === "ready" : step.kind === "translate" ? stepDone.transcribe : stepDone.translate;
          const done = step.kind === "transcribe" ? stepDone.transcribe : step.kind === "translate" ? stepDone.translate : Boolean(project.renderOutputUrl);
          const next = !done && enabled;
          const active = running && project.jobKind === step.kind;
          const failed = !running && project.jobStatus === "failed" && project.jobKind === step.kind && project.jobError;
          const summary = step.kind === "transcribe" ? (project.units.length ? `${project.units.length} lines` : "Find the Chinese speech")
            : step.kind === "translate" ? (project.units.length ? `${translatedCount}/${project.units.length} translated` : "Burmese narration per line")
            : project.renderOutputUrl ? "Recap ready" : "Narration + retimed picture";
          return <li key={step.kind} className={`flex flex-col rounded-xl border bg-panel p-4 ${active ? "border-accent" : failed ? "border-danger" : next ? "border-line-2" : "border-line"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? "bg-accent text-panel" : active || next ? "border-2 border-accent text-accent" : "border border-line-2 text-fg-3"}`}>
                {active ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><step.icon size={14} className="shrink-0 text-fg-3" /> {step.label}</p>
                <p className="truncate text-xs text-fg-3">{summary}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button className="!h-8 text-xs" variant={next && !running ? "primary" : "secondary"} disabled={running || !enabled}
                onClick={() => step.kind === "render" ? void runJob("render") : confirmRun(step.kind)}>
                {done ? <RotateCcw size={14} /> : <Play size={14} />} {done ? "Run again" : "Run"}
              </Button>
              {step.kind === "transcribe" && stepDone.transcribe && <Button variant="ghost" className="!h-8 !px-2 text-xs" disabled={running} onClick={confirmResplit}><Scissors size={14} /> Re-split</Button>}
            </div>
            {active && <JobProgress stage={project.jobStage} fraction={project.jobProgress} />}
            {failed && <p className="mt-2 text-xs break-words text-danger">{project.jobError}</p>}
          </li>;
        })}
      </ol>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-2">
            <Button variant={shownView === "output" ? "primary" : "secondary"} className="!h-8 text-xs" onClick={() => setView("output")}>Output preview</Button>
            {project.renderOutputUrl && <Button variant={shownView === "result" ? "primary" : "secondary"} className="!h-8 text-xs" onClick={() => setView("result")}>Recap</Button>}
          </div>
          {shownView === "result"
            ? <video key={project.renderOutputUrl} src={project.renderOutputUrl!} controls playsInline className="mx-auto block max-h-[70vh] w-full rounded-lg bg-black" />
            : <RecapV2OutputPreview project={project} selectedBlur={selectedBlur} onSelectBlur={setSelectedBlur} onBlurChange={changeBlur}
              onSubtitleY={(subtitleY) => change({ subtitleY })} seekRequest={seekRequest} />}

          <div className="mt-6">
            <div className="mb-3 flex items-baseline gap-2"><h2 className="text-base font-semibold">Lines</h2><span className="text-xs text-fg-3">{project.units.length ? `${translatedCount}/${project.units.length} translated · ${formatDuration(project.sourceDurationSeconds)} source` : "Transcribe the video to split it into lines."}</span></div>
            <div className="space-y-2">
              {project.units.map((unit) => <div key={unit.id} className={`grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[72px_minmax(0,1fr)] ${unit.muted ? "bg-panel-2" : "bg-panel"}`}>
                <div className="flex items-start justify-between gap-2 sm:flex-col sm:justify-start">
                  <button type="button" className="h-fit text-left font-mono text-xs text-fg-3 hover:text-accent" onClick={() => seek(unit.videoStart)}>
                    #{unit.id}<br />{formatUnitTime(unit.videoStart)}–{formatUnitTime(unit.videoEnd)}
                  </button>
                  <Button variant="ghost" className="!h-7 !px-1.5 text-xs" disabled={running} aria-label={unit.muted ? `Restore line ${unit.id}` : `Mute line ${unit.id}`}
                    onClick={() => setLineMutes((current) => {
                      const original = base.units.find((item) => item.id === unit.id)?.muted ?? false;
                      const next = { ...current };
                      if (!unit.muted === original) delete next[unit.id]; else next[unit.id] = !unit.muted;
                      return next;
                    })}>
                    {unit.muted ? <><Volume2 size={13} /> Restore</> : <><VolumeX size={13} /> Mute</>}
                  </Button>
                </div>
                <div className="min-w-0">
                  <p className={`mb-1.5 text-sm ${unit.muted ? "text-fg-3 line-through" : "text-fg-2"}`}>{unit.source}</p>
                  {unit.muted
                    ? <p className="text-xs text-fg-3">Muted — picture plays at normal speed with no narration or caption.</p>
                    : <Textarea rows={2} value={lineEdits[unit.id] ?? unit.text} disabled={running} placeholder="Burmese narration"
                      onChange={(event) => { const text = event.target.value; setLineEdits((current) => text === unit.text ? Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== unit.id)) : { ...current, [unit.id]: text }); }} />}
                </div>
              </div>)}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">

          <section className="space-y-4 rounded-xl border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold">Output</h2>
            <Field label="Voice"><Select value={project.voiceId} onChange={(value) => change({ voiceId: value as string })}>
              {VOICES.map((voice) => <SelectOption key={voice.id} value={voice.id} label={voice.name} />)}
            </Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aspect"><Select value={project.aspectRatio} onChange={(value) => change({ aspectRatio: value as RecapV2Project["aspectRatio"] })}>
                {["16:9", "9:16", "1:1"].map((ratio) => <SelectOption key={ratio} value={ratio} label={ratio} />)}
              </Select></Field>
              <Field label="Fit"><Select value={project.fitMode} onChange={(value) => change({ fitMode: value as RecapV2Project["fitMode"] })}>
                <SelectOption value="contain" label="Blur fill" />
                <SelectOption value="cover" label="Crop to fill" />
              </Select></Field>
            </div>
            <Field label="Zoom"><Select value={String(project.zoom)} onChange={(value) => change({ zoom: Number(value) })}>
              {ZOOMS.map((zoom) => <SelectOption key={zoom} value={String(zoom)} label={`${zoom.toFixed(2)}×`} />)}
            </Select></Field>
            <label className="flex items-center justify-between gap-3 text-sm">Mirror<Switch checked={project.mirror} onChange={(checked) => change({ mirror: checked })} /></label>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Short pauses<span className="block text-xs text-fg-3">Trim the voice&apos;s own silence to ~0.25s between lines.</span></span><Switch checked={project.shortPauses} onChange={(checked) => change({ shortPauses: checked })} /></label>
            <label className="flex items-center justify-between gap-3 text-sm">Burmese subtitles<Switch checked={project.subtitlesEnabled} onChange={(checked) => change({ subtitlesEnabled: checked })} /></label>
            {project.subtitlesEnabled && <Field label="Text size"><Select value={String(project.subtitleSize)} onChange={(value) => change({ subtitleSize: Number(value) })}>
              {SUBTITLE_SIZES.map((size) => <SelectOption key={size} value={String(size)} label={`${size}%`} />)}
            </Select></Field>}
            {project.subtitlesEnabled && <p className="text-xs text-fg-3">Drag the subtitle in Output preview to move it · now {project.subtitleY}% height.</p>}
          </section>

          <section className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Blur areas</h2>
              <Button className="!h-8 !px-2" disabled={project.blurRegions.length >= 8} onClick={() => { change({ blurRegions: [...project.blurRegions, { x: 8, y: 78, width: 84, height: 14 }] }); setSelectedBlur(project.blurRegions.length); setView("output"); }}><Plus size={14} /> Add</Button>
            </div>
            <p className="mb-2 text-xs text-fg-3">Drag over the source&apos;s burned-in Chinese subtitles.</p>
            {project.blurRegions.map((rect, index) => <div key={index} className="mb-2 flex items-center gap-2">
              <Button variant={selectedBlur === index ? "primary" : "secondary"} className="!h-8 flex-1 !justify-start !px-2 text-xs" onClick={() => setSelectedBlur(index)}>Area {index + 1} · {Math.round(rect.width)} × {Math.round(rect.height)}%</Button>
              <Button variant="ghost" className="!h-8 !px-2" aria-label={`Remove blur area ${index + 1}`} onClick={() => { change({ blurRegions: project.blurRegions.filter((_, i) => i !== index) }); setSelectedBlur(null); }}><Trash2 size={14} /></Button>
            </div>)}
          </section>
        </aside>
      </div>
    </Wrap></Body>
  </>;
}
