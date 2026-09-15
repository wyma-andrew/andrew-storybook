"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Film, Upload } from "lucide-react";
import { toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { formatBytes, formatDuration, movieRecapPartCount, movieRecapPartSize } from "@/lib/movie-recap";
import { apiClient, useWrite } from "@/lib/spoosh";

const UPLOAD_LOG = "[MovieRecapUpload]";

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
  return new Promise<{ duration: number; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read this video's duration."));
        return;
      }
      resolve({ duration: video.duration, url });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot preview the selected video."));
    };
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
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (event) => {
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
    xhr.addEventListener("abort", () => reject(new Error("Part upload was cancelled.")));
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
  const { trigger: startMultipart } = useWrite((api) => api("movie-recaps/:id/source/multipart").POST());
  const { trigger: signPart } = useWrite((api) => api("movie-recaps/:id/source/multipart/part").POST());
  const { trigger: completeMultipart } = useWrite((api) => api("movie-recaps/:id/source/multipart/complete").POST());
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function begin(file: File) {
    uploadLog("file-selected", {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      existingProjectId: project?.id ?? null,
      existingStatus: project?.sourceUploadStatus ?? null,
    });
    if (!file.type.startsWith("video/")) {
      uploadError("file-rejected", "The selected file is not a video.", { contentType: file.type });
      toast.error("Choose a video file.");
      return;
    }
    setUploading(true);
    setPercent(0);
    let active = project;
    try {
      const metadata = await readVideo(file);
      uploadLog("metadata-ready", { durationSeconds: metadata.duration });
      setPreviewUrl(metadata.url);
      if (active) {
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
            lastModified: file.lastModified,
          },
        });
        if (error || !data) throw new Error(error?.error ?? "Could not create the project.");
        active = data;
        uploadLog("project-created", { projectId: data.id, uploadStatus: data.sourceUploadStatus });
        onProject(data, metadata.url);
        window.history.replaceState(null, "", `/movie-recap/${data.id}`);
      }

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
      async function worker() {
        while (cursor < pending.length) {
          const partNumber = pending[cursor++];
          const start = (partNumber - 1) * partSize;
          const blob = file.slice(start, Math.min(file.size, start + partSize));
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
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
              uploadError("part-attempt-failed", error, { partNumber, attempt: attempt + 1, totalParts: count });
              lastError = error;
              loaded.delete(partNumber);
              updateProgress();
            }
          }
          if (lastError) throw lastError;
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
      toast.success("Video upload complete.");
    } catch (error) {
      uploadError("upload-stopped", error, { projectId: active?.id ?? null });
      toast.error(error instanceof Error ? error.message : "Could not upload the video.");
    } finally {
      setUploading(false);
    }
  }

  const { dropzoneRef, dragging, openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, newFiles) => {
      const file = newFiles[0];
      if (file) void begin(file);
    },
  });
  const source = previewUrl ?? project?.sourceUrl ?? null;
  const ready = project?.sourceUploadStatus === "ready";
  const details = useMemo(() => project ? [
    ["Filename", project.sourceFileName],
    ["File size", formatBytes(project.sourceSizeBytes)],
    ["Duration", formatDuration(project.sourceDurationSeconds)],
  ] : [], [project]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel-2 text-fg-2"><Film size={19} /></div>
        <div><h2 className="text-lg font-semibold">Add Source</h2><p className="text-sm text-fg-2">Upload the movie you want to recap.</p></div>
      </div>

      {source ? (
        <div className="overflow-hidden rounded-xl border border-line bg-sunken">
          <video className="max-h-[520px] w-full bg-sunken" src={source} controls preload="metadata" />
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
        <div className="grid gap-3 rounded-xl border border-line bg-panel-2 p-4 sm:grid-cols-3">
          {details.map(([label, value]) => <div key={label}><div className="text-[11px] uppercase tracking-wide text-fg-3">{label}</div><div className="mt-1 truncate text-sm text-fg">{value}</div></div>)}
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
