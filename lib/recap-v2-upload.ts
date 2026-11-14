"use client";

import { apiClient } from "@/lib/spoosh";
import { movieRecapPartSize } from "@/lib/movie-recap";
import type { RecapV2Project } from "@/lib/recap-v2";
import { putPart } from "@/lib/translate-upload";

export async function uploadRecapV2Video(project: RecapV2Project, file: File, onProgress: (percent: number) => void) {
  if (file.name !== project.sourceFileName || file.size !== project.sourceSizeBytes || file.lastModified !== project.sourceLastModified) {
    throw new Error("Reselect the original video file to resume this project.");
  }
  if (project.sourceUploadStatus === "ready") return project;
  let parts: { partNumber: number; etag: string; size: number }[] = [];
  const listed = project.sourceUploadStatus === "uploading"
    ? await apiClient("recap-v2-projects/:id/source/multipart").GET({ params: { id: project.id } })
    : null;
  if (listed?.data) parts = listed.data.parts;
  else {
    const restarted = await apiClient("recap-v2-projects/:id/source/multipart").POST({ params: { id: project.id } });
    if (restarted.error) throw new Error(restarted.error.error);
  }

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
          const signed = await apiClient("recap-v2-projects/:id/source/multipart/part").POST({ params: { id: project.id }, body: { partNumber } });
          if (!signed.data) throw new Error(signed.error?.error ?? "Could not sign upload part.");
          etags.set(partNumber, await putPart(signed.data.uploadUrl, blob, file.type, (n) => { loaded.set(partNumber, n); report(); }));
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
  const completed = await apiClient("recap-v2-projects/:id/source/multipart/complete").POST({
    params: { id: project.id }, body: { parts: [...etags].map(([partNumber, etag]) => ({ partNumber, etag })) },
  });
  if (!completed.data) throw new Error(completed.error?.error ?? "Could not complete video upload.");
  onProgress(100);
  return completed.data;
}
