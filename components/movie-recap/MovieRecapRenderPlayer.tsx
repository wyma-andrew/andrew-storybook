"use client";

import type { MovieRecapProject } from "@/lib/api/types";

// Subtitles are burned into the rendered file by libass, so the player draws
// nothing over the video and carries no subtitle track — what you see here is
// the exported frame.
export function MovieRecapRenderPlayer({ project }: { project: MovieRecapProject }) {
  return (
    <div
      className={`relative mt-4 w-full overflow-hidden rounded-lg border border-line-2 bg-black ${
        project.aspectRatio === "9:16" ? "max-w-[280px]" : "max-w-md"
      }`}
      style={{ aspectRatio: project.aspectRatio === "9:16" ? "9 / 16" : "16 / 9" }}
    >
      <video controls muted crossOrigin="anonymous" src={project.renderOutputUrl ?? undefined} className="h-full w-full" />
    </div>
  );
}
