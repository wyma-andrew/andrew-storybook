"use client";

import { useState } from "react";
import { Download, Send } from "lucide-react";
import { Dialog, toast } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapEpisode, MovieRecapProject } from "@/lib/api/types";
import { apiClient, useRead } from "@/lib/spoosh";
import { FacebookReelComposer } from "./FacebookReelComposer";

export function MovieRecapPublishButton({ project, episode = null }: { project: MovieRecapProject; episode?: MovieRecapEpisode | null }) {
  const { data: me } = useRead((api) => api("auth/me").GET());
  if (!me?.isAdmin) return null;
  return <Button size="sm" className="!h-8" variant="primary" onClick={() => Dialog.show({
    className: "max-w-[860px] w-full",
    dismissOnOutsideClick: false,
    content: ({ dismiss }) => <FacebookReelComposer project={project} episode={episode} dismiss={dismiss} />,
  })}><Send size={14} /> Publish to social</Button>;
}

export function MovieRecapRenderActions({ project }: { project: MovieRecapProject }) {
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
    <div className="ml-auto flex items-center gap-2">
      <LoadingButton size="sm" className="!h-8" loading={downloading} loadingText="Preparing..." disabled={downloading} onClick={() => void downloadVideo()}><Download size={14} /> Download</LoadingButton>
      {!project.renderIsMock && <MovieRecapPublishButton project={project} />}
    </div>
  );
}

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
    <div className="mx-auto mt-4 w-fit max-w-full overflow-hidden rounded-lg border border-line-2 bg-black">
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
  );
}
