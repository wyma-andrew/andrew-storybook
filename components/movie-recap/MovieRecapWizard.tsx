"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Pause, Play, Trash2, Upload } from "lucide-react";
import { Input, Select, SelectOption, Switch, toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import type { MovieRecapProject, MovieRecapProjectPatch } from "@/lib/api/types";
import {
  MOVIE_RECAP_ASPECT_RATIOS,
  MOVIE_RECAP_LANGUAGES,
  MOVIE_RECAP_LOGO_PLACEMENTS,
  MOVIE_RECAP_SUBTITLE_MODES,
  MOVIE_RECAP_VOICES,
} from "@/lib/constants/movie-recap";
import { clampBlurRect, formatBytes, formatDuration } from "@/lib/movie-recap";
import { useRead, useWrite } from "@/lib/spoosh";
import { MovieRecapPreview } from "./MovieRecapPreview";
import { MovieRecapSource } from "./MovieRecapSource";

const STEP_NAMES = ["Add Source", "Project Settings", "Customize Video", "Review"];
type CustomizeTab = "aspect" | "subtitle" | "logo" | "blur";

function ChoiceButton({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className={`relative !h-auto min-h-20 !justify-start !rounded-xl !px-4 !py-3 !text-left ${selected ? "!border-accent !bg-accent-dim !text-fg" : "!border-line !bg-panel-2 !text-fg"}`}
    >
      {children}
      {selected && <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent"><Check size={12} /></span>}
    </Button>
  );
}

export function MovieRecapWizard({ projectId }: { projectId?: string }) {
  const { data, loading, error } = useRead(
    (api) => api("movie-recaps/:id").GET({ params: { id: projectId ?? "" } }),
    { enabled: Boolean(projectId) }
  );

  if (loading && !data) return <><TopBar><div className="text-[19px] font-medium">Movie Recap</div></TopBar><Body><Wrap><p className="text-fg-3">Loading project…</p></Wrap></Body></>;
  if (error && !data) return <><TopBar><div className="text-[19px] font-medium">Movie Recap</div></TopBar><Body><Wrap><p className="text-danger">Couldn&apos;t load project: {error.error}</p></Wrap></Body></>;
  return <MovieRecapEditor key={data?.id ?? "new"} initialProject={data ?? null} />;
}

function MovieRecapEditor({ initialProject }: { initialProject: MovieRecapProject | null }) {
  const { trigger: updateProject, loading: saving } = useWrite((api) => api("movie-recaps/:id").PATCH());
  const { trigger: presignLogo } = useWrite((api) => api("movie-recaps/:id/logo/presign").POST());
  const { trigger: commitLogo } = useWrite((api) => api("movie-recaps/:id/logo").POST());
  const { trigger: removeLogo } = useWrite((api) => api("movie-recaps/:id/logo").DELETE());
  const [project, setProject] = useState<MovieRecapProject | null>(initialProject);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialProject?.currentStep ?? 1);
  const [maxStep, setMaxStep] = useState<1 | 2 | 3 | 4>(initialProject?.currentStep ?? 1);
  const [tab, setTab] = useState<CustomizeTab>("aspect");
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function merge(patch: Partial<MovieRecapProject>) {
    setProject((current) => current ? { ...current, ...patch } : current);
  }

  async function saveAndGo(target: 2 | 3 | 4) {
    if (!project) return;
    const body: MovieRecapProjectPatch = { currentStep: target };
    if (step === 2) {
      if (!project.name.trim()) {
        toast.error("Project name is required.");
        return;
      }
      Object.assign(body, { name: project.name, outputLanguage: project.outputLanguage, voiceProfileId: project.voiceProfileId });
    }
    if (step === 3) {
      if (project.logoEnabled && !project.logoUrl) {
        toast.error("Upload a brand logo or turn Add Logo off.");
        return;
      }
      Object.assign(body, {
        aspectRatio: project.aspectRatio,
        subtitleMode: project.subtitleMode,
        logoEnabled: project.logoEnabled,
        logoPlacement: project.logoPlacement,
        logoOpacity: project.logoOpacity,
        blurEnabled: project.blurEnabled,
        blurX: project.blurX,
        blurY: project.blurY,
        blurWidth: project.blurWidth,
        blurHeight: project.blurHeight,
        copyrightFree: project.copyrightFree,
      });
    }
    const result = await updateProject({ params: { id: project.id }, body });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not save the project.");
      return;
    }
    setProject(result.data);
    setStep(target);
    setMaxStep((current) => Math.max(current, target) as 1 | 2 | 3 | 4);
  }

  async function generate() {
    if (!project) return;
    const result = await updateProject({
      params: { id: project.id },
      body: { status: "ready_for_generation", currentStep: 4 },
    });
    if (result.error || !result.data) toast.error(result.error?.error ?? "Could not mark the project ready.");
    else {
      setProject(result.data);
      toast.success("Configuration saved. Recap processing will be added in phase 2.");
    }
  }

  async function uploadLogo(file: File) {
    if (!project) return;
    setLogoBusy(true);
    try {
      const signed = await presignLogo({
        params: { id: project.id },
        body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
      });
      if (signed.error || !signed.data) throw new Error(signed.error?.error ?? "Could not start logo upload.");
      const response = await fetch(signed.data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": signed.data.contentType } });
      if (!response.ok) throw new Error(`Logo upload failed (${response.status}).`);
      const committed = await commitLogo({
        params: { id: project.id },
        body: {
          fileName: signed.data.fileName,
          objectKey: signed.data.objectKey,
          url: signed.data.url,
          contentType: signed.data.contentType,
          sizeBytes: file.size,
        },
      });
      if (committed.error || !committed.data) throw new Error(committed.error?.error ?? "Could not save the logo.");
      setProject(committed.data);
      toast.success("Logo uploaded.");
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Could not upload the logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  const { openFilePicker: openLogoPicker } = useFilePicker<HTMLDivElement>({
    accept: "image/png,image/jpeg,image/webp",
    onChange: (_files, newFiles) => {
      if (newFiles[0]) void uploadLogo(newFiles[0]);
    },
  });

  async function deleteLogo() {
    if (!project) return;
    const result = await removeLogo({ params: { id: project.id } });
    if (result.error || !result.data) toast.error(result.error?.error ?? "Could not remove the logo.");
    else setProject(result.data);
  }

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => toast.error("Narrator preview audio is not available yet."));
    else audio.pause();
  }

  const blur = project ? { x: project.blurX, y: project.blurY, width: project.blurWidth, height: project.blurHeight } : { x: 35, y: 40, width: 30, height: 20 };
  const videoUrl = localVideoUrl ?? project?.sourceUrl ?? null;

  return (
    <>
      <TopBar><Crumb><Link href="/movie-recap">Movie Recap</Link> / <span className="text-fg">{project?.name ?? "New project"}</span></Crumb></TopBar>
      <Body>
        <Wrap wide>
          <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEP_NAMES.map((name, index) => {
              const number = (index + 1) as 1 | 2 | 3 | 4;
              const active = step === number;
              const available = number <= maxStep;
              return (
                <Button key={name} disabled={!available} onClick={() => available && setStep(number)} className={`!h-auto !justify-start !rounded-lg !px-3 !py-2.5 ${active ? "!border-accent !bg-accent-dim !text-fg" : "!border-line !text-fg-2"}`}>
                  <span className={`mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${active ? "bg-accent text-on-accent" : "bg-chip text-fg-2"}`}>{number}</span>
                  <span className="truncate text-xs sm:text-sm">{name}</span>
                </Button>
              );
            })}
          </div>

          {step === 1 && <MovieRecapSource project={project} onProject={(next, preview) => { setProject(next); setLocalVideoUrl(preview ?? null); }} />}

          {step === 2 && project && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Project Settings</h2><p className="mb-6 text-sm text-fg-2">Name the project and choose its narration.</p>
              <Field label="Project name"><Input value={project.name} onChange={(event) => merge({ name: event.target.value })} maxLength={200} /></Field>
              <Field label="Output language"><Select value={project.outputLanguage} onChange={(value) => merge({ outputLanguage: value })}>{MOVIE_RECAP_LANGUAGES.map((item) => <SelectOption key={item.id} value={item.id} label={item.name} />)}</Select></Field>
              <div className="mb-6"><div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-3">Voice profile</div>
                {MOVIE_RECAP_VOICES.map((voice) => (
                  <div key={voice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${project.voiceProfileId === voice.id ? "border-accent bg-accent-dim" : "border-line bg-panel-2"}`}>
                    <Button aria-label={playing ? "Pause voice preview" : "Play voice preview"} onClick={toggleAudio} className="!h-9 !w-9 shrink-0 !rounded-full !border-0 !bg-accent !p-0 !text-on-accent">{playing ? <Pause size={15} /> : <Play size={15} />}</Button>
                    <Button onClick={() => merge({ voiceProfileId: voice.id })} className="relative !h-auto min-w-0 flex-1 !justify-start !border-0 !bg-transparent !p-0 !text-left !text-fg">
                      <span><span className="block text-sm font-semibold">{voice.name}</span><span className="mt-1 block whitespace-normal text-xs text-fg-2">{voice.sampleText}</span></span>
                      {project.voiceProfileId === voice.id && <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10px] text-on-accent"><Check size={11} /> Selected</span>}
                    </Button>
                  </div>
                ))}
                <audio ref={audioRef} src={MOVIE_RECAP_VOICES[0].previewUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              </div>
            </div>
          )}

          {step === 3 && project && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Customize Video</h2><p className="mb-6 text-sm text-fg-2">Preview how framing and overlays will be applied in phase 2.</p>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
                <MovieRecapPreview project={project} videoUrl={videoUrl} blur={blur} onBlurChange={(rect) => merge({ blurX: rect.x, blurY: rect.y, blurWidth: rect.width, blurHeight: rect.height })} />
                <div className="rounded-xl border border-line bg-panel-2 p-4">
                  <div className="mb-5 grid grid-cols-2 gap-2">
                    {([['aspect','Aspect Ratio'],['subtitle','Subtitle'],['logo','Logo'],['blur','Blur']] as const).map(([id, label]) => <Button key={id} onClick={() => setTab(id)} className={tab === id ? "!border-accent !bg-accent-dim !text-fg" : ""}>{label}</Button>)}
                  </div>
                  {tab === "aspect" && <div className="grid gap-3">{MOVIE_RECAP_ASPECT_RATIOS.map((item) => <ChoiceButton key={item.id} selected={project.aspectRatio === item.id} onClick={() => merge({ aspectRatio: item.id })}><span><span className="block text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-fg-2">Centered crop preview</span></span></ChoiceButton>)}</div>}
                  {tab === "subtitle" && <div className="grid gap-3">{MOVIE_RECAP_SUBTITLE_MODES.map((item) => <ChoiceButton key={item.id} selected={project.subtitleMode === item.id} onClick={() => merge({ subtitleMode: item.id })}><span><span className="block text-sm font-semibold">{item.name}</span>{item.id === "styled" && <span className="mt-1 block whitespace-normal text-xs text-fg-2">Burned directly into the output video.</span>}</span></ChoiceButton>)}</div>}
                  {tab === "logo" && <div>
                    <label className="mb-5 flex items-center justify-between gap-3"><span><span className="block text-sm font-medium">Add Logo</span><span className="text-xs text-fg-3">Overlay a brand mark on the video.</span></span><Switch checked={project.logoEnabled} onChange={(checked) => merge({ logoEnabled: checked })} /></label>
                    {project.logoEnabled && <div>
                      <div className="mb-5"><div className="mb-2 text-xs font-medium text-fg-2">Brand logo file</div><div className="flex items-center gap-2"><LoadingButton loading={logoBusy} onClick={() => openLogoPicker({ multiple: false })}><Upload size={15} /> Upload logo</LoadingButton>{project.logoUrl && <Button variant="danger" onClick={deleteLogo}><Trash2 size={15} /> Remove</Button>}</div>{project.logoFileName && <p className="mt-2 truncate text-xs text-fg-3">{project.logoFileName} · {formatBytes(project.logoSizeBytes ?? 0)}</p>}</div>
                      <div className="mb-5"><div className="mb-2 text-xs font-medium text-fg-2">Logo placement</div><div className="grid grid-cols-2 gap-2">{MOVIE_RECAP_LOGO_PLACEMENTS.map((item) => <Button key={item.id} onClick={() => merge({ logoPlacement: item.id })} className={project.logoPlacement === item.id ? "!border-accent !bg-accent-dim !text-fg" : ""}>{item.name}</Button>)}</div></div>
                      <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-fg-2"><span>Logo opacity</span><span>{project.logoOpacity}%</span></span><input aria-label="Logo opacity" type="range" min={0} max={100} value={project.logoOpacity} onChange={(event) => merge({ logoOpacity: Number(event.target.value) })} className="w-full accent-accent" /></label>
                    </div>}
                  </div>}
                  {tab === "blur" && <div>
                    <label className="mb-5 flex items-center justify-between gap-3"><span><span className="block text-sm font-medium">Blur</span><span className="text-xs text-fg-3">Drag the area directly in the preview.</span></span><Switch checked={project.blurEnabled} onChange={(checked) => merge({ blurEnabled: checked })} /></label>
                    {project.blurEnabled && <div className="space-y-5">
                      <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-fg-2"><span>Width</span><span>{Math.round(project.blurWidth)}%</span></span><input aria-label="Blur width" type="range" min={5} max={100} value={project.blurWidth} onChange={(event) => { const rect = clampBlurRect({ ...blur, width: Number(event.target.value) }); merge({ blurX: rect.x, blurY: rect.y, blurWidth: rect.width, blurHeight: rect.height }); }} className="w-full accent-accent" /></label>
                      <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-fg-2"><span>Height</span><span>{Math.round(project.blurHeight)}%</span></span><input aria-label="Blur height" type="range" min={5} max={100} value={project.blurHeight} onChange={(event) => { const rect = clampBlurRect({ ...blur, height: Number(event.target.value) }); merge({ blurX: rect.x, blurY: rect.y, blurWidth: rect.width, blurHeight: rect.height }); }} className="w-full accent-accent" /></label>
                    </div>}
                  </div>}
                </div>
              </div>
              <label className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-line bg-panel-2 p-4"><span><span className="block font-medium">Make Copyright Free</span><span className="text-sm text-fg-3">Saved for phase 2; no transformation is performed yet.</span></span><Switch checked={project.copyrightFree} onChange={(checked) => merge({ copyrightFree: checked })} /></label>
            </div>
          )}

          {step === 4 && project && <Review project={project} onGenerate={generate} saving={saving} />}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            {step > 1 ? <Button onClick={() => setStep((step - 1) as 1 | 2 | 3)}><ChevronLeft size={16} /> Back</Button> : <span />}
            {step === 1 && <LoadingButton variant="primary" disabled={project?.sourceUploadStatus !== "ready"} loading={saving} onClick={() => saveAndGo(2)}>Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 2 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(3)}>Save & Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 3 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(4)}>Save & Continue <ChevronRight size={16} /></LoadingButton>}
          </div>
        </Wrap>
      </Body>
    </>
  );
}

function Review({ project, onGenerate, saving }: { project: MovieRecapProject; onGenerate: () => void; saving: boolean }) {
  const rows = [
    ["Source", project.sourceFileName], ["File size", formatBytes(project.sourceSizeBytes)], ["Duration", formatDuration(project.sourceDurationSeconds)],
    ["Project name", project.name], ["Output language", "Burmese"], ["Voice profile", "Narrator"], ["Aspect ratio", project.aspectRatio],
    ["Subtitles", MOVIE_RECAP_SUBTITLE_MODES.find((item) => item.id === project.subtitleMode)?.name ?? project.subtitleMode],
    ["Logo", project.logoEnabled ? `${project.logoFileName ?? "Missing"} · ${MOVIE_RECAP_LOGO_PLACEMENTS.find((item) => item.id === project.logoPlacement)?.name} · ${project.logoOpacity}%` : "Off"],
    ["Blur", project.blurEnabled ? `${Math.round(project.blurWidth)}% × ${Math.round(project.blurHeight)}% at ${Math.round(project.blurX)}%, ${Math.round(project.blurY)}%` : "Off"],
    ["Make Copyright Free", project.copyrightFree ? "On" : "Off"],
  ];
  return <div><h2 className="mb-1 text-lg font-semibold">Review Configuration</h2><p className="mb-6 text-sm text-fg-2">Confirm the settings that phase 2 will use.</p>
    <div className="overflow-hidden rounded-xl border border-line bg-panel-2"><table className="w-full border-collapse"><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-line last:border-0"><th className="w-1/3 px-4 py-3 text-left text-xs font-medium text-fg-3">{label}</th><td className="px-4 py-3 text-sm text-fg">{value}</td></tr>)}</tbody></table></div>
    <div className="mt-6 flex flex-wrap items-center gap-3"><LoadingButton variant="primary" loading={saving} onClick={onGenerate}>Generate Recap Video</LoadingButton>{project.status === "ready_for_generation" && <span className="flex items-center gap-1.5 text-sm text-ok"><Check size={16} /> Ready for phase 2</span>}</div>
  </div>;
}
