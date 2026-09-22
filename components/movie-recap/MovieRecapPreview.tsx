"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Grip, Pause, Play } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import {
  MOVIE_RECAP_LOOK,
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_SUBTITLE_SAMPLE,
  movieRecapBackfillBlurCssPx,
  movieRecapBlurCssPx,
} from "@/lib/constants/movie-recap";
import { clampBlurRect, formatDuration } from "@/lib/movie-recap";
import { MovieRecapHookTitleOverlay, MovieRecapSubtitleOverlay } from "./MovieRecapSubtitle";

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
  selectedBlur,
  onBlurChange,
  onBlurSelect,
  previewZoom,
}: {
  project: MovieRecapProject;
  videoUrl: string | null;
  /** Which blur region the drag handles belong to; -1 for none. */
  selectedBlur?: number;
  onBlurChange?: (index: number, rect: BlurRect) => void;
  onBlurSelect?: (index: number) => void;
  // The project's zoom, drawn as a CSS scale so the preview shows what the
  // render will burn. Passed in rather than read from the project here because
  // the caller already resolves "unset means the recommendation for this fit
  // mode" (`effectiveMovieRecapZoom`).
  previewZoom?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentS, setCurrentS] = useState(0);
  const [durationS, setDurationS] = useState(0);
  const scrubbingRef = useRef(false);
  const frameWidth = useFrameWidth(frameRef);
  // The export blurs in output pixels; the preview frame is drawn a few hundred
  // pixels wide, so the same radius here would blur far harder than the render.
  const blurPx = movieRecapBlurCssPx(frameWidth, project.aspectRatio);
  const backfillBlurPx = movieRecapBackfillBlurCssPx(frameWidth, project.aspectRatio);
  const mirrored = MOVIE_RECAP_LOOK.mirrorAspectRatios.includes(project.aspectRatio);
  const colorFilter = `contrast(${MOVIE_RECAP_LOOK.contrast}) saturate(${MOVIE_RECAP_LOOK.saturation})`;
  const dragRef = useRef<
    { pointerId: number; clientX: number; clientY: number; x: number; y: number; index: number } | null
  >(null);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const frame = frameRef.current;
    const region = start ? project.blurRegions[start.index] : undefined;
    if (!start || !frame || !region || start.pointerId !== event.pointerId) return;
    const bounds = frame.getBoundingClientRect();
    onBlurChange?.(start.index, clampBlurRect({
      ...region,
      x: start.x + ((event.clientX - start.clientX) / bounds.width) * 100,
      y: start.y + ((event.clientY - start.clientY) / bounds.height) * 100,
    }));
  }

  function nudge(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const region = project.blurRegions[index];
    const delta = event.shiftKey ? 5 : 1;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta],
    };
    const change = movement[event.key];
    if (!change || !region) return;
    event.preventDefault();
    onBlurChange?.(index, clampBlurRect({ ...region, x: region.x + change[0], y: region.y + change[1] }));
  }

  return (
    <div>
      <div className="flex min-h-[520px] flex-col items-center justify-start gap-3 rounded-xl border border-line bg-sunken p-5">
        <div className={project.aspectRatio === "9:16" ? "w-auto" : "w-full max-w-[620px]"}>
          <div
            ref={frameRef}
            className={`relative overflow-hidden rounded-lg border border-line-2 bg-bg shadow-xl ${
              project.aspectRatio === "9:16" ? "h-[480px] w-auto" : "w-full max-w-[620px] h-auto"
            }`}
            style={{ aspectRatio: project.aspectRatio === "9:16" ? "9 / 16" : project.aspectRatio === "1:1" ? "1 / 1" : "16 / 9" }}
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
              <>
                {project.fitMode === "contain" && project.dynamicBackgroundBlurEnabled && (
                  <video
                    ref={backgroundVideoRef}
                    src={videoUrl}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover"
                    style={{
                      transform: `scale(1.1)${mirrored ? " scaleX(-1)" : ""}`,
                      filter: `blur(${backfillBlurPx.toFixed(2)}px) ${colorFilter}`,
                    }}
                    preload="metadata"
                    playsInline
                    muted
                  />
                )}
                <video
                  src={videoUrl}
                  className={`relative z-10 h-full w-full ${project.fitMode === "contain" ? "object-contain" : "object-cover"}`}
                  style={{
                    transform: [
                      previewZoom && previewZoom !== 1 ? `scale(${previewZoom})` : "",
                      // Read from the same constant the render reads. This was a
                      // hardcoded `=== "16:9"` and would have gone on showing an
                      // unmirrored portrait preview against a mirrored export.
                      mirrored ? "scaleX(-1)" : "",
                    ].filter(Boolean).join(" ") || undefined,
                    // Same numbers the ffmpeg `eq` gets, read from the constant so
                    // the two cannot drift. Gamma is deliberately absent: CSS has no
                    // gamma filter, so the preview is slightly lighter than the
                    // export at gamma 0.98.
                    filter: colorFilter,
                  }}
                  preload="metadata"
                  ref={videoRef}
                  playsInline
                  onPlay={(event) => {
                    setPlaying(true);
                    const background = backgroundVideoRef.current;
                    if (!background) return;
                    background.currentTime = event.currentTarget.currentTime;
                    void background.play().catch(() => undefined);
                  }}
                  onPause={() => {
                    setPlaying(false);
                    backgroundVideoRef.current?.pause();
                  }}
                  onEnded={() => {
                    setPlaying(false);
                    backgroundVideoRef.current?.pause();
                  }}
                  onLoadedMetadata={(event) => setDurationS(event.currentTarget.duration)}
                  onSeeking={(event) => {
                    if (backgroundVideoRef.current) backgroundVideoRef.current.currentTime = event.currentTarget.currentTime;
                  }}
                  onTimeUpdate={(event) => {
                    const time = event.currentTarget.currentTime;
                    if (!scrubbingRef.current) setCurrentS(time);
                    const background = backgroundVideoRef.current;
                    if (background && Math.abs(background.currentTime - time) > 0.08) background.currentTime = time;
                  }}
                />
              </>
            ) : (
              <div className="grid h-full place-items-center text-sm text-fg-3">Video preview unavailable</div>
            )}
            {project.subtitlesEnabled && <MovieRecapSubtitleOverlay project={project} text={MOVIE_RECAP_SUBTITLE_SAMPLE} />}
            <MovieRecapHookTitleOverlay project={project} />

            {project.logoEnabled && (
              <div
                className="pointer-events-none absolute z-20 flex"
                style={{
                  ...logoPosition[project.logoPlacement],
                  width: `${project.aspectRatio === "9:16" ? MOVIE_RECAP_LOGO_BOX.portraitWidthPct : MOVIE_RECAP_LOGO_BOX.widthPct}%`,
                  height: `${MOVIE_RECAP_LOGO_BOX.heightPct}%`,
                  opacity: project.logoOpacity / 100,
                }}
              >
                {project.logoUrl ? <Image src={project.logoUrl} alt="Brand logo preview" width={320} height={160} unoptimized className={`max-h-full max-w-full object-contain ${project.logoPlacement.endsWith("right") ? "object-right" : "object-left"}`} /> : <div className="grid h-full w-full place-items-center rounded border border-dashed border-line-2 bg-panel/80 text-[10px] font-semibold text-fg-2">LOGO</div>}
              </div>
            )}

            {project.logoEnabled && project.logoWatermarkText && <span className="pointer-events-none absolute inset-0 z-30 grid place-items-center select-none px-4 text-center text-xs font-bold uppercase tracking-[0.14em] text-fg opacity-30">{project.logoWatermarkText}</span>}

            {/* No tint and no drop shadow on the blur region: the export only
                blurs it, so the old `bg-panel/35` wash made the preview darker
                than the render — which is what made the subtitle colour look
                different between the two (history/movie-recap.md). The accent
                border and the grip are editor chrome, preview-only by design. */}
            {project.blurRegions.map((region, index) => {
              const selected = index === selectedBlur;
              return (
                <div
                  key={index}
                  role="button"
                  tabIndex={0}
                  aria-label={`Blur area ${index + 1}. Use arrow keys for one percent steps and Shift for five percent steps.`}
                  className={`absolute z-20 grid touch-none place-items-center overflow-hidden rounded-md text-fg focus:outline-none focus:ring-2 focus:ring-accent ${
                    selected ? "cursor-move border border-accent" : "cursor-pointer border border-line-2"
                  }`}
                  style={{
                    left: `${region.x}%`,
                    top: `${region.y}%`,
                    width: `${region.width}%`,
                    height: `${region.height}%`,
                    backdropFilter: `blur(${blurPx.toFixed(2)}px)`,
                    WebkitBackdropFilter: `blur(${blurPx.toFixed(2)}px)`,
                  }}
                  onPointerDown={(event) => {
                    onBlurSelect?.(index);
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = {
                      pointerId: event.pointerId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      x: region.x,
                      y: region.y,
                      index,
                    };
                  }}
                  onPointerMove={move}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  onKeyDown={(event) => nudge(event, index)}
                >
                  {selected && <Grip size={18} />}
                </div>
              );
            })}
          </div>

          {videoUrl && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                aria-label={playing ? "Pause preview" : "Play preview"}
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) void video.play().catch(() => setPlaying(false));
                  else video.pause();
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 bg-panel text-fg hover:bg-panel-2"
              >
                {playing ? <Pause size={14} /> : <Play size={14} className="ml-px" />}
              </button>
              <input
                type="range"
                aria-label="Seek preview"
                min={0}
                max={durationS || 0}
                step={0.05}
                value={Math.min(currentS, durationS || 0)}
                disabled={!durationS}
                onPointerDown={() => { scrubbingRef.current = true; }}
                onPointerUp={() => { scrubbingRef.current = false; }}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setCurrentS(next);
                  if (videoRef.current) videoRef.current.currentTime = next;
                  if (backgroundVideoRef.current) backgroundVideoRef.current.currentTime = next;
                }}
                className="w-full accent-accent"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-fg-3">
                {formatDuration(currentS)} / {durationS ? formatDuration(durationS) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
