"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import Link from "next/link";
import { Captions, Check, ChevronLeft, ChevronRight, Copy, Crop, Droplet, Loader2, Pause, Play, RectangleHorizontal, RectangleVertical, Sparkles, Stamp, Trash2, Upload } from "lucide-react";
import { Input, Select, SelectOption, Switch, toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import type { MovieRecapProject, MovieRecapProjectPatch } from "@/lib/api/types";
import {
  MOVIE_RECAP_ASPECT_RATIOS,
  MOVIE_RECAP_ZOOM,
  MOVIE_RECAP_FIT_MODES,
  MOVIE_RECAP_LANGUAGES,
  MOVIE_RECAP_LOGO_PLACEMENTS,
  MOVIE_RECAP_SUBTITLE_PRESETS,
  MOVIE_RECAP_SUBTITLE_SIZE_PCT,
  effectiveMovieRecapZoom,
  MOVIE_RECAP_SUBTITLE_POSITIONS,
  MOVIE_RECAP_VOICES,
} from "@/lib/constants/movie-recap";
import { copyText } from "@/lib/copy";
import { clampBlurRect, formatBytes, formatDuration } from "@/lib/movie-recap";
import { audioUrlFromBase64 } from "@/lib/tts/audio-url";
import { useRead, useWrite } from "@/lib/spoosh";
import { MovieRecapPreview } from "./MovieRecapPreview";
import { MovieRecapRenderPlayer } from "./MovieRecapRenderPlayer";
import { MovieRecapRenderProgress } from "./MovieRecapRenderProgress";
import { MovieRecapSource } from "./MovieRecapSource";

const STEP_NAMES = ["Add Source", "Project Settings", "Customize Video", "Review"];

// What each step saves, as a list rather than a hand-copied object literal. The
// literal version silently dropped `fitMode` — the control worked, the value
// never left the browser, and nothing errored. `satisfies` makes a name that is
// not a patchable field a compile error, so adding a control to a step means
// adding one word here.
type PatchableField = keyof MovieRecapProjectPatch & keyof MovieRecapProject;

const STEP_2_FIELDS = ["name", "outputLanguage", "voiceProfileId"] as const satisfies readonly PatchableField[];

const STEP_3_FIELDS = [
  "aspectRatio",
  "fitMode",
  "copyrightFree",
  "copyrightZoom",
  "subtitlePreset",
  "subtitlePosition",
  "subtitleOffset",
  "logoEnabled",
  "logoPlacement",
  "logoOpacity",
  "blurEnabled",
  "blurX",
  "blurY",
  "blurWidth",
  "blurHeight",
] as const satisfies readonly PatchableField[];

function pick(project: MovieRecapProject, fields: readonly PatchableField[]) {
  return Object.fromEntries(fields.map((field) => [field, project[field]])) as MovieRecapProjectPatch;
}
// The wizard step and the customize sub-tab live in the query string, so a step
// is linkable, survives a reload, and the browser's Back button walks back
// through the wizard instead of leaving it. Slugs rather than numbers because
// `?step=customize` says what it is; the number is this list's index + 1.
const STEP_SLUGS = ["source", "settings", "customize", "review"] as const;
type StepNumber = 1 | 2 | 3 | 4;
type CustomizeTab = "aspect" | "subtitle" | "logo" | "blur";

// Icon-only tabs — the label lives in `aria-label`/`title` so the row stays one
// line at the panel's width.
const CUSTOMIZE_TABS = [
  { id: "aspect", label: "Aspect Ratio", Icon: Crop },
  { id: "subtitle", label: "Subtitle", Icon: Captions },
  { id: "logo", label: "Logo", Icon: Stamp },
  { id: "blur", label: "Blur", Icon: Droplet },
] as const satisfies readonly { id: CustomizeTab; label: string; Icon: typeof Crop }[];

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
  // The editor reads the step from the query string, which makes it a
  // useSearchParams consumer — Next needs a Suspense boundary above one, or
  // /movie-recap/new (a statically prerendered route) fails the build.
  return (
    <Suspense fallback={<><TopBar><div className="text-[19px] font-medium">Movie Recap</div></TopBar><Body><Wrap><p className="text-fg-3">Loading project…</p></Wrap></Body></>}>
      <MovieRecapEditor key={data?.id ?? "new"} initialProject={data ?? null} />
    </Suspense>
  );
}

