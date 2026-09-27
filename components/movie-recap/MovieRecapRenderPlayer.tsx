"use client";

import type { MovieRecapProject } from "@/lib/api/types";

// Subtitles are burned into the rendered file by libass, so the player draws
// nothing over the video and carries no subtitle track — what you see here is
// the exported frame.
//
// The box is NOT sized from `project.aspectRatio`: this player shows what came
// out of the render, and forcing the configured ratio onto it would hide a
// mismatch between the two — exactly the thing worth seeing here. The video
// keeps its own shape and the frame shrinks to fit it.
export function MovieRecapRenderPlayer({ project }: { project: MovieRecapProject }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-line-2 bg-black">
        {/* Not muted: the export carries the synthesized narration now, and a
            muted-by-default player would hide the half of the render that is
            hardest to check. */}
        <video
          controls
          crossOrigin="anonymous"
          preload="metadata"
          src={project.renderOutputUrl ?? undefined}
          className="block h-auto max-h-[70vh] w-auto max-w-full"
        />
      </div>

    </div>
  );
}
