"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@geckoui/geckoui";
import { LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { apiClient } from "@/lib/spoosh";

// Subtitles are burned into the rendered file by libass, so the player draws
// nothing over the video and carries no subtitle track — what you see here is
// the exported frame.
//
// The box is NOT sized from `project.aspectRatio`: this player shows what came
// out of the render, and forcing the configured ratio onto it would hide a
// mismatch between the two — exactly the thing worth seeing here. The video
// keeps its own shape and the frame shrinks to fit it.
export function MovieRecapRenderPlayer({ project }: { project: MovieRecapProject }) {
  const [downloading, setDownloading] = useState(false);

  async function downloadVideo() {
    setDownloading(true);
    try {
      const result = await apiClient("movie-recaps/:id/render/download").GET({ params: { id: project.id } });
      if (result.data) window.location.assign(result.data.url);
      else toast.error(result.error?.error ?? "Could not download the video.");
    } catch {
      toast.error("Could not download the video.");
    } finally {
      setDownloading(false);
    }
  }

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
      <div className="flex justify-center">
        <LoadingButton loading={downloading} loadingText="Preparing download..." disabled={downloading} onClick={() => void downloadVideo()}><Download size={16} /> Download video</LoadingButton>
      </div>
    </div>
  );
}
