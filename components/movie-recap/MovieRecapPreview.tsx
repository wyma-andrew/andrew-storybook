"use client";

import { useRef } from "react";
import Image from "next/image";
import { Grip } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import { clampBlurRect } from "@/lib/movie-recap";

type BlurRect = { x: number; y: number; width: number; height: number };

const logoPosition: Record<MovieRecapProject["logoPlacement"], string> = {
  top_left: "left-[4%] top-[4%]",
  top_right: "right-[4%] top-[4%]",
  bottom_left: "bottom-[4%] left-[4%]",
  bottom_right: "bottom-[4%] right-[4%]",
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
          className="relative max-h-[480px] w-full max-w-[620px] overflow-hidden rounded-lg border border-line-2 bg-bg shadow-xl"
          style={{ aspectRatio: project.aspectRatio === "9:16" ? "9 / 16" : "16 / 9" }}
        >
          {videoUrl ? <video src={videoUrl} className="h-full w-full object-cover" controls preload="metadata" /> : <div className="grid h-full place-items-center text-sm text-fg-3">Video preview unavailable</div>}

          {project.subtitleMode === "styled" && (
            <div className="pointer-events-none absolute inset-x-[8%] bottom-[8%] text-center">
              <span className="inline-block rounded-md bg-bg/80 px-3 py-1.5 text-sm font-semibold text-fg shadow-lg">The subtitle will show here</span>
            </div>
          )}

          {project.logoEnabled && (
            <div className={`pointer-events-none absolute w-[18%] ${logoPosition[project.logoPlacement]}`} style={{ opacity: project.logoOpacity / 100 }}>
              {project.logoUrl ? <Image src={project.logoUrl} alt="Brand logo preview" width={160} height={80} unoptimized className="max-h-16 max-w-full object-contain" /> : <div className="rounded border border-dashed border-line-2 bg-panel/80 px-2 py-1 text-center text-[10px] font-semibold text-fg-2">LOGO</div>}
            </div>
          )}

          {project.blurEnabled && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Move blur area. Use arrow keys for one percent steps and Shift for five percent steps."
              className="absolute grid cursor-move touch-none place-items-center overflow-hidden rounded-md border border-accent bg-panel/35 text-on-accent shadow-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent"
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
