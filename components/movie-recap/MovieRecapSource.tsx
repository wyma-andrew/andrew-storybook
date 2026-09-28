"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Film, Loader2, MoreHorizontal, RefreshCw, Trash2, Upload } from "lucide-react";
import { ConfirmDialog, Menu, MenuItem, MenuTrigger, toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { formatBytes, formatDuration, movieRecapPartCount, movieRecapPartSize } from "@/lib/movie-recap";
import { clearRenderHistory } from "@/lib/movie-recap-render-history";
import { apiClient, useWrite } from "@/lib/spoosh";

const UPLOAD_LOG = "[MovieRecapUpload]";

// An R2 part PUT has been seen to send every byte and then never answer. With no
// progress for this long the attempt is aborted so the retry loop can run.
const PART_STALL_MS = 60_000;
const PART_ATTEMPTS = 5;

class PartStallError extends Error {
  constructor(readonly sentBytes: number, readonly partBytes: number) {
    super(sentBytes >= partBytes ? "R2 received the part but never answered." : "Part upload stopped sending.");
  }
}

// Beyond this, a "same video" replacement is probably a different cut, and the
// kept beat timestamps would point at the wrong footage.
const SAME_VIDEO_DURATION_TOLERANCE_S = 2;

function uploadLog(event: string, details?: Record<string, unknown>) {
  console.info(UPLOAD_LOG, event, details ?? {});
}

function uploadError(event: string, error: unknown, details?: Record<string, unknown>) {
  console.error(UPLOAD_LOG, event, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  });
}

function readVideo(file: File) {
  return new Promise<{ duration: number; width: number; height: number; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read this video's duration."));
        return;
      }
      // videoWidth/Height are already loaded with the duration. They are 0 for
      // an audio-only file, and they ignore rotation metadata — see
      // suggestMovieRecapFraming() for what that costs.
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, url });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot preview the selected video."));
    };
    video.src = url;
  });
}

function captureVideoFrame(url: string, atSeconds = 0, remote = false) {
  return new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    const seek = remote || atSeconds > 0;
    video.preload = seek ? "metadata" : "auto";
    video.muted = true;
    if (remote) video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      if (seek) video.currentTime = Math.min(Math.max(atSeconds, 0.01), Math.max(video.duration - 0.01, video.duration / 2));
    };
    const timer = window.setTimeout(() => finish(null), remote ? 30000 : 12000);
    function finish(image: string | null) {
      window.clearTimeout(timer);
      video.onloadeddata = null;
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(image);
    }
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(640, video.videoWidth);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? null);
      } catch {
        finish(null);
      }
    };
    if (seek) video.onseeked = capture;
    else video.onloadeddata = capture;
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function uploadPart(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (loaded: number) => void
) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stalled = false;
    let sentBytes = 0;
    let stallTimer = 0;
    const armStallTimer = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, PART_STALL_MS);
    };
    xhr.addEventListener("loadend", () => window.clearTimeout(stallTimer));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (event) => {
      armStallTimer();
      sentBytes = event.loaded;
      if (event.lengthComputable) onProgress(event.loaded);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (etag) resolve(etag);
        else reject(new Error("R2 did not expose the uploaded part ETag. Check bucket CORS."));
      } else reject(new Error(`Part upload failed (${xhr.status}).`));
    });
    xhr.addEventListener("error", () => reject(new Error("Part upload failed.")));
    xhr.addEventListener("abort", () =>
      reject(stalled ? new PartStallError(sentBytes, blob.size) : new Error("Part upload was cancelled."))
    );
    armStallTimer();
    xhr.send(blob);
  });
}

