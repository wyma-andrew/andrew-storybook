"use client";

import { apiClient } from "@/lib/spoosh";
import { movieRecapPartSize } from "@/lib/movie-recap";
import type { TranslateProject } from "@/lib/translate";

export function readTranslateVideo(file: File) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const result = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      URL.revokeObjectURL(url);
      if (!Number.isFinite(result.duration) || result.duration <= 0 || !result.width || !result.height) reject(new Error("Could not read video dimensions and duration."));
      else resolve(result);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This browser cannot read the selected video.")); };
    video.src = url;
  });
}

export function putPart(url: string, blob: Blob, contentType: string, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStall = () => { if (stallTimer) clearTimeout(stallTimer); };
    const armStall = () => { clearStall(); stallTimer = setTimeout(() => xhr.abort(), 60_000); };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => { onProgress(event.loaded); armStall(); };
    xhr.onload = () => {
      clearStall();
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`Video upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => { clearStall(); reject(new Error("Video upload connection failed.")); };
    xhr.onabort = () => { clearStall(); reject(new Error("Video upload stalled.")); };
    armStall();
    xhr.send(blob);
  });
}

export async function uploadTranslateVideo(project: TranslateProject, file: File, onProgress: (percent: number) => void) {
  if (file.name !== project.sourceFileName || file.size !== project.sourceSizeBytes || file.lastModified !== project.sourceLastModified) {
    throw new Error("Reselect the original video file to resume this project.");
  }
  if (project.sourceUploadStatus === "ready") return project;
  let parts: { partNumber: number; etag: string; size: number }[] = [];
  if (project.sourceUploadStatus === "uploading") {
    const listed = await apiClient("translate-projects/:id/source/multipart").GET({ params: { id: project.id } });
    if (listed.data) parts = listed.data.parts;
    else {
      const restarted = await apiClient("translate-projects/:id/source/multipart").POST({ params: { id: project.id } });
      if (restarted.error) throw new Error(restarted.error.error);
    }
  } else {
    const restarted = await apiClient("translate-projects/:id/source/multipart").POST({ params: { id: project.id } });
    if (restarted.error) throw new Error(restarted.error.error);
  }
  return uploadVideoParts(project.id, file, onProgress, parts, false);
}

export async function replaceTranslateVideo(project: TranslateProject, file: File, onProgress: (percent: number) => void) {
  const metadata = await readTranslateVideo(file);
  const body = {
    fileName: file.name, contentType: file.type, sizeBytes: file.size,
    durationSeconds: metadata.duration, width: metadata.width, height: metadata.height,
    lastModified: file.lastModified,
  };
  const staged = project.sourceReplacement;
  const sameFile = staged?.fileName === file.name && staged.sizeBytes === file.size && staged.lastModified === file.lastModified;
  let parts: { partNumber: number; etag: string; size: number }[] = [];
  if (sameFile) {
    const listed = await apiClient("translate-projects/:id/source/replacement").GET({ params: { id: project.id } });
    if (listed.data) parts = listed.data.parts;
    else {
      const restarted = await apiClient("translate-projects/:id/source/replacement").POST({ params: { id: project.id }, body });
      if (!restarted.data) throw new Error(restarted.error?.error ?? "Could not restart video replacement.");
    }
  } else {
    const started = await apiClient("translate-projects/:id/source/replacement").POST({ params: { id: project.id }, body });
    if (!started.data) throw new Error(started.error?.error ?? "Could not start video replacement.");
  }
  return uploadVideoParts(project.id, file, onProgress, parts, true);
}

async function uploadVideoParts(projectId: string, file: File, onProgress: (percent: number) => void,
  parts: { partNumber: number; etag: string; size: number }[], replacement: boolean) {
  const size = movieRecapPartSize(file.size);
  const count = Math.ceil(file.size / size);
  const etags = new Map(parts.map((part) => [part.partNumber, part.etag]));
  const loaded = new Map(parts.map((part) => [part.partNumber, part.size]));
  const report = () => onProgress(Math.min(100, Math.round([...loaded.values()].reduce((sum, value) => sum + value, 0) / file.size * 100)));
  report();
  const pending = Array.from({ length: count }, (_, index) => index + 1).filter((number) => !etags.has(number));
  let cursor = 0;
  let stopped = false;
  async function worker() {
    while (!stopped && cursor < pending.length) {
      const partNumber = pending[cursor++];
      const blob = file.slice((partNumber - 1) * size, Math.min(file.size, partNumber * size));
      let failure: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const signed = replacement
            ? await apiClient("translate-projects/:id/source/replacement/part").POST({ params: { id: projectId }, body: { partNumber } })
            : await apiClient("translate-projects/:id/source/multipart/part").POST({ params: { id: projectId }, body: { partNumber } });
          if (!signed.data) throw new Error(signed.error?.error ?? "Could not sign upload part.");
          const etag = await putPart(signed.data.uploadUrl, blob, file.type, (n) => { loaded.set(partNumber, n); report(); });
          etags.set(partNumber, etag);
          loaded.set(partNumber, blob.size);
          report();
          failure = null;
          break;
        } catch (error) {
          failure = error;
          loaded.delete(partNumber);
          report();
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
      if (failure) { stopped = true; throw failure; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, pending.length || 1) }, () => worker()));
  const completedParts = { parts: [...etags].map(([partNumber, etag]) => ({ partNumber, etag })) };
  const completed = replacement
    ? await apiClient("translate-projects/:id/source/replacement/complete").POST({ params: { id: projectId }, body: completedParts })
    : await apiClient("translate-projects/:id/source/multipart/complete").POST({ params: { id: projectId }, body: completedParts });
  if (!completed.data) throw new Error(completed.error?.error ?? "Could not complete video upload.");
  onProgress(100);
  return completed.data;
}
