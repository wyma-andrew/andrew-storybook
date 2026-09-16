"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Grip, Pause, Play } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import {
  MOVIE_RECAP_COPYRIGHT_TRANSFORM,
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_SUBTITLE_SAMPLE,
  MOVIE_RECAP_TARGET_DIMENSIONS,
  movieRecapBlurCssPx,
} from "@/lib/constants/movie-recap";
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

// The blur radius has to be resolved against the frame's real drawn width, so
// it is measured rather than assumed from the max-width class.
function useFrameWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    setWidth(frame.clientWidth);
    const observer = new ResizeObserver(() => setWidth(frame.clientWidth));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function MovieRecapPreview({
  project,
  videoUrl,
  blur,
  onBlurChange,
  previewZoom,
}: {
  project: MovieRecapProject;
  videoUrl: string | null;
  blur: BlurRect;
  onBlurChange: (rect: BlurRect) => void;
  // TEMPORARY: a zoom factor to try out in the preview only. It is not saved and
  // the render does not read it — `MOVIE_RECAP_COPYRIGHT_TRANSFORM.zoom` is what
  // actually burns. This exists to pick that number by eye; remove the prop and
  // the slider once it is chosen.
  previewZoom?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  // The native control bar sits along the bottom of the frame — exactly where the
  // subtitle is — so it hid the thing this preview exists to show. Play/pause is
  // all a design preview needs.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const frameWidth = useFrameWidth(frameRef);
  // The export blurs in output pixels; the preview frame is drawn a few hundred
  // pixels wide, so the same radius here would blur far harder than the render.
  const blurPx = movieRecapBlurCssPx(frameWidth, MOVIE_RECAP_TARGET_DIMENSIONS[project.aspectRatio][0]);
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
            // Zoom magnifies the FITTED picture and the frame clips it, which is
            // what the render does (`scale` after framing, then crop to frame).
            // So the CSS is a plain transform on the fitted video: the letterboxed
            // strip grows, the bars shrink, and the sides leave the frame.
            //
            // An earlier version drew the strip at the SOURCE's aspect ratio and
            // scaled inside it, which held the bars still and cropped all four
            // sides. That matched the render as it was THEN — zoom applied before
            // framing — and stopped matching the moment the render's order
            // changed. Both are in history/movie-recap.md; the render is the
            // output, so the preview follows it.
            <video
              src={videoUrl}
              className={`h-full w-full ${project.fitMode === "contain" ? "object-contain bg-black" : "object-cover"}`}
              style={{
                transform: [
                  previewZoom && previewZoom !== 1 ? `scale(${previewZoom})` : "",
                  // Read from the same constant the render reads. This was a
                  // hardcoded `=== "16:9"` and would have gone on showing an
                  // unmirrored portrait preview against a mirrored export.
                  project.copyrightFree && MOVIE_RECAP_COPYRIGHT_TRANSFORM.mirrorAspectRatios.includes(project.aspectRatio)
                    ? "scaleX(-1)"
                    : "",
                ].filter(Boolean).join(" ") || undefined,
                // Same numbers the ffmpeg `eq` gets, read from the constant so
                // the two cannot drift. Gamma is deliberately absent: CSS has no
                // gamma filter, so the preview is slightly lighter than the
                // export at gamma 0.98.
                filter: project.copyrightFree
                  ? `contrast(${MOVIE_RECAP_COPYRIGHT_TRANSFORM.contrast}) saturate(${MOVIE_RECAP_COPYRIGHT_TRANSFORM.saturation})`
                  : undefined,
              }}
              preload="metadata"
              ref={videoRef}
              playsInline
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-fg-3">Video preview unavailable</div>
          )}
          {videoUrl && (
            // A button rather than a click handler on the video: it has to be
            // reachable by keyboard, and the blur rectangle above it needs its
            // own pointer events, so this layer sits below that one.
            <button
              type="button"
              aria-label={playing ? "Pause preview" : "Play preview"}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play().catch(() => setPlaying(false));
                else video.pause();
              }}
              className="absolute inset-0 z-20 focus-visible:outline-none"
            >
              {/* Small and in a corner: a centred badge covers the middle of the
                  frame, which is the part being designed. The whole surface is
                  still the click target — this is only the state indicator. */}
              <span className="absolute bottom-2 left-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                {playing ? <Pause size={13} /> : <Play size={13} className="ml-px" />}
              </span>
            </button>
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

          {/* No tint and no drop shadow on the blur region: the export only
              blurs it, so the old `bg-panel/35` wash made the preview darker
              than the render — which is what made the subtitle colour look
              different between the two (history/movie-recap.md). The accent
              border and the grip are editor chrome, preview-only by design. */}
          {project.blurEnabled && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Move blur area. Use arrow keys for one percent steps and Shift for five percent steps."
              className="absolute z-20 grid cursor-move touch-none place-items-center overflow-hidden rounded-md border border-accent text-fg focus:outline-none focus:ring-2 focus:ring-accent"
              style={{
                left: `${blur.x}%`,
                top: `${blur.y}%`,
                width: `${blur.width}%`,
                height: `${blur.height}%`,
                backdropFilter: `blur(${blurPx.toFixed(2)}px)`,
                WebkitBackdropFilter: `blur(${blurPx.toFixed(2)}px)`,
              }}
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
