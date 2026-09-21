"use client";

import { Download } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
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
      <div className="w-fit max-w-full overflow-hidden rounded-lg border border-line-2 bg-black">
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

      {(project.renderAudioUrl || project.renderFootageUrl) && (
        <div className="space-y-3 rounded-lg border border-line-2 bg-panel p-4">
          {project.renderAudioUrl && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">Narration audio</span>
                <LinkButton
                  href={`/api/movie-recaps/${project.id}/render/download?asset=audio`}
                  className="inline-flex items-center gap-2"
                >
                  <Download className="size-4" /> Download audio
                </LinkButton>
              </div>
              <audio controls preload="metadata" src={project.renderAudioUrl} className="w-full" />
            </div>
          )}

          {project.renderFootageUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-sm text-fg-2">Processed footage without narration</span>
              <LinkButton
                href={`/api/movie-recaps/${project.id}/render/download?asset=footage`}
                className="inline-flex items-center gap-2"
              >
                <Download className="size-4" /> Download footage
              </LinkButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
