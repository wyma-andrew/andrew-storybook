"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Copy, Download, FileText, Film, Loader2, Mic, RotateCcw } from "lucide-react";
import { ConfirmDialog, toast } from "@geckoui/geckoui";
import { Button, LinkButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { formatDuration } from "@/lib/movie-recap";
import { useRead, useWrite } from "@/lib/spoosh";
import { TRANSCRIPT_STALE_JOB_MS, type TranscriptProject } from "@/lib/transcript-project";

function Elapsed() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  return <span className="font-mono tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
}

export function TranscriptEditor({ projectId }: { projectId: string }) {
  const { data, error } = useRead((api) => api("transcript-projects/:id").GET({ params: { id: projectId } }));
  const { trigger: poll } = useRead((api) => api("transcript-projects/:id").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: pollProgress } = useRead((api) => api("transcript-projects/:id/progress").GET({ params: { id: projectId } }), { enabled: false });
  const { trigger: transcribe } = useWrite((api) => api("transcript-projects/:id/transcribe").POST());
  const [server, setServer] = useState<TranscriptProject | null>(null);
  const [tab, setTab] = useState<"video" | "transcript" | null>(null);
  const project = server ?? data ?? null;
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
      if (Date.now() - Date.parse(progress.updatedAt) >= TRANSCRIPT_STALE_JOB_MS) window.clearInterval(interval);
      setServer((current) => {
        const latest = current ?? data ?? null;
        return latest?.jobStatus === "running" ? { ...latest, ...progress } : current;
      });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [running, data, poll, pollProgress]);

  if (error) return <Body><Wrap><p className="text-danger">{error.error}</p></Wrap></Body>;
  if (!project) return <Body><Wrap><p className="text-fg-3">Loading project…</p></Wrap></Body>;

  const shownTab = tab ?? (project.transcriptText ? "transcript" : "video");

  async function run() {
    setServer({ ...project!, jobStatus: "running", jobStage: null, jobError: null });
    const result = await transcribe({ params: { id: projectId } });
    if (result.data) {
      setServer(result.data);
      setTab("transcript");
      toast.success("Transcript ready.");
    } else {
      toast.error(result.error?.error ?? "Transcription failed.");
      const latest = await poll({ force: true });
      if (latest.data) setServer(latest.data);
    }
  }

  function confirmRun() {
    if (!project!.transcriptText) { void run(); return; }
    ConfirmDialog.show({
      title: "Transcribe again?",
      content: "The current transcript will be replaced.",
      confirmButtonLabel: "Transcribe",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => { dismiss(); void run(); },
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(project!.transcriptText ?? "");
    toast.success("Transcript copied.");
  }

  function download() {
    const url = URL.createObjectURL(new Blob([project!.transcriptText ?? ""], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project!.name}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <TopBar>
      <LinkButton variant="ghost" href="/transcript"><ChevronLeft size={16} /> Transcript</LinkButton><span className="text-fg-3">/</span>
      <span className="min-w-0 truncate font-medium">{project.name}</span>
    </TopBar>
    <Body><Wrap>
      {project.sourceUploadStatus !== "ready" && <p className="mb-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg-2">This video has not finished uploading. Open <LinkButton variant="ghost" href="/transcript/new">New project</LinkButton> and reselect the same file to resume.</p>}

      <section className={`mb-5 rounded-xl border bg-panel p-4 ${running ? "border-accent" : project.jobStatus === "failed" ? "border-danger" : "border-line"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Burmese speech to text</p>
            <p className="text-xs text-fg-3">{formatDuration(project.sourceDurationSeconds)} video · Whisper large-v3</p>
          </div>
          <Button variant={project.transcriptText ? "secondary" : "primary"} disabled={running || project.sourceUploadStatus !== "ready"} onClick={confirmRun}>
            {running ? <Loader2 size={16} className="animate-spin" /> : project.transcriptText ? <RotateCcw size={16} /> : <Mic size={16} />}
            {running ? "Transcribing…" : project.transcriptText ? "Transcribe again" : "Transcribe"}
          </Button>
        </div>
        {running && <div className="mt-3">
          <div className="mb-1 flex items-baseline gap-2 text-xs text-fg-2"><span className="min-w-0 flex-1 truncate">{project.jobStage ?? "Starting…"}</span><span className="shrink-0 text-fg-3"><Elapsed /></span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full w-full animate-pulse bg-accent/60" /></div>
        </div>}
        {!running && project.jobStatus === "failed" && project.jobError && <p className="mt-3 text-xs break-words text-danger">{project.jobError}</p>}
      </section>

      <div className="mb-3 flex gap-2">
        <Button variant={shownTab === "video" ? "primary" : "secondary"} className="!h-8 text-xs" onClick={() => setTab("video")}><Film size={14} /> Video</Button>
        {project.transcriptText && <Button variant={shownTab === "transcript" ? "primary" : "secondary"} className="!h-8 text-xs" onClick={() => setTab("transcript")}><FileText size={14} /> Transcript</Button>}
      </div>

      {shownTab === "video" || !project.transcriptText
        ? <video src={project.sourceUrl ?? undefined} controls playsInline preload="metadata" className="mx-auto block max-h-[70vh] w-full rounded-lg bg-black" />
        : <section className="rounded-xl border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="flex-1 text-xs text-fg-3">{project.transcriptText.length.toLocaleString()} characters</span>
            <Button className="!h-8 text-xs" onClick={() => void copy()}><Copy size={14} /> Copy</Button>
            <Button className="!h-8 text-xs" onClick={download}><Download size={14} /> .txt</Button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-4 py-3 text-[15px] leading-8 whitespace-pre-wrap select-text">{project.transcriptText}</div>
        </section>}
    </Wrap></Body>
  </>;
}