function MovieRecapEditor({ initialProject }: { initialProject: MovieRecapProject | null }) {
  const { trigger: updateProject, loading: saving } = useWrite((api) => api("movie-recaps/:id").PATCH());
  const { trigger: presignLogo } = useWrite((api) => api("movie-recaps/:id/logo/presign").POST());
  const { trigger: commitLogo } = useWrite((api) => api("movie-recaps/:id/logo").POST());
  const { trigger: removeLogo } = useWrite((api) => api("movie-recaps/:id/logo").DELETE());
  const { trigger: renderPreview, loading: rendering } = useWrite((api) => api("movie-recaps/:id/render").POST());
  const { trigger: cancelRender, loading: cancelling } = useWrite((api) => api("movie-recaps/:id/render/cancel").POST());
  const { trigger: generateVoicePreview } = useWrite((api) => api("voices/preview").POST());
  const { trigger: pollProject } = useRead((api) => api("movie-recaps/:id").GET({ params: { id: initialProject?.id ?? "" } }), { enabled: false });
  const [project, setProject] = useState<MovieRecapProject | null>(initialProject);
  const [maxStep, setMaxStep] = useState<StepNumber>(initialProject?.currentStep ?? 1);
  // No `withDefault`: an absent `?step` has to stay distinguishable from an
  // explicit one, because with nothing in the URL the wizard opens where the
  // project was left (`currentStep`) rather than at step one.
  const [stepSlug, setStepSlug] = useQueryState("step", parseAsStringLiteral(STEP_SLUGS).withOptions({ history: "push" }));
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(CUSTOMIZE_TABS.map((item) => item.id)).withDefault("aspect"));
  // A hand-typed `?step=review` on a project that never got past step one would
  // otherwise render a step its data cannot fill, so the URL is clamped to the
  // furthest step actually reached.
  const requestedStep = (stepSlug ? STEP_SLUGS.indexOf(stepSlug) + 1 : initialProject?.currentStep ?? 1) as StepNumber;
  const step = Math.min(requestedStep, maxStep) as StepNumber;
  const setStep = (target: StepNumber) => setStepSlug(STEP_SLUGS[target - 1]);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // The voice id whose preview is currently playing, or is being synthesized.
  const [playing, setPlaying] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  // Object URLs for previews synthesized this session, so a second press
  // replays instead of asking the server again.
  const previewUrls = useRef(new Map<string, string>());

  function merge(patch: Partial<MovieRecapProject>) {
    setProject((current) => current ? { ...current, ...patch } : current);
  }

  // Zoom is seeded from the fit mode, not typed in from nothing: turning the
  // transform on, or changing the fit mode while it is on, sets the recommended
  // value. Turning it off returns to 1 (no zoom), which is also what the render
  // ignores. A hand-set zoom therefore survives everything except a fit-mode
  // change, which is the one thing the recommendation depends on.
  // Turning the transform on or off, and changing the fit mode while it is on,
  // both UNSET the zoom rather than writing a number. Unset means "use the
  // recommendation for this fit mode", so the value tracks the fit mode until
  // someone moves the slider — and once they do, it stays where they put it
  // until the fit mode changes again.
  function setCopyrightFree(enabled: boolean) {
    merge({ copyrightFree: enabled, copyrightZoom: null });
  }

  function setFitMode(fitMode: MovieRecapProject["fitMode"]) {
    if (!project) return;
    merge({ fitMode, ...(project.copyrightFree ? { copyrightZoom: null } : {}) });
  }

  // The recommendation depends on the aspect ratio as well as the fit mode, so
  // changing either one returns the zoom to unset.
  function setAspectRatio(aspectRatio: MovieRecapProject["aspectRatio"]) {
    if (!project) return;
    merge({ aspectRatio, ...(project.copyrightFree ? { copyrightZoom: null } : {}) });
  }

  async function saveAndGo(target: 2 | 3 | 4) {
    if (!project) return;
    const body: MovieRecapProjectPatch = { currentStep: target };
    if (step === 2) {
      if (!project.name.trim()) {
        toast.error("Project name is required.");
        return;
      }
      Object.assign(body, pick(project, STEP_2_FIELDS));
    }
    if (step === 3) {
      if (project.logoEnabled && !project.logoUrl) {
        toast.error("Upload a brand logo or turn Add Logo off.");
        return;
      }
      Object.assign(body, pick(project, STEP_3_FIELDS));
    }
    const result = await updateProject({ params: { id: project.id }, body });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not save the project.");
      return;
    }
    setProject(result.data);
    setMaxStep((current) => Math.max(current, target) as StepNumber);
    void setStep(target);
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

  // Phase-two-a render preview: real pipeline (Whisper transcript, AI
  // narration, hybrid duration-matched video), TTS step logged not synthesized
  // — see history/movie-recap.md. Separate from "Generate Recap Video" below,
  // which still just marks the config ready_for_generation.
  async function renderRecapPreview(mock = false) {
    if (!project) return;
    // Optimistic: the POST below doesn't resolve until the whole pipeline
    // finishes, so flip local status to "running" now — that's what starts
    // the progress-polling effect (it reads local state, not the request).
    merge({ renderStatus: "running", renderError: null, renderStage: null, renderProgressCurrent: null, renderProgressTotal: null });
    const result = await renderPreview({ params: { id: project.id }, body: { mock } });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not render the preview.");
      return;
    }
    setProject(result.data);
    if (result.data.renderStatus === "done") toast.success(mock ? "Mock preview rendered — no AI calls were made." : "Preview rendered (video only, narration audio not synthesized yet).");
    else if (result.data.renderStatus === "failed") toast.error(result.data.renderError ?? "Render failed.");
  }

  async function cancelRecapRender() {
    if (!project) return;
    const result = await cancelRender({ params: { id: project.id } });
    if (result.error) toast.error(result.error.error ?? "Could not cancel the render.");
    else if (!result.data?.cancelled) toast.error("No render is running for this project.");
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

  // One <audio> for the whole list: playing a different voice re-points it.
  // Picking a hook title saves immediately: step 4 has no "Save & Continue" to
  // carry it, and the choice does not demote the project the way the render
  // settings do.
  async function chooseHookTitle(title: string) {
    if (!project) return;
    const previous = project.hookTitle;
    const next = previous === title ? null : title;
    merge({ hookTitle: next });
    const result = await updateProject({ params: { id: project.id }, body: { hookTitle: next } });
    if (result.error || !result.data) {
      merge({ hookTitle: previous });
      toast.error(result.error?.error ?? "Could not save the hook title.");
      return;
    }
    setProject(result.data);
  }

  // A voice with no previewUrl has no button at all, so this is never called
  // without a clip to play.
  // A voice with a recorded clip plays that; the Azure voices have none, so the
  // first press synthesizes their own sample line and the object URL is kept for
  // the rest of the session. Pressing play twice must not mean paying twice —
  // the server caches the bytes for the same reason.
  async function togglePreview(voice: (typeof MOVIE_RECAP_VOICES)[number]) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === voice.id) {
      audio.pause();
      return;
    }

    let src = voice.previewUrl ?? previewUrls.current.get(voice.id) ?? null;
    if (!src) {
      setPreviewLoading(voice.id);
      const result = await generateVoicePreview({ body: { voiceId: voice.id }, invalidate: false });
      setPreviewLoading(null);
      if (result.error || !result.data) {
        toast.error(result.error?.error ?? "Could not generate the voice preview.");
        return;
      }
      src = audioUrlFromBase64(result.data.audioBase64, result.data.contentType);
      previewUrls.current.set(voice.id, src);
    }

    audio.src = src;
    setPlaying(voice.id);
    void audio.play().catch(() => {
      setPlaying(null);
      toast.error("Voice preview audio could not be played.");
    });
  }

  // Object URLs outlive the component unless they're revoked, and the map holds
  // one per voice previewed this session.
  const previewUrlsRef = previewUrls;
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [previewUrlsRef]);

  // Real render progress: the render request stays open for the whole
  // pipeline, so poll the row it's writing stage/segment progress onto — see
  // history/movie-recap.md, "real render progress".
  const projectId = project?.id;
  const renderStatus = project?.renderStatus;
  useEffect(() => {
    if (!projectId || renderStatus !== "running") return;
    const interval = setInterval(async () => {
      const result = await pollProject({ params: { id: projectId }, force: true });
      if (result.data) setProject(result.data);
    }, 2000);
    return () => clearInterval(interval);
  }, [projectId, renderStatus, pollProject]);

  const blur = project ? { x: project.blurX, y: project.blurY, width: project.blurWidth, height: project.blurHeight } : { x: 35, y: 40, width: 30, height: 20 };
  const videoUrl = localVideoUrl ?? project?.sourceUrl ?? null;

  return (
    <>
      <TopBar><Crumb><Link href="/movie-recap">Movie Recap</Link> / <span className="text-fg">{project?.name ?? "New project"}</span></Crumb></TopBar>
      <Body>
        <Wrap wide>
          <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEP_NAMES.map((name, index) => {
              const number = (index + 1) as StepNumber;
              const active = step === number;
              const available = number <= maxStep;
              return (
                <Button key={name} disabled={!available} onClick={() => available && void setStep(number)} className={`!h-auto !justify-start !rounded-lg !px-3 !py-2.5 ${active ? "!border-accent !bg-accent-dim !text-fg" : "!border-line !text-fg-2"}`}>
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
                {/* Four across on a wide screen, two on a tablet, one on a
                    phone. The card stacks its play control above the label so a
                    quarter-width column still fits the Burmese sample line. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {MOVIE_RECAP_VOICES.map((voice) => (
                    <div key={voice.id} className={`flex flex-col gap-2 rounded-xl border p-3 ${project.voiceProfileId === voice.id ? "border-accent bg-accent-dim" : "border-line bg-panel-2"}`}>
                      <div className="flex items-center">
                        <Button
                          aria-label={playing === voice.id ? `Pause ${voice.name} preview` : `Play ${voice.name} preview`}
                          disabled={previewLoading !== null}
                          onClick={() => void togglePreview(voice)}
                          className="!h-9 !w-9 shrink-0 !rounded-full !border-0 !bg-accent !p-0 !text-on-accent"
                        >
                          {previewLoading === voice.id ? <Loader2 size={15} className="animate-spin" /> : playing === voice.id ? <Pause size={15} /> : <Play size={15} />}
                        </Button>
                      </div>
                      <Button onClick={() => merge({ voiceProfileId: voice.id })} className="!h-auto min-w-0 flex-1 !items-start !justify-start !border-0 !bg-transparent !p-0 !text-left !text-fg">
                        <span className="block w-full"><span className="flex w-full items-center gap-2"><span className="text-sm font-semibold">{voice.name}</span>{project.voiceProfileId === voice.id && <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10px] text-on-accent"><Check size={11} /> Selected</span>}</span><span className="mt-0.5 block whitespace-normal text-xs text-fg-3">{voice.description}</span><span className="mt-1 block whitespace-normal text-xs text-fg-2">{voice.sampleText}</span></span>
                      </Button>
                    </div>
                  ))}
                </div>
                <audio ref={audioRef} onPause={() => setPlaying(null)} onEnded={() => setPlaying(null)} />
              </div>
            </div>
          )}

          {step === 3 && project && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Customize Video</h2><p className="mb-6 text-sm text-fg-2">Preview how framing and overlays will be applied in phase 2.</p>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
                <MovieRecapPreview project={project} videoUrl={videoUrl} blur={blur} previewZoom={project.copyrightFree ? effectiveMovieRecapZoom(project) : 1} onBlurChange={(rect) => merge({ blurX: rect.x, blurY: rect.y, blurWidth: rect.width, blurHeight: rect.height })} />
                <div className="rounded-xl border border-line bg-panel-2 p-4">
                  <div className="mb-5 grid grid-cols-4 gap-2">
                    {CUSTOMIZE_TABS.map(({ id, label, Icon }) => <Button key={id} onClick={() => void setTab(id)} aria-label={label} title={label} className={tab === id ? "!border-accent !bg-accent-dim !text-fg" : ""}><Icon size={16} /></Button>)}
                  </div>
                  {tab === "aspect" && <div>
                    <div className="grid grid-cols-2 gap-3">{MOVIE_RECAP_ASPECT_RATIOS.map((item) => {
                      const Icon = item.id === "9:16" ? RectangleVertical : RectangleHorizontal;
                      return <ChoiceButton key={item.id} selected={project.aspectRatio === item.id} onClick={() => setAspectRatio(item.id)}><span className="flex items-center gap-2"><Icon size={18} /><span className="text-sm font-semibold">{item.name}</span></span></ChoiceButton>;
                    })}</div>
                    <div className="mt-5"><div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-3">Fit mode</div>
                      <div className="grid grid-cols-2 gap-2">{MOVIE_RECAP_FIT_MODES.map((item) => <ChoiceButton key={item.id} selected={project.fitMode === item.id} onClick={() => setFitMode(item.id)}><span><span className="block text-sm font-semibold">{item.name}</span><span className="mt-1 block whitespace-normal text-xs text-fg-2">{item.description}</span></span></ChoiceButton>)}</div>
                    </div>
                    <label className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-3">
                      <span>
                        <span className="block text-sm font-medium">Copyright-free transform</span>
                        <span className="mt-1 block text-xs text-fg-3">Re-cut and alter the source so the export is not a continuous copy of it. Turn off to keep the footage as it is.</span>
                      </span>
                      <Switch checked={project.copyrightFree} onChange={setCopyrightFree} />
                    </label>
                    {project.copyrightFree && (
                      <label className="mt-3 block">
                        <span className="mb-2 flex justify-between text-xs font-medium text-fg-2">
                          <span>Zoom</span>
                          <span>
                            {effectiveMovieRecapZoom(project).toFixed(2)}x
                            {project.copyrightZoom === null ? " · recommended" : ""}
                          </span>
                        </span>
                        <input
                          aria-label="Copyright-free zoom"
                          type="range"
                          min={MOVIE_RECAP_ZOOM.min}
                          max={MOVIE_RECAP_ZOOM.max}
                          step={MOVIE_RECAP_ZOOM.step}
                          value={effectiveMovieRecapZoom(project)}
                          onChange={(event) => merge({ copyrightZoom: Number(event.target.value) })}
                          className="w-full accent-accent"
                        />
                        <span className="mt-2 block text-[11px] text-fg-3">
                          1.00x keeps the original framing. Changing the fit mode returns this to the recommended value.
                        </span>
                      </label>
                    )}
                  </div>}
                  {tab === "subtitle" && <div>
                    <p className="mb-5 text-xs text-fg-2">Subtitles are burned into the exported video. Pick a look; its size is set by the aspect ratio.</p>
                    <div className="space-y-5">
                      {/* Colour, size, weight and shadow are one choice, not four
                          knobs — see history/movie-recap.md. The swatch shows the
                          preset drawing its own name the way the export will. */}
                      <div><div className="mb-2 text-xs font-medium text-fg-2">Caption style</div>
                        <div className="grid grid-cols-2 gap-2">
                          {MOVIE_RECAP_SUBTITLE_PRESETS.map((item) => (
                            <ChoiceButton key={item.id} selected={project.subtitlePreset === item.id} onClick={() => merge({ subtitlePreset: item.id })}>
                              <span>
                                <span className="block text-sm" style={{ fontWeight: item.weight, color: item.color, WebkitTextStrokeWidth: `${(item.outlineEm * 0.75).toFixed(3)}em`, WebkitTextStrokeColor: item.outlineColor, paintOrder: "stroke fill" }}>{item.name}</span>
                                <span className="mt-1 block whitespace-normal text-xs text-fg-2">{item.description}</span>
                              </span>
                            </ChoiceButton>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-fg-3">Text size is {MOVIE_RECAP_SUBTITLE_SIZE_PCT[project.aspectRatio]}% of frame height for {project.aspectRatio}.</p>
                      </div>
                      <div><div className="mb-2 text-xs font-medium text-fg-2">Position</div><div className="grid grid-cols-3 gap-2">{MOVIE_RECAP_SUBTITLE_POSITIONS.map((item) => <Button key={item.id} onClick={() => merge({ subtitlePosition: item.id })} className={project.subtitlePosition === item.id ? "!border-accent !bg-accent-dim !text-fg" : ""}>{item.name}</Button>)}</div></div>
                      {project.subtitlePosition !== "middle" && <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-fg-2"><span>Edge distance</span><span>{Math.round(project.subtitleOffset)}%</span></span><input aria-label="Subtitle edge distance" type="range" min={0} max={45} value={project.subtitleOffset} onChange={(event) => merge({ subtitleOffset: Number(event.target.value) })} className="w-full accent-accent" /></label>}
                    </div>
                  </div>}
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
            </div>
          )}

          {step === 4 && project && (
            <Review
              project={project}
              onGenerate={generate}
              onChooseHookTitle={chooseHookTitle}
              saving={saving}
              onRenderPreview={renderRecapPreview}
              rendering={rendering}
              onCancelRender={cancelRecapRender}
              cancelling={cancelling}
            />
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            {step > 1 ? <Button onClick={() => void setStep((step - 1) as StepNumber)}><ChevronLeft size={16} /> Back</Button> : <span />}
            {step === 1 && <LoadingButton variant="primary" disabled={project?.sourceUploadStatus !== "ready"} loading={saving} onClick={() => saveAndGo(2)}>Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 2 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(3)}>Save & Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 3 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(4)}>Save & Continue <ChevronRight size={16} /></LoadingButton>}
          </div>
        </Wrap>
      </Body>
    </>
  );
}

function Review({
  project,
  onGenerate,
  onChooseHookTitle,
  saving,
  onRenderPreview,
  rendering,
  onCancelRender,
  cancelling,
}: {
  project: MovieRecapProject;
  onGenerate: () => void;
  onChooseHookTitle: (title: string) => void;
  saving: boolean;
  onRenderPreview: (mock?: boolean) => void;
  rendering: boolean;
  onCancelRender: () => void;
  cancelling: boolean;
}) {
  const rows = [
    ["Source", project.sourceFileName], ["File size", formatBytes(project.sourceSizeBytes)], ["Duration", formatDuration(project.sourceDurationSeconds)],
    ["Project name", project.name], ["Output language", "Burmese"], ["Voice profile", MOVIE_RECAP_VOICES.find((voice) => voice.id === project.voiceProfileId)?.name ?? project.voiceProfileId], ["Aspect ratio", project.aspectRatio],
    ["Subtitles", `Burned in · ${MOVIE_RECAP_SUBTITLE_PRESETS.find((item) => item.id === project.subtitlePreset)?.name ?? project.subtitlePreset} · ${MOVIE_RECAP_SUBTITLE_SIZE_PCT[project.aspectRatio]}% · ${MOVIE_RECAP_SUBTITLE_POSITIONS.find((item) => item.id === project.subtitlePosition)?.name ?? project.subtitlePosition}`],
    ["Logo", project.logoEnabled ? `${project.logoFileName ?? "Missing"} · ${MOVIE_RECAP_LOGO_PLACEMENTS.find((item) => item.id === project.logoPlacement)?.name} · ${project.logoOpacity}%` : "Off"],
    ["Copyright-free", project.copyrightFree ? `On · zoom ${effectiveMovieRecapZoom(project).toFixed(2)}x` : "Off"],
    ["Blur", project.blurEnabled ? `${Math.round(project.blurWidth)}% × ${Math.round(project.blurHeight)}% at ${Math.round(project.blurX)}%, ${Math.round(project.blurY)}%` : "Off"],
  ];
  const statusColor = project.renderStatus === "failed" ? "text-danger" : project.renderStatus === "done" ? "text-ok" : "text-fg-3";
  const stageLabel = project.renderStage
    ? {
        downloading_source: "Downloading source",
        detecting_scenes: "Detecting scenes",
        describing_scenes: `Describing scene ${project.renderProgressCurrent}/${project.renderProgressTotal}`,
        reading_captions: "Reading source captions",
        extracting_audio: "Extracting audio",
        transcribing: "Transcribing speech",
        writing_script: "Writing narration script",
        synthesizing_narration: `Generating narration ${project.renderProgressCurrent}/${project.renderProgressTotal}`,
        rendering_segments: `Rendering segment ${project.renderProgressCurrent}/${project.renderProgressTotal}`,
        concatenating: "Combining segments",
        applying_overlays: "Applying blur/logo",
        uploading: "Uploading result",
        writing_hook_titles: "Writing hook titles",
      }[project.renderStage]
    : null;
  const mockTag = project.renderIsMock && project.renderStatus !== "idle" ? " (mock)" : "";
  const statusLabel = project.renderStatus === "running" ? stageLabel ?? "Starting…" : { idle: "Not rendered yet", running: "Rendering…", done: "Done", failed: "Failed" }[project.renderStatus];
  return <div><h2 className="mb-1 text-lg font-semibold">Review Configuration</h2><p className="mb-6 text-sm text-fg-2">Confirm the settings that phase 2 will use.</p>
    <div className="overflow-hidden rounded-xl border border-line bg-panel-2"><table className="w-full border-collapse"><tbody>{rows.map(([label, value]) => <tr key={label} className="border-b border-line last:border-0"><th className="w-1/3 px-4 py-3 text-left text-xs font-medium text-fg-3">{label}</th><td className="px-4 py-3 text-sm text-fg">{value}</td></tr>)}</tbody></table></div>
    <div className="mt-6 flex flex-wrap items-center gap-3"><LoadingButton variant="primary" loading={saving} onClick={onGenerate}>Generate Recap Video</LoadingButton>{project.status === "ready_for_generation" && <span className="flex items-center gap-1.5 text-sm text-ok"><Check size={16} /> Ready for phase 2</span>}</div>

    <div className="mt-8 rounded-xl border border-line bg-panel-2 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">Render preview</span>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}{mockTag}</span>
      </div>
      <p className="mb-4 text-xs text-fg-2">
        <span className="font-medium text-fg">Mock</span> uses canned narration over the first 40s of the source — no Whisper, no GPT, no API cost — for checking framing, logo, and subtitle design. <span className="font-medium text-fg">AI</span> runs the real read → copyright-free transform → narration-script → narration-audio pipeline, and the exported file carries the spoken narration. Mock stays silent, because synthesizing costs the same as a real run. Styled subtitles are burned into the exported file by libass, exactly as designed in step 3.
      </p>
      {/* The stepper replaces watching one line of text change for minutes.
          It is hidden while idle, where seven grey dots would say nothing the
          "Not rendered yet" label does not already say. */}
      {project.renderStatus !== "idle" && (
        <div className="mb-4 rounded-lg border border-line bg-panel p-3">
          <MovieRecapRenderProgress project={project} />
        </div>
      )}
      {project.renderStatus === "failed" && project.renderError && <p className="mb-4 text-sm text-danger">{project.renderError}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <LoadingButton loading={rendering} disabled={project.renderStatus === "running"} onClick={() => onRenderPreview(true)}>Render Mock Preview</LoadingButton>
        <LoadingButton variant="primary" loading={rendering} disabled={project.renderStatus === "running"} onClick={() => onRenderPreview(false)}>Render AI Preview</LoadingButton>
        {project.renderStatus === "running" && <LoadingButton variant="danger" loading={cancelling} onClick={onCancelRender}>Cancel</LoadingButton>}
      </div>
      {project.renderStatus === "done" && project.renderOutputUrl && <MovieRecapRenderPlayer project={project} />}
    </div>

    {project.hookTitles.length > 0 && (
      <div className="mt-8 rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={16} className="text-fg-3" />
          <span className="text-sm font-medium">Hook titles</span>
        </div>
        <p className="mb-4 text-xs text-fg-2">
          Written from this render&apos;s narration, each taking a different angle. Pick the one to publish with — click it again to unpick. Regenerating means rendering again, so the set stays until then.
        </p>
        <ul className="flex flex-col gap-2">
          {project.hookTitles.map((title) => {
            const selected = project.hookTitle === title;
            return (
              <li key={title} className="flex items-center gap-2">
                <Button
                  onClick={() => onChooseHookTitle(title)}
                  className={`!h-auto min-w-0 flex-1 !justify-start !py-2.5 !text-left ${selected ? "!border-accent !bg-accent-dim !text-fg" : ""}`}
                >
                  {selected ? <Check size={16} className="shrink-0" /> : <span className="w-4 shrink-0" />}
                  <span className="whitespace-normal">{title}</span>
                </Button>
                <Button aria-label="Copy title" onClick={() => void copyText(title, "Title")}><Copy size={16} /></Button>
              </li>
            );
          })}
        </ul>
      </div>
    )}
  </div>;
}
