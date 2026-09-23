"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import Link from "next/link";
import Image from "next/image";
import { Captions, Check, ChevronLeft, ChevronRight, Crop, Droplet, Pencil, Plus, RectangleHorizontal, RectangleVertical, Square, Stamp, Trash2, Upload, X } from "lucide-react";
import { ConfirmDialog, Dialog, Input, Select, SelectOption, Switch, toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import type { MovieRecapProject, MovieRecapProjectPatch } from "@/lib/api/types";
import {
  MOVIE_RECAP_ASPECT_RATIOS,
  MOVIE_RECAP_ZOOM,
  MOVIE_RECAP_FIT_MODES,
  MOVIE_RECAP_LOGO_PLACEMENTS,
  MOVIE_RECAP_SUBTITLE_PRESETS,
  MOVIE_RECAP_SUBTITLE_SIZE_PCT,
  effectiveMovieRecapZoom,
  MOVIE_RECAP_SUBTITLE_POSITIONS,
} from "@/lib/constants/movie-recap";
import { clampBlurRect, formatBytes } from "@/lib/movie-recap";
import { appendRenderHistory } from "@/lib/movie-recap-render-history";
import { useRead, useWrite } from "@/lib/spoosh";
import { MovieRecapPreview } from "./MovieRecapPreview";
import { MovieRecapRenderPlayer } from "./MovieRecapRenderPlayer";
import { MovieRecapScript } from "./MovieRecapScript";
import { MovieRecapRenderProgress } from "./MovieRecapRenderProgress";
import MovieRecapRenderHistory from "./MovieRecapRenderHistory";
import { MovieRecapSource } from "./MovieRecapSource";
import { MovieRecapTranscript } from "./MovieRecapTranscript";

const STEP_NAMES = ["Add Source", "Transcript", "Narrative Script", "Customize Video", "Review"];

// What each step saves, as a list rather than a hand-copied object literal. The
// literal version silently dropped `fitMode` — the control worked, the value
// never left the browser, and nothing errored. `satisfies` makes a name that is
// not a patchable field a compile error, so adding a control to a step means
// adding one word here.
type PatchableField = keyof MovieRecapProjectPatch & keyof MovieRecapProject;

const SETTINGS_FIELDS = ["name", "outputLanguage"] as const satisfies readonly PatchableField[];

const TRANSCRIPT_FIELDS = ["transcriptText", "transcriptStory", "voiceProfileId"] as const satisfies readonly PatchableField[];

const CUSTOMIZE_FIELDS = [
  "aspectRatio",
  "fitMode",
  "dynamicBackgroundBlurEnabled",
  "mirrorEnabled",
  "copyrightZoom",
  "subtitlePreset",
  "subtitlesEnabled",
  "subtitlePosition",
  "subtitleOffset",
  "hookTitle",
  "hookTitlePosition",
  "hookTitleOffset",
  "logoEnabled",
  "logoPlacement",
  "logoOpacity",
  "logoWatermarkText",
  "blurRegions",
] as const satisfies readonly PatchableField[];

function pick(project: MovieRecapProject, fields: readonly PatchableField[]) {
  return Object.fromEntries(fields.map((field) => [field, project[field]])) as MovieRecapProjectPatch;
}
// The wizard step and the customize sub-tab live in the query string, so a step
// is linkable, survives a reload, and the browser's Back button walks back
// through the wizard instead of leaving it. Slugs rather than numbers because
// `?step=customize` says what it is; the number is this list's index + 1.
const STEP_SLUGS = ["source", "transcript", "script", "customize", "review"] as const;
type StepNumber = 1 | 2 | 3 | 4 | 5;
// Mirrors the server's own limit (the PATCH route), so the Add button stops at
// the same place the request would have been refused.
const MAX_BLUR_REGIONS = 8;

type CustomizeTab = "aspect" | "subtitle" | "logo" | "blur";

// Icon-only tabs — the label lives in `aria-label`/`title` so the row stays one
// line at the panel's width.
const CUSTOMIZE_TABS = [
  { id: "aspect", label: "Aspect Ratio", Icon: Crop },
  { id: "subtitle", label: "Subtitle", Icon: Captions },
  { id: "logo", label: "Logo", Icon: Stamp },
  { id: "blur", label: "Blur", Icon: Droplet },
] as const satisfies readonly { id: CustomizeTab; label: string; Icon: typeof Crop }[];

function ChoiceButton({ selected, children, onClick, showSelectedIndicator = true }: { selected: boolean; children: React.ReactNode; onClick: () => void; showSelectedIndicator?: boolean }) {
  return (
    <Button
      onClick={onClick}
      className={`relative !h-auto min-h-20 !justify-start !rounded-xl !px-4 !py-3 !text-left ${selected ? "!border-accent !bg-accent-dim !text-fg" : "!border-line !bg-panel-2 !text-fg"}`}
    >
      {children}
      {selected && showSelectedIndicator && <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent"><Check size={12} /></span>}
    </Button>
  );
}

type LogoTemplateDialogValues = {
  name: string;
  file: File | null;
  watermarkText: string;
};

function LogoTemplateDialogContent({
  title,
  description,
  initialName = "",
  initialFile = null,
  currentFileName = "",
  initialWatermarkText = "",
  submitLabel,
  submittingLabel,
  dismiss,
  onSubmit,
}: {
  title: string;
  description: string;
  initialName?: string;
  initialFile?: File | null;
  currentFileName?: string;
  initialWatermarkText?: string;
  submitLabel: string;
  submittingLabel: string;
  dismiss: () => void;
  onSubmit: (values: LogoTemplateDialogValues) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialName);
  const [file, setFile] = useState<File | null>(initialFile);
  const [watermarkText, setWatermarkText] = useState(initialWatermarkText);
  const [submitting, setSubmitting] = useState(false);
  const { openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "image/png,image/jpeg,image/webp",
    onChange: (_files, newFiles) => {
      if (newFiles[0]) setFile(newFiles[0]);
    },
  });

  async function submit() {
    setSubmitting(true);
    try {
      if (await onSubmit({ name, file, watermarkText })) dismiss();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm text-fg-2">{description}</p></div>
      <Input autoFocus value={name} placeholder="Template name" onChange={(event) => setName(event.target.value)} />
      <div>
        <div className="mb-2 text-xs font-medium text-fg-2">Logo file</div>
        <Button disabled={submitting} onClick={() => openFilePicker({ multiple: false })}><Upload size={14} /> {file || currentFileName ? "Replace image" : "Choose image"}</Button>
        <p className="mt-2 truncate text-xs text-fg-3">{file?.name || currentFileName || "PNG, JPEG, or WebP"}</p>
      </div>
      <div><div className="mb-2 text-xs font-medium text-fg-2">Watermark text <span className="font-normal text-fg-3">(optional)</span></div><Input value={watermarkText} placeholder="Text over the logo" onChange={(event) => setWatermarkText(event.target.value)} /></div>
      <div className="flex justify-end gap-2">
        <Button disabled={submitting} variant="secondary" onClick={dismiss}>Cancel</Button>
        <LoadingButton loading={submitting} loadingText={submittingLabel} onClick={() => void submit()}>{submitLabel}</LoadingButton>
      </div>
    </div>
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
  const { data: logoTemplates = [], trigger: refreshLogoTemplates } = useRead((api) => api("movie-recap-logo-templates").GET(), { staleTime: 30000 });
  const { trigger: createLogoTemplate } = useWrite((api) => api("movie-recap-logo-templates").POST());
  const { trigger: applyLogoTemplate } = useWrite((api) => api("movie-recap-logo-templates/:id").POST());
  const { trigger: updateLogoTemplate } = useWrite((api) => api("movie-recap-logo-templates/:id").PATCH());
  const { trigger: deleteLogoTemplate, loading: deletingLogoTemplate } = useWrite((api) => api("movie-recap-logo-templates/:id").DELETE());
  const { trigger: renderPreview, loading: rendering } = useWrite((api) => api("movie-recaps/:id/render").POST());
  const { trigger: buildScript, loading: buildingScript } = useWrite((api) => api("movie-recaps/:id/script").POST());
  const { trigger: rebuildBeat } = useWrite((api) => api("movie-recaps/:id/script/beat").POST());
  const { trigger: cancelScript, loading: cancellingScript } = useWrite((api) => api("movie-recaps/:id/script/cancel").POST());
  const { trigger: applyBeats, loading: applyingBeats } = useWrite((api) => api("movie-recaps/:id/script/beats").POST());
  const { trigger: cancelRender, loading: cancelling } = useWrite((api) => api("movie-recaps/:id/render/cancel").POST());
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
  // Beat edits live in the Narrative Script step's own state and are lost when it
  // unmounts. Leaving the step is the one moment that can throw them away
  // without the user having asked for anything, so it asks.
  const [dirtyBeats, setDirtyBeats] = useState(0);
  const setStep = (target: StepNumber) => {
    if (step === 3 && target !== 3 && dirtyBeats > 0) {
      return new Promise<void>((resolve) => {
        ConfirmDialog.show({
          title: "Leave without saving?",
          content: `${dirtyBeats} beat${dirtyBeats === 1 ? " has" : "s have"} edits that are not saved. Leaving this step discards them.`,
          confirmButtonLabel: "Discard and leave",
          cancelButtonLabel: "Stay",
          onConfirm: () => {
            setDirtyBeats(0);
            void setStepSlug(STEP_SLUGS[target - 1]).then(() => resolve());
          },
          onCancel: () => resolve(),
        });
      });
    }
    return setStepSlug(STEP_SLUGS[target - 1]);
  };
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  // Owned here, not in MovieRecapSource: that component unmounts when step 1 is
  // left, and revoking on its unmount killed the URL step 3 had just been handed.
  useEffect(() => () => {
    if (localVideoUrl?.startsWith("blob:")) URL.revokeObjectURL(localVideoUrl);
  }, [localVideoUrl]);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedLogoTemplateId, setSelectedLogoTemplateId] = useState<string | null>(initialProject?.logoTemplateId ?? null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [logoAction, setLogoAction] = useState<"unchanged" | "template" | "custom" | "clear">("unchanged");
  const pendingLogoPreviewUrl = useRef<string | null>(null);
  // Which beat is being re-spoken, so only that row shows a spinner.
  const [checkingBeat, setCheckingBeat] = useState<number | null>(null);

  useEffect(() => () => {
    if (pendingLogoPreviewUrl.current) URL.revokeObjectURL(pendingLogoPreviewUrl.current);
  }, []);

  // The row as it actually is, for when a request failed and local state is a
  // guess. `force` skips the cache: the point is to stop trusting what we had.
  async function syncProject() {
    if (!project) return;
    const result = await pollProject({ params: { id: project.id }, force: true });
    if (result.data) setProject(result.data);
  }

  function merge(patch: Partial<MovieRecapProject>) {
    setProject((current) => current ? { ...current, ...patch } : current);
  }

  // Ratio and fit-mode changes deliberately leave zoom alone so they respect
  // the user's framing.
  function setFitMode(fitMode: MovieRecapProject["fitMode"]) {
    merge({ fitMode });
  }

  function setAspectRatio(aspectRatio: MovieRecapProject["aspectRatio"]) {
    merge({ aspectRatio });
  }

  // Transcript and Customize edit a browser draft; leaving those steps any other
  // way than Continue dropped it, and a render then used the stale saved row.
  function goToStep(target: StepNumber) {
    if (step === 2 || step === 4) void saveAndGo(target);
    else void setStep(target);
  }

  async function saveAndGo(target: StepNumber) {
    if (!project) return;
    const body: MovieRecapProjectPatch = { currentStep: target };
    // Transcript fields edit the project draft and this writes them together,
    // including the voice Build Script will read in the next step.
    if (step === 2) {
      for (const field of TRANSCRIPT_FIELDS) body[field] = project[field] ?? "";
    }
    if (step === 4) {
      if (!project.name.trim()) {
        toast.error("Project name is required.");
        return;
      }
      if (project.logoEnabled && !project.logoUrl) {
        toast.error("Choose or upload a logo, or leave the logo off.");
        return;
      }
      if (!await persistLogoDraft()) return;
      Object.assign(body, pick(project, SETTINGS_FIELDS), pick(project, CUSTOMIZE_FIELDS));
    }
    const result = await updateProject({ params: { id: project.id }, body });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not save the project.");
      return;
    }
    setProject(result.data);
    if (step === 4) setLogoAction("unchanged");
    setMaxStep((current) => Math.max(current, target) as StepNumber);
    void setStep(target);
  }

  // Same write as Continue's, without leaving the step, so a long transcript
  // and its narration voice can be parked before the story is finished.
  async function saveTranscript() {
    if (!project) return;
    const body: MovieRecapProjectPatch = {};
    for (const field of TRANSCRIPT_FIELDS) body[field] = project[field] ?? "";
    const result = await updateProject({ params: { id: project.id }, body });
    if (result.error || !result.data) toast.error(result.error?.error ?? "Could not save the transcript.");
    else {
      setProject(result.data);
      toast.success("Transcript saved.");
    }
  }

  async function buildRecapScript() {
    if (!project) return;
    // Optimistic, for the same reason the render is: the POST does not resolve
    // until the whole run finishes, and the polling effect reads local state.
    merge({ scriptStatus: "running", scriptError: null, scriptStage: null, scriptProgressCurrent: null, scriptProgressTotal: null });
    const result = await buildScript({ params: { id: project.id } });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not build the script.");
      // Re-read the row rather than guessing. A 409 means a run is ALREADY
      // going — often one this browser started and then lost track of — and
      // leaving the local status on the optimistic "running" would show a bar
      // that never moves, while resetting it to idle would hide a run that is.
      await syncProject();
      return;
    }
    setProject(result.data);
    if (result.data.scriptStatus === "ready") toast.success("Narration timeline ready.");
    else if (result.data.scriptStatus === "failed") toast.error(result.data.scriptError ?? "The script run failed.");
  }

  // The paste half of the copyable prompt. Returns how many beats actually
  // changed so the component can say so rather than claiming a silent success.
  async function applyScriptBeats(edits: { index: number; text: string }[]) {
    if (!project) return 0;
    const result = await applyBeats({ params: { id: project.id }, body: { edits } });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not apply those beats.");
      return 0;
    }
    setProject(result.data);
    if (result.data.changed > 0) {
      toast.success(`${result.data.changed} beat${result.data.changed === 1 ? "" : "s"} updated. Re Build each changed beat.`);
    } else {
      toast.error("Nothing in that paste was different from what is already here.");
    }
    return result.data.changed;
  }

  async function saveScriptBeat(index: number, text: string) {
    if (!project) return;
    setCheckingBeat(index);
    try {
      const result = await rebuildBeat({ params: { id: project.id }, body: { index, text, measure: true } });
      if (result.error || !result.data) toast.error(result.error?.error ?? "Could not save that beat.");
      else setProject(result.data);
    } finally {
      setCheckingBeat(null);
    }
  }

  async function cancelScriptRun() {
    if (!project) return;
    const result = await cancelScript({ params: { id: project.id } });
    if (result.error || !result.data) toast.error(result.error?.error ?? "Could not cancel the script run.");
    else setProject(result.data);
  }

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
    // The shot log is not stored server-side, so it has to be kept now or lost:
    // this response is the only time the browser ever sees it.
    if (result.data.renderLog) appendRenderHistory(project.id, result.data.renderLog);
    if (result.data.renderStatus === "done") {
      toast.success(
        mock
          ? "Mock preview rendered — no AI calls were made."
          : "Rendered from the saved narration timeline — the source was not analyzed again."
      );
    }
    else if (result.data.renderStatus === "failed") toast.error(result.data.renderError ?? "Render failed.");
  }

  async function cancelRecapRender() {
    if (!project) return;
    const result = await cancelRender({ params: { id: project.id } });
    if (result.error) toast.error(result.error.error ?? "Could not cancel the render.");
    else if (!result.data?.cancelled) toast.error("No render is running for this project.");
  }

  function clearPendingLogoFile() {
    if (pendingLogoPreviewUrl.current) URL.revokeObjectURL(pendingLogoPreviewUrl.current);
    pendingLogoPreviewUrl.current = null;
    setPendingLogoFile(null);
  }

  function stageLogoFile(file: File) {
    clearPendingLogoFile();
    const previewUrl = URL.createObjectURL(file);
    pendingLogoPreviewUrl.current = previewUrl;
    setPendingLogoFile(file);
    setSelectedLogoTemplateId(null);
    setLogoAction("custom");
    merge({
      logoEnabled: true,
      logoFileName: file.name,
      logoObjectKey: null,
      logoUrl: previewUrl,
      logoContentType: file.type,
      logoSizeBytes: file.size,
      logoTemplateId: null,
    });
  }

  function clearLogoDraft() {
    clearPendingLogoFile();
    setSelectedLogoTemplateId(null);
    setLogoAction("clear");
    merge({
      logoEnabled: false,
      logoFileName: null,
      logoObjectKey: null,
      logoUrl: null,
      logoContentType: null,
      logoSizeBytes: null,
      logoWatermarkText: null,
      logoTemplateId: null,
    });
  }

  async function uploadLogo(file: File): Promise<MovieRecapProject | null> {
    if (!project) return null;
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
      setProject((current) => current ? {
        ...current,
        logoEnabled: true,
        logoFileName: committed.data!.logoFileName,
        logoObjectKey: committed.data!.logoObjectKey,
        logoUrl: committed.data!.logoUrl,
        logoContentType: committed.data!.logoContentType,
        logoSizeBytes: committed.data!.logoSizeBytes,
      } : committed.data!);
      clearPendingLogoFile();
      return committed.data;
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Could not upload the logo.");
      return null;
    } finally {
      setLogoBusy(false);
    }
  }

  const { openFilePicker: openLogoPicker } = useFilePicker<HTMLDivElement>({
    accept: "image/png,image/jpeg,image/webp",
    onChange: (_files, newFiles) => {
      if (newFiles[0]) stageLogoFile(newFiles[0]);
    },
  });

  async function persistLogoDraft() {
    if (!project) return false;
    if (logoAction === "unchanged") return true;
    if (logoAction === "custom") {
      if (!pendingLogoFile) {
        toast.error("Choose a logo image first.");
        return false;
      }
      const uploaded = await uploadLogo(pendingLogoFile);
      if (uploaded) setLogoAction("unchanged");
      return Boolean(uploaded);
    }
    if (logoAction === "template") {
      if (!selectedLogoTemplateId) return false;
      const result = await applyLogoTemplate({ params: { id: selectedLogoTemplateId }, body: { projectId: project.id } });
      if (result.error || !result.data) {
        toast.error(result.error?.error ?? "Could not apply the logo template.");
        return false;
      }
      setLogoAction("unchanged");
      return true;
    }
    const result = await removeLogo({ params: { id: project.id } });
    if (result.error || !result.data) {
      toast.error(result.error?.error ?? "Could not remove the logo.");
      return false;
    }
    setLogoAction("unchanged");
    return true;
  }

  function selectLogoTemplate(templateId: string | null) {
    if (!project) return;
    if (!templateId) {
      clearLogoDraft();
      return;
    }
    const template = logoTemplates.find((item) => item.id === templateId);
    if (!template) return;
    clearPendingLogoFile();
    setSelectedLogoTemplateId(templateId);
    setLogoAction("template");
    merge({
      logoEnabled: true,
      logoFileName: template.logoFileName,
      logoObjectKey: template.logoObjectKey,
      logoUrl: template.logoUrl,
      logoContentType: template.logoContentType,
      logoSizeBytes: template.logoSizeBytes,
      logoWatermarkText: template.logoWatermarkText,
      logoTemplateId: template.id,
    });
  }

  async function deleteSelectedLogoTemplate() {
    if (!project || !activeLogoTemplateId) return;
    const templateId = activeLogoTemplateId;
    const result = await deleteLogoTemplate({ params: { id: templateId } });
    if (result.error) {
      toast.error(result.error.error ?? "Could not delete the template.");
      return;
    }
    clearLogoDraft();
    await refreshLogoTemplates({ force: true });
    toast.success("Logo template deleted.");
  }

  function openCreateLogoTemplate() {
    if (!project) return;
    Dialog.show({
      className: "max-w-lg",
      content: ({ dismiss }) => <LogoTemplateDialogContent
        title="Create logo template"
        description="Save a logo and optional watermark for reuse across recap videos."
        initialFile={pendingLogoFile}
        initialWatermarkText={project.logoWatermarkText ?? ""}
        submitLabel="Create template"
        submittingLabel="Creating..."
        dismiss={dismiss}
        onSubmit={async ({ name, file, watermarkText }) => {
          if (!name.trim()) {
            toast.error("Template name is required.");
            return false;
          }
          if (!file && (!project.logoUrl || activeLogoTemplateId)) {
            toast.error("Choose a logo image first.");
            return false;
          }
          if (file && !await uploadLogo(file)) return false;
          const result = await createLogoTemplate({ body: { projectId: project.id, name: name.trim(), logoWatermarkText: watermarkText.trim() || null } });
          if (result.error || !result.data) {
            toast.error(result.error?.error ?? "Could not save the template.");
            return false;
          }
          setSelectedLogoTemplateId(result.data.id);
          setLogoAction("template");
          merge({
            logoEnabled: true,
            logoFileName: result.data.logoFileName,
            logoObjectKey: result.data.logoObjectKey,
            logoUrl: result.data.logoUrl,
            logoContentType: result.data.logoContentType,
            logoSizeBytes: result.data.logoSizeBytes,
            logoWatermarkText: result.data.logoWatermarkText,
            logoTemplateId: result.data.id,
          });
          await refreshLogoTemplates({ force: true });
          toast.success("Logo template created.");
          return true;
        }}
      />,
    });
  }

  function openEditLogoTemplate() {
    if (!project || !activeLogoTemplateId) return;
    const template = logoTemplates.find((item) => item.id === activeLogoTemplateId);
    if (!template) return;
    Dialog.show({
      className: "max-w-lg",
      content: ({ dismiss }) => <LogoTemplateDialogContent
        title="Edit logo template"
        description="Update the saved logo details used by this project."
        initialName={template.name}
        currentFileName={template.logoFileName}
        initialWatermarkText={template.logoWatermarkText ?? ""}
        submitLabel="Update template"
        submittingLabel="Updating..."
        dismiss={dismiss}
        onSubmit={async ({ name, file, watermarkText }) => {
          if (!name.trim()) {
            toast.error("Template name is required.");
            return false;
          }
          if (file && !await uploadLogo(file)) return false;
          const result = await updateLogoTemplate({
            params: { id: activeLogoTemplateId },
            body: {
              ...(file ? { projectId: project.id, replaceLogo: true } : {}),
              name: name.trim(),
              logoWatermarkText: watermarkText.trim() || null,
            },
          });
          if (result.error || !result.data) {
            toast.error(result.error?.error ?? "Could not update the template.");
            return false;
          }
          setSelectedLogoTemplateId(result.data.id);
          setLogoAction("template");
          merge({
            logoEnabled: true,
            logoFileName: result.data.logoFileName,
            logoObjectKey: result.data.logoObjectKey,
            logoUrl: result.data.logoUrl,
            logoContentType: result.data.logoContentType,
            logoSizeBytes: result.data.logoSizeBytes,
            logoWatermarkText: result.data.logoWatermarkText,
            logoTemplateId: result.data.id,
          });
          await refreshLogoTemplates({ force: true });
          toast.success("Logo template updated.");
          return true;
        }}
      />,
    });
  }

  // Real render progress: the render request stays open for the whole
  // pipeline, so poll the row it's writing stage/segment progress onto — see
  // history/movie-recap.md, "real render progress".
  const projectId = project?.id;
  const renderStatus = project?.renderStatus;
  const scriptStatus = project?.scriptStatus;
  // Both long runs report their stage on the row, so one poller serves both.
  useEffect(() => {
    if (!projectId || (renderStatus !== "running" && scriptStatus !== "running")) return;
    const interval = setInterval(async () => {
      const result = await pollProject({ params: { id: projectId }, force: true });
      if (result.data) setProject(result.data);
    }, 2000);
    return () => clearInterval(interval);
  }, [projectId, renderStatus, scriptStatus, pollProject]);

  // Which blur box the preview's drag handles belong to. Per visit, like any
  // other selection — it is not part of the project.
  const [selectedBlur, setSelectedBlur] = useState(0);

  function updateBlur(index: number, patch: Partial<{ x: number; y: number; width: number; height: number }>) {
    if (!project) return;
    merge({
      blurRegions: project.blurRegions.map((region, i) => (i === index ? clampBlurRect({ ...region, ...patch }) : region)),
    });
  }
  const videoUrl = localVideoUrl ?? project?.sourceUrl ?? null;
  const activeLogoTemplateId = selectedLogoTemplateId;

  return (
    <>
      <TopBar><Crumb><Link href="/movie-recap">Movie Recap</Link> / <span className="text-fg">{project?.name ?? "New project"}</span></Crumb></TopBar>
      <Body>
        <Wrap wide>
          <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-5">
            {STEP_NAMES.map((name, index) => {
              const number = (index + 1) as StepNumber;
              const active = step === number;
              const available = number <= maxStep;
              return (
                <Button key={name} disabled={!available} onClick={() => available && goToStep(number)} className={`!h-auto !justify-start !rounded-lg !px-3 !py-2.5 ${active ? "!border-accent !bg-accent-dim !text-fg" : "!border-line !text-fg-2"}`}>
                  <span className={`mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${active ? "bg-accent text-on-accent" : "bg-chip text-fg-2"}`}>{number}</span>
                  <span className="truncate text-xs sm:text-sm">{name}</span>
                </Button>
              );
            })}
          </div>

          {step === 1 && <MovieRecapSource project={project} onProject={(next, preview) => { setProject(next); setLocalVideoUrl(preview ?? null); }} />}

          {step === 2 && project && (
            <MovieRecapTranscript project={project} onChange={merge} />
          )}

          {step === 3 && project && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Narrative Script</h2>
              <p className="mb-6 text-sm text-fg-2">
                Your story stays on the selected scenes while narration defines the timing. Edit and Re Build only the
                beat that needs adjustment; the other cached beats are reused.
              </p>
              <MovieRecapScript
                project={project}
                onBuild={buildRecapScript}
                onSave={saveScriptBeat}
                onCancel={cancelScriptRun}
                onDirtyChange={setDirtyBeats}
                onApplyBeats={applyScriptBeats}
                applyingBeats={applyingBeats}
                building={buildingScript}
                checking={checkingBeat}
                cancelling={cancellingScript}
              />
            </div>
          )}

          {step === 4 && project && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Customize Video</h2><p className="mb-6 text-sm text-fg-2">Name the project and preview how framing and overlays will be applied.</p>
              <Field label="Project name"><Input value={project.name} onChange={(event) => merge({ name: event.target.value })} maxLength={200} /></Field>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
                <MovieRecapPreview project={project} videoUrl={videoUrl} previewZoom={effectiveMovieRecapZoom(project)} selectedBlur={selectedBlur} onBlurSelect={setSelectedBlur} onBlurChange={(index, rect) => updateBlur(index, rect)} />
                <div className="rounded-xl border border-line bg-panel-2 p-4">
                  <div className="mb-5 grid grid-cols-4 gap-2">
                    {CUSTOMIZE_TABS.map(({ id, label, Icon }) => <Button key={id} onClick={() => void setTab(id)} aria-label={label} title={label} className={tab === id ? "!border-accent !bg-accent-dim !text-fg" : ""}><Icon size={16} /></Button>)}
                  </div>
                  {tab === "aspect" && <div>
                    <div className="grid grid-cols-3 gap-3">{MOVIE_RECAP_ASPECT_RATIOS.map((item) => {
                      const Icon = item.id === "9:16" ? RectangleVertical : item.id === "1:1" ? Square : RectangleHorizontal;
                      return <ChoiceButton key={item.id} selected={project.aspectRatio === item.id} showSelectedIndicator={false} onClick={() => setAspectRatio(item.id)}><span className="flex items-center gap-2"><Icon size={18} /><span className="text-sm font-semibold">{item.name}</span></span></ChoiceButton>;
                    })}</div>
                    <div className="mt-5 grid grid-cols-2 gap-2">{MOVIE_RECAP_FIT_MODES.map((item) => <ChoiceButton key={item.id} selected={project.fitMode === item.id} onClick={() => setFitMode(item.id)}><span><span className="block text-sm font-semibold">{item.name}</span><span className="mt-1 block whitespace-normal text-xs text-fg-2">{item.description}</span></span></ChoiceButton>)}</div>
                    <label className="mt-5 block">
                      <span className="mb-2 flex justify-between text-xs font-medium text-fg-2">
                        <span>Zoom</span>
                        <span>
                          {effectiveMovieRecapZoom(project).toFixed(2)}x
                          {project.copyrightZoom === null ? " · recommended" : ""}
                        </span>
                      </span>
                      <input
                        aria-label="Zoom"
                        type="range"
                        min={MOVIE_RECAP_ZOOM.min}
                        max={MOVIE_RECAP_ZOOM.max}
                        step={MOVIE_RECAP_ZOOM.step}
                        value={effectiveMovieRecapZoom(project)}
                        onChange={(event) => merge({ copyrightZoom: Number(event.target.value) })}
                        className="w-full accent-accent"
                      />
                      <span className="mt-2 block text-[11px] text-fg-3">
                        1.00x keeps the original framing. Ratio and fit-mode changes preserve your zoom.
                      </span>
                    </label>
                    <label className="mt-5 flex items-center justify-between gap-3">
                      <span><span className="block text-sm font-medium">Mirror video</span><span className="text-xs text-fg-3">Flip the footage left to right. Text in the source reads backwards.</span></span>
                      <Switch checked={project.mirrorEnabled} onChange={(checked) => merge({ mirrorEnabled: checked })} />
                    </label>
                  </div>}
                  {tab === "subtitle" && <div>
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
                    <div className="mb-5">
                      <div className="mb-2 text-xs font-medium text-fg-2">Logo template</div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={activeLogoTemplateId}
                            clearable
                            placeholder="No template selected"
                            onChange={(value) => selectLogoTemplate(value || null)}
                          >
                            {logoTemplates.map((template) => <SelectOption key={template.id} value={template.id} label={template.name} />)}
                          </Select>
                        </div>
                        <Button disabled={logoBusy} className="shrink-0" onClick={openCreateLogoTemplate}><Plus size={14} /> Create</Button>
                      </div>
                    </div>

                    {activeLogoTemplateId && <div className="mb-5 flex items-center gap-3 rounded-lg border border-line bg-panel p-2.5 text-xs text-fg-3">
                      <Image src={project.logoUrl ?? ""} alt="Selected logo preview" width={40} height={40} unoptimized className="h-10 w-10 rounded border border-line object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-fg">{logoTemplates.find((template) => template.id === activeLogoTemplateId)?.name}</div>
                        <div className="mt-1 truncate"><span className="font-medium text-fg-2">Watermark:</span> {project.logoWatermarkText || "None"}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" aria-label="Edit logo template" title="Edit logo template" className="!h-8 !w-8 !p-0" onClick={openEditLogoTemplate}><Pencil size={15} /></Button>
                        <Button disabled={deletingLogoTemplate} variant="danger" aria-label="Delete logo template" title="Delete logo template" className="!h-8 !w-8 !p-0" onClick={() => void deleteSelectedLogoTemplate()}><Trash2 size={15} /></Button>
                      </div>
                    </div>}

                    <label className="mb-5 flex items-center justify-between gap-3"><span><span className="block text-sm font-medium">Add Logo</span><span className="text-xs text-fg-3">Overlay a saved template or one-off brand mark.</span></span><Switch checked={project.logoEnabled} onChange={(checked) => checked ? merge({ logoEnabled: true }) : clearLogoDraft()} /></label>
                    {project.logoEnabled && <div>
                      {!activeLogoTemplateId && <div className="mb-5">
                        <div className="mb-2 text-xs font-medium text-fg-2">Brand logo file</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {project.logoUrl && <Image src={project.logoUrl} alt="Logo preview" width={40} height={40} unoptimized className="h-10 w-10 rounded border border-line object-contain" />}
                          <LoadingButton loading={logoBusy} onClick={() => openLogoPicker({ multiple: false })}><Upload size={15} /> {project.logoUrl ? "Replace" : "Upload logo"}</LoadingButton>
                          {project.logoUrl && <Button variant="danger" aria-label="Clear logo" title="Clear logo" className="!h-9 !w-9 !p-0" onClick={clearLogoDraft}><X size={16} /></Button>}
                          {project.logoFileName && <p className="w-full truncate text-xs text-fg-3">{project.logoFileName} · {formatBytes(project.logoSizeBytes ?? 0)}</p>}
                        </div>
                      </div>}
                      {!activeLogoTemplateId && <div className="mb-5"><div className="mb-2 text-xs font-medium text-fg-2">Watermark text <span className="font-normal text-fg-3">(optional)</span></div><Input value={project.logoWatermarkText ?? ""} maxLength={120} placeholder="Text over the logo" onChange={(event) => merge({ logoWatermarkText: event.target.value })} /></div>}
                      <div className="mb-5"><div className="mb-2 text-xs font-medium text-fg-2">Logo placement</div><Select value={project.logoPlacement} onChange={(value) => merge({ logoPlacement: value })}>{MOVIE_RECAP_LOGO_PLACEMENTS.map((item) => <SelectOption key={item.id} value={item.id} label={item.name} />)}</Select></div>
                      <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-fg-2"><span>Logo opacity</span><span>{project.logoOpacity}%</span></span><input aria-label="Logo opacity" type="range" min={0} max={100} value={project.logoOpacity} onChange={(event) => merge({ logoOpacity: Number(event.target.value) })} className="w-full accent-accent" /></label>
                    </div>}
                  </div>}
                  {tab === "blur" && <div>
                    <label className="mb-5 flex items-center justify-between gap-3">
                      <span><span className="block text-sm font-medium">Dynamic background blur</span><span className="text-xs text-fg-3">Use a moving blurred copy behind the video in Contain mode.</span></span>
                      <Switch checked={project.dynamicBackgroundBlurEnabled} onChange={(checked) => merge({ dynamicBackgroundBlurEnabled: checked })} />
                    </label>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">Blur areas</span>
                      <Button
                        className="!h-8 !px-2.5 !text-xs"
                        disabled={project.blurRegions.length >= MAX_BLUR_REGIONS}
                        onClick={() => {
                          // Offset each new box from the last so a second one is
                          // not created exactly under the first, invisible.
                          const step = project.blurRegions.length * 6;
                          const region = clampBlurRect({ x: 35 + step, y: 40 + step, width: 30, height: 20 });
                          merge({ blurRegions: [...project.blurRegions, region] });
                          setSelectedBlur(project.blurRegions.length);
                        }}
                      >
                        <Plus size={14} /> Add
                      </Button>
                    </div>

                    {project.blurRegions.length === 0 && (
                      <p className="text-xs text-fg-3">No blur areas. Add one to cover a logo or a watermark.</p>
                    )}

                    <div className="space-y-2">
                      {project.blurRegions.map((region, index) => (
                        <div
                          key={index}
                          className={`rounded-lg border p-3 ${index === selectedBlur ? "border-accent bg-panel" : "border-line bg-panel-2"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBlur(index)}
                              className="flex-1 text-left text-xs font-medium"
                            >
                              Area {index + 1}
                              <span className="ml-2 font-normal text-fg-3 tabular-nums">
                                {Math.round(region.width)}% × {Math.round(region.height)}% at {Math.round(region.x)}%,{" "}
                                {Math.round(region.y)}%
                              </span>
                            </button>
                            <Button
                              className="!h-7 !w-7 !px-0"
                              aria-label={`Remove blur area ${index + 1}`}
                              onClick={() => {
                                merge({ blurRegions: project.blurRegions.filter((_, i) => i !== index) });
                                setSelectedBlur((current) => (current >= index ? Math.max(0, current - 1) : current));
                              }}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                          {index === selectedBlur && (
                            <div className="mt-3 space-y-4">
                              <label className="block">
                                <span className="mb-2 flex justify-between text-xs font-medium text-fg-2">
                                  <span>Width</span>
                                  <span>{Math.round(region.width)}%</span>
                                </span>
                                <input
                                  aria-label={`Blur area ${index + 1} width`}
                                  type="range"
                                  min={5}
                                  max={100}
                                  value={region.width}
                                  onChange={(event) => updateBlur(index, { width: Number(event.target.value) })}
                                  className="w-full accent-accent"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 flex justify-between text-xs font-medium text-fg-2">
                                  <span>Height</span>
                                  <span>{Math.round(region.height)}%</span>
                                </span>
                                <input
                                  aria-label={`Blur area ${index + 1} height`}
                                  type="range"
                                  min={5}
                                  max={100}
                                  value={region.height}
                                  onChange={(event) => updateBlur(index, { height: Number(event.target.value) })}
                                  className="w-full accent-accent"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>}
                </div>
              </div>
            </div>
          )}

          {step === 5 && project && (
            <Review
              project={project}
              onRenderPreview={renderRecapPreview}
              rendering={rendering}
              onCancelRender={cancelRecapRender}
              cancelling={cancelling}
            />
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            {step > 1 ? <Button onClick={() => goToStep((step - 1) as StepNumber)}><ChevronLeft size={16} /> Back</Button> : <span />}
            {step === 1 && <LoadingButton variant="primary" disabled={project?.sourceUploadStatus !== "ready"} loading={saving} onClick={() => saveAndGo(2)}>Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 2 && (
              <div className="flex items-center gap-2">
                <LoadingButton loading={saving} onClick={() => void saveTranscript()}>Save</LoadingButton>
                {/* The BURMESE STORY is what gates this, not the source
                    transcript: the story with its timestamps is what the script
                    run reads, and nothing downstream touches the source text. */}
                <LoadingButton variant="primary" disabled={!project?.transcriptStory?.trim()} loading={saving} onClick={() => saveAndGo(3)}>Continue <ChevronRight size={16} /></LoadingButton>
              </div>
            )}
            {step === 3 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(4)}>Continue <ChevronRight size={16} /></LoadingButton>}
            {step === 4 && <LoadingButton variant="primary" loading={saving} onClick={() => saveAndGo(5)}>Save & Continue <ChevronRight size={16} /></LoadingButton>}
          </div>
        </Wrap>
      </Body>
    </>
  );
}

function confirmFullRender(project: MovieRecapProject, run: () => void) {
  const hasRender = project.renderStatus === "done";
  ConfirmDialog.show({
    title: "Render Video",
    content: hasRender
      ? "This replaces the current video from the saved narration.wav and beat timings. The source is not analyzed again and changing video speed does not regenerate narration."
      : "This cuts footage to the saved narration.wav timeline. The muted picture is rebuilt against the configured narration speed.",
    confirmButtonLabel: "Render",
    cancelButtonLabel: "Cancel",
    // Swallow the promise on purpose. Handing it to ConfirmDialog holds the
    // dialog open until it resolves, and the render request stays open for the
    // whole pipeline — minutes behind a modal, with the progress it should be
    // watching underneath it.
    onConfirm: () => { run(); },
  });
}

function Review({
  project,
  onRenderPreview,
  rendering,
  onCancelRender,
  cancelling,
}: {
  project: MovieRecapProject;
  onRenderPreview: (mock?: boolean) => void;
  rendering: boolean;
  onCancelRender: () => void;
  cancelling: boolean;
}) {
  const statusColor = project.renderStatus === "failed" ? "text-danger" : project.renderStatus === "done" ? "text-ok" : "text-fg-3";
  const stageLabel = project.renderStage
    ? {
        downloading_source: "Downloading source",
        detecting_scenes: "Detecting scenes",
        extracting_keyframes: `Taking keyframe ${project.renderProgressCurrent}/${project.renderProgressTotal}`,
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
      }[project.renderStage]
    : null;
  const mockTag = project.renderIsMock && project.renderStatus !== "idle" ? " (mock)" : "";
  const statusLabel = project.renderStatus === "running" ? stageLabel ?? "Starting…" : { idle: "Not rendered yet", running: "Rendering…", done: "Done", failed: "Failed" }[project.renderStatus];
  return <div>
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">Render preview</span>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}{mockTag}</span>
      </div>
      <p className="mb-4 text-xs text-fg-2">
        <span className="font-medium text-fg">Mock</span> uses canned text and the shared timing planner over the source — no TTS or API cost — for checking framing, logo, and subtitle design. <span className="font-medium text-fg">Preview</span> uses the saved narration.wav and the same planner used by the final render. Mock stays silent. Styled subtitles are burned after mirroring, so captions and logos remain readable.
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
        <LoadingButton variant="primary" loading={rendering} disabled={project.renderStatus === "running" || project.scriptStatus === "running" || !project.renderScript?.length} onClick={() => confirmFullRender(project, () => onRenderPreview(false))}>Render Video</LoadingButton>
        {!project.renderScript?.length && <span className="text-xs text-fg-3">Build the script at the Narrative Script step first.</span>}
        {project.renderStatus === "running" && <LoadingButton variant="danger" loading={cancelling} onClick={onCancelRender}>Cancel</LoadingButton>}
      </div>
      {project.renderStatus === "done" && project.renderOutputUrl && <MovieRecapRenderPlayer project={project} />}
    </div>

    <MovieRecapRenderHistory projectId={project.id} />

  </div>;
}