export function MovieRecapSource({
  project,
  onProject,
}: {
  project: MovieRecapProject | null;
  onProject: (project: MovieRecapProject, localPreviewUrl?: string) => void;
}) {
  const { trigger: createProject } = useWrite((api) => api("movie-recaps").POST());
  const { trigger: replaceSource } = useWrite((api) => api("movie-recaps/:id/source/replace").POST());
  const { trigger: startMultipart } = useWrite((api) => api("movie-recaps/:id/source/multipart").POST());
  const { trigger: signPart } = useWrite((api) => api("movie-recaps/:id/source/multipart/part").POST());
  const { trigger: completeMultipart } = useWrite((api) => api("movie-recaps/:id/source/multipart/complete").POST());
  const { trigger: saveCover } = useWrite((api) => api("movie-recaps/:id/cover").POST());
  const { trigger: deleteProject, loading: deleting } = useWrite((api) => api("movie-recaps/:id").DELETE());
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [settingCover, setSettingCover] = useState(false);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);

  async function setCover() {
    if (!project?.sourceUrl || project.sourceUploadStatus !== "ready") return;
    setSettingCover(true);
    try {
      const remote = !previewUrl;
      const sourceUrl = remote ? new URL(project.sourceUrl) : null;
      sourceUrl?.searchParams.set("cover", crypto.randomUUID());
      const imageBase64 = await captureVideoFrame(
        sourceUrl?.toString() ?? previewUrl!,
        sourceVideoRef.current?.currentTime ?? 0,
        remote,
      );
      if (!imageBase64) throw new Error("Could not capture the video frame at the current playhead.");
      const result = await saveCover({
        params: { id: project.id },
        body: { sourceObjectKey: project.sourceObjectKey, imageBase64 },
        invalidate: ["movie-recaps", `movie-recaps/${project.id}`],
      });
      if (result.error || !result.data) throw new Error(result.error?.error ?? "Could not save cover image.");
      onProject(result.data, previewUrl ?? undefined);
      toast.success("Cover set.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set cover.");
    } finally {
      setSettingCover(false);
    }
  }

  async function begin(file: File, replacing: "same" | null = null) {
    uploadLog("file-selected", {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      existingProjectId: project?.id ?? null,
      existingStatus: project?.sourceUploadStatus ?? null,
      replacing,
    });
    if (!file.type.startsWith("video/")) {
      uploadError("file-rejected", "The selected file is not a video.", { contentType: file.type });
      toast.error("Choose a video file.");
      return;
    }
    setUploading(true);
    setPercent(0);
    let active = project;
    let selectedPreviewUrl: string | null = null;
    let previewAdopted = false;
    try {
      const metadata = await readVideo(file);
      selectedPreviewUrl = metadata.url;
      uploadLog("metadata-ready", { durationSeconds: metadata.duration, width: metadata.width, height: metadata.height });
      if (active && replacing) {
        const { data, error } = await replaceSource({
          params: { id: active.id },
          body: {
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            durationSeconds: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            lastModified: file.lastModified,
            mode: replacing,
          },
          invalidate: ["movie-recaps", `movie-recaps/${active.id}`],
        });
        if (error || !data) throw new Error(error?.error ?? "Could not replace the source video.");
        active = data;
        clearRenderHistory(data.id);
        uploadLog("source-replaced", { projectId: data.id, uploadStatus: data.sourceUploadStatus });
        onProject(data, metadata.url);
      } else if (active) {
        const matches =
          active.sourceFileName === file.name &&
          active.sourceSizeBytes === file.size &&
          active.sourceLastModified === file.lastModified;
        if (!matches) {
          uploadError("resume-file-mismatch", "Selected file fingerprint does not match.", {
            projectId: active.id,
            expectedFileName: active.sourceFileName,
            expectedSizeBytes: active.sourceSizeBytes,
            expectedLastModified: active.sourceLastModified,
          });
          throw new Error("Reselect the same file used to start this project.");
        }
        uploadLog("resume-file-matched", { projectId: active.id });
      } else {
        const { data, error } = await createProject({
          body: {
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            durationSeconds: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            lastModified: file.lastModified,
          },
        });
        if (error || !data) throw new Error(error?.error ?? "Could not create the project.");
        active = data;
        uploadLog("project-created", { projectId: data.id, uploadStatus: data.sourceUploadStatus });
        onProject(data, metadata.url);
        window.history.replaceState(null, "", `/movie-recap/${data.id}`);
      }
      setPreviewUrl(metadata.url);
      previewAdopted = true;

      if (active.sourceUploadStatus === "ready") {
        uploadLog("already-ready", { projectId: active.id });
        onProject(active, metadata.url);
        return;
      }

      let completed: { partNumber: number; etag: string; size: number }[] = [];
      if (active.sourceUploadStatus === "uploading") {
        const result = await apiClient("movie-recaps/:id/source/multipart").GET({ params: { id: active.id } });
        if (result.data) {
          completed = result.data.parts;
          uploadLog("resume-parts-loaded", { projectId: active.id, completedParts: completed.length });
        }
        else {
          uploadError("resume-parts-unavailable", result.error?.error ?? "Could not list saved parts.", { projectId: active.id });
          const restarted = await startMultipart({ params: { id: active.id } });
          if (restarted.error || !restarted.data) throw new Error(restarted.error?.error ?? "Could not restart the upload.");
          active = restarted.data;
          uploadLog("multipart-restarted", { projectId: active.id });
          onProject(active, metadata.url);
        }
      } else {
        const restarted = await startMultipart({ params: { id: active.id } });
        if (restarted.error || !restarted.data) throw new Error(restarted.error?.error ?? "Could not start the upload.");
        active = restarted.data;
        uploadLog("multipart-started", { projectId: active.id });
        onProject(active, metadata.url);
      }

      const partSize = movieRecapPartSize(file.size);
      const count = movieRecapPartCount(file.size, partSize);
      uploadLog("upload-plan", {
        projectId: active.id,
        partSizeBytes: partSize,
        totalParts: count,
        alreadyCompletedParts: completed.length,
        workers: 3,
      });
      const etags = new Map(completed.map((part) => [part.partNumber, part.etag]));
      const loaded = new Map<number, number>();
      for (const part of completed) loaded.set(part.partNumber, part.size);
      const updateProgress = () => {
        const bytes = Array.from(loaded.values()).reduce((sum, value) => sum + value, 0);
        setPercent(Math.min(100, Math.round((bytes / file.size) * 100)));
      };
      updateProgress();

      const pending = Array.from({ length: count }, (_, index) => index + 1).filter((number) => !etags.has(number));
      let cursor = 0;
      let stopped = false;
      async function worker() {
        while (!stopped && cursor < pending.length) {
          const partNumber = pending[cursor++];
          const start = (partNumber - 1) * partSize;
          const blob = file.slice(start, Math.min(file.size, start + partSize));
          let lastError: unknown;
          for (let attempt = 0; attempt < PART_ATTEMPTS && !stopped; attempt++) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, 2_000 * 2 ** (attempt - 1))));
            try {
              uploadLog("part-attempt", { partNumber, attempt: attempt + 1, totalParts: count });
              const signed = await signPart({ params: { id: active!.id }, body: { partNumber } });
              if (signed.error || !signed.data) throw new Error(signed.error?.error ?? "Could not sign an upload part.");
              const etag = await uploadPart(signed.data.uploadUrl, blob, file.type, (partLoaded) => {
                loaded.set(partNumber, partLoaded);
                updateProgress();
              });
              etags.set(partNumber, etag);
              loaded.set(partNumber, blob.size);
              updateProgress();
              uploadLog("part-complete", { partNumber, sizeBytes: blob.size, totalParts: count });
              lastError = null;
              break;
            } catch (error) {
              uploadError("part-attempt-failed", error, {
                partNumber,
                attempt: attempt + 1,
                totalParts: count,
                ...(error instanceof PartStallError && { sentBytes: error.sentBytes, partBytes: error.partBytes }),
              });
              lastError = error;
              loaded.delete(partNumber);
              updateProgress();
            }
          }
          if (lastError) {
            stopped = true;
            throw lastError;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, pending.length || 1) }, () => worker()));
      const parts = Array.from(etags, ([partNumber, etag]) => ({ partNumber, etag }));
      uploadLog("completing-multipart", { projectId: active.id, completedParts: parts.length });
      const result = await completeMultipart({ params: { id: active.id }, body: { parts } });
      if (result.error || !result.data) throw new Error(result.error?.error ?? "Could not finish the upload.");
      setPercent(100);
      onProject(result.data, metadata.url);
      uploadLog("upload-complete", { projectId: active.id, completedParts: parts.length });
      try {
        const imageBase64 = await captureVideoFrame(metadata.url);
        if (!imageBase64) throw new Error("Could not capture the first video frame.");
        const cover = await saveCover({
          params: { id: active.id },
          body: { sourceObjectKey: active.sourceObjectKey, imageBase64 },
          invalidate: ["movie-recaps", `movie-recaps/${active.id}`],
        });
        if (cover.error || !cover.data) throw new Error(cover.error?.error ?? "Could not save cover image.");
        onProject(cover.data, metadata.url);
      } catch (coverError) {
        uploadError("cover-unavailable", coverError, { projectId: active.id });
      }
      toast.success("Video upload complete.");
    } catch (error) {
      if (selectedPreviewUrl && !previewAdopted) URL.revokeObjectURL(selectedPreviewUrl);
      uploadError("upload-stopped", error, { projectId: active?.id ?? null });
      toast.error(error instanceof Error ? error.message : "Could not upload the video.");
    } finally {
      setUploading(false);
    }
  }

  // At this step the project IS the source: its name, framing and object key all
  // came from the file, and the transcript and every render hang off it. So
  // removing the video removes the project rather than leaving a project with a
  // hole where its source was — see history/movie-recap.md.
  function confirmDelete() {
    if (!project) return;
    ConfirmDialog.show({
      title: "Delete this project?",
      content: `“${project.sourceFileName}” and everything generated from it will be permanently deleted, and the project with it.`,
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const result = await deleteProject({ params: { id: project.id } });
        if (result.error) {
          toast.error(result.error.error);
          return;
        }
        dismiss();
        toast.success("Project deleted.");
        router.push("/movie-recap");
      },
    });
  }

  function confirmReplace() {
    if (!project) return;
    ConfirmDialog.show({
      title: "Replace with a better-quality copy?",
      content: "Use this for the same video in better quality. Your transcript, narrative script, narration, and Customize Video settings stay. Render outputs and render history are cleared, and the letterbox crop is measured again at the next render.",
      confirmButtonLabel: "Choose replacement",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        void openReplacementPicker({ multiple: false });
      },
    });
  }

  async function replaceWith(file: File) {
    if (!project) return;
    const metadata = await readVideo(file).catch(() => null);
    if (metadata) URL.revokeObjectURL(metadata.url);
    const driftS = metadata ? Math.abs(metadata.duration - project.sourceDurationSeconds) : 0;
    if (driftS <= SAME_VIDEO_DURATION_TOLERANCE_S) {
      void begin(file, "same");
      return;
    }
    ConfirmDialog.show({
      title: "Durations do not match",
      content: `The new file is ${formatDuration(metadata!.duration)} and the current one is ${formatDuration(project.sourceDurationSeconds)}. The existing narration timings will be kept, so continue only if this is the same cut.`,
      confirmButtonLabel: "Keep script anyway",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        void begin(file, "same");
      },
    });
  }

  const { dropzoneRef, dragging, openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, newFiles) => {
      const file = newFiles[0];
      if (file) void begin(file);
    },
  });
  const { openFilePicker: openReplacementPicker } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, newFiles) => {
      const file = newFiles[0];
      if (file) void replaceWith(file);
    },
  });
  const ready = project?.sourceUploadStatus === "ready";
  const source = ready ? previewUrl ?? project?.sourceUrl ?? null : null;
  const details = useMemo(() => project ? [
    ["Filename", project.sourceFileName],
    ["File size", formatBytes(project.sourceSizeBytes)],
    ["Duration", formatDuration(project.sourceDurationSeconds)],
  ] : [], [project]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel-2 text-fg-2"><Film size={19} /></div>
        <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">Add Source</h2><p className="text-sm text-fg-2">Upload the movie you want to recap.</p></div>
        {ready && (
          <LoadingButton className="ml-auto shrink-0" loading={settingCover} loadingText="Setting cover..." disabled={uploading} onClick={() => void setCover()}>
            Set cover
          </LoadingButton>
        )}
      </div>

      {source ? (
        <div className="overflow-hidden rounded-xl border border-line bg-sunken">
          <video ref={sourceVideoRef} className="max-h-[520px] w-full bg-sunken" src={source} controls preload="metadata" />
        </div>
      ) : project ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-line bg-sunken p-8 text-center">
          <Film className="mb-3 text-fg-3" size={30} />
          <p className="mb-1 font-medium">{project.sourceFileName}</p>
          <p className="text-sm text-fg-3">{uploading ? "The preview appears once the upload finishes." : "This upload did not finish, so there is nothing to play yet."}</p>
        </div>
      ) : (
        <div
          ref={dropzoneRef}
          className={`flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center ${dragging ? "border-accent bg-accent-dim" : "border-line-2 bg-panel-2"}`}
        >
          <Upload className="mb-3 text-fg-3" size={30} />
          <p className="mb-1 font-medium">Drop a playable video here</p>
          <p className="mb-5 text-sm text-fg-3">The browser must be able to preview the selected file.</p>
          <LoadingButton variant="primary" loading={uploading} onClick={() => openFilePicker({ multiple: false })}>Choose video</LoadingButton>
        </div>
      )}

      {project && (
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {details.map(([label, value]) => <div key={label}><div className="text-[11px] uppercase tracking-wide text-fg-3">{label}</div><div className="mt-1 truncate text-sm text-fg">{value}</div></div>)}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-fg-3">Replace the source and keep your settings, or delete the entire project.</p>
            <div className="flex items-center gap-2">
              <Button disabled={uploading || deleting} onClick={confirmReplace}>
                <RefreshCw size={15} /> Replace video
              </Button>
              <Menu menuClassName="min-w-[180px] p-0" placement="bottom-end">
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <Button className="!w-9 !px-0" aria-label="More actions" disabled={uploading || deleting} onClick={toggleMenu}>
                      {deleting ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={16} />}
                    </Button>
                  )}
                </MenuTrigger>
                <MenuItem onClick={confirmDelete}>
                  <span className="flex items-center gap-2 text-danger"><Trash2 size={14} /> Delete project</span>
                </MenuItem>
              </Menu>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div aria-live="polite">
          <div className="mb-1.5 flex justify-between text-xs text-fg-2"><span>Uploading video</span><span>{percent}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} /></div>
        </div>
      )}
      {ready && !uploading && <div className="flex items-center gap-2 text-sm font-medium text-ok"><CheckCircle2 size={17} /> Video is ready</div>}
      {project && !ready && !uploading && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-3">
          <p className="flex-1 text-sm text-fg-2">Reselect the same local file to continue this upload.</p>
          <Button onClick={() => openFilePicker({ multiple: false })}>Reselect video</Button>
        </div>
      )}
    </div>
  );
}
