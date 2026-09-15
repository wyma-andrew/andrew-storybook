"use client";

import { useRef } from "react";
import Image from "next/image";
import { Grip } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import { MOVIE_RECAP_LOGO_BOX, MOVIE_RECAP_SUBTITLE_SAMPLE } from "@/lib/constants/movie-recap";
import { clampBlurRect } from "@/lib/movie-recap";
import { MovieRecapSubtitleOverlay } from "./MovieRecapSubtitle";

type BlurRect = { x: number; y: number; width: number; height: number };

// Corner anchors use the shared margin so the CSS preview and the ffmpeg
// overlay place the logo identically (MOVIE_RECAP_LOGO_BOX).
const m = `${MOVIE_RECAP_LOGO_BOX.marginPct}%`;
const logoPosition: Record<MovieRecapProject["logoPlacement"], React.CSSProperties> = {
  top_left: { left: m, top: m, justifyContent: "flex-start", alignItems: "flex-start" },
  top_right: { right: m, top: m, justifyContent: "flex-end", alignItems: "flex-start" },
  bottom_left: { left: m, bottom: m, justifyContent: "flex-start", alignItems: "flex-end" },
  bottom_right: { right: m, bottom: m, justifyContent: "flex-end", alignItems: "flex-end" },
};

export function MovieRecapPreview({
  project,
  videoUrl,
  blur,
  onBlurChange,
}: {
  project: MovieRecapProject;
  videoUrl: string | null;
  blur: BlurRect;
  onBlurChange: (rect: BlurRect) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const frame = frameRef.current;
    if (!start || !frame || start.pointerId !== event.pointerId) return;
    const bounds = frame.getBoundingClientRect();
    onBlurChange(clampBlurRect({
      ...blur,
      x: start.x + ((event.clientX - start.clientX) / bounds.width) * 100,
      y: start.y + ((event.clientY - start.clientY) / bounds.height) * 100,
    }));
  }

  function nudge(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.shiftKey ? 5 : 1;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta],
    };
    const change = movement[event.key];
    if (!change) return;
    event.preventDefault();
    onBlurChange(clampBlurRect({ ...blur, x: blur.x + change[0], y: blur.y + change[1] }));
  }

  return (
    <div>
      <div className="mb-2 text-sm font-medium">Uploaded Video</div>
      <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-line bg-sunken p-5">
        <div
          ref={frameRef}
          className={`relative overflow-hidden rounded-lg border border-line-2 bg-bg shadow-xl ${
            project.aspectRatio === "9:16" ? "h-[480px] w-auto" : "w-full max-w-[620px] h-auto"
          }`}
          style={{ aspectRatio: project.aspectRatio === "9:16" ? "9 / 16" : "16 / 9" }}
        >
          {videoUrl ? (
            <video
              src={videoUrl}
              className={`h-full w-full ${project.fitMode === "contain" ? "object-contain bg-black" : "object-cover"}`}
              controls
              preload="metadata"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-fg-3">Video preview unavailable</div>
          )}

          <MovieRecapSubtitleOverlay project={project} text={MOVIE_RECAP_SUBTITLE_SAMPLE} />

          {project.logoEnabled && (
            <div
              className="pointer-events-none absolute flex"
              style={{
                ...logoPosition[project.logoPlacement],
                width: `${MOVIE_RECAP_LOGO_BOX.widthPct}%`,
                height: `${MOVIE_RECAP_LOGO_BOX.heightPct}%`,
                opacity: project.logoOpacity / 100,
              }}
            >
              {project.logoUrl ? <Image src={project.logoUrl} alt="Brand logo preview" width={320} height={160} unoptimized className="max-h-full max-w-full object-contain" /> : <div className="grid h-full w-full place-items-center rounded border border-dashed border-line-2 bg-panel/80 text-[10px] font-semibold text-fg-2">LOGO</div>}
            </div>
          )}

          {project.blurEnabled && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Move blur area. Use arrow keys for one percent steps and Shift for five percent steps."
              className="absolute z-20 grid cursor-move touch-none place-items-center overflow-hidden rounded-md border border-accent bg-panel/35 text-on-accent shadow-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent"
              style={{ left: `${blur.x}%`, top: `${blur.y}%`, width: `${blur.width}%`, height: `${blur.height}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: blur.x, y: blur.y };
              }}
              onPointerMove={move}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                dragRef.current = null;
              }}
              onPointerCancel={() => { dragRef.current = null; }}
              onKeyDown={nudge}
            >
              <Grip size={18} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
