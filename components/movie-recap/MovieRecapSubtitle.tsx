"use client";

import { useEffect, useRef, useState } from "react";
import { Noto_Sans_Myanmar } from "next/font/google";
import type { MovieRecapProject } from "@/lib/api/types";

// The SAME face libass burns into the render (MOVIE_RECAP_SUBTITLE_FONT).
// Burmese faces differ a lot in how much of the em box the glyph body fills —
// measured at one size, the same line is 33% of frame width in Noto Sans
// Myanmar, 39% in Pyidaungsu, 44% in Myanmar Sangam MN — so the preview has to
// use the render's face or it reports a size the export won't reproduce.
const subtitleFont = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["400", "700"] });

function rgba(hex: string, opacityPercent: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(opacityPercent / 100).toFixed(2)})`;
}

function positionStyle(project: MovieRecapProject): React.CSSProperties {
  if (project.subtitlePosition === "top") return { top: `${project.subtitleOffset}%` };
  if (project.subtitlePosition === "middle") return { top: "50%", transform: "translateY(-50%)" };
  return { bottom: `${project.subtitleOffset}%` };
}

// Subtitle size is a percentage of the FRAME height (same number libass gets as
// `Fontsize` against `PlayResY`), so it has to be resolved against the frame,
// not the page. It is measured here rather than expressed in `cqh`: container
// query units silently fall back to the viewport when the frame does not
// establish a size container, which made the preview render at ~2x the size the
// export produced — see history/movie-recap.md.
function useFrameHeight(ref: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const frame = ref.current?.offsetParent;
    if (!(frame instanceof HTMLElement)) return;
    setHeight(frame.clientHeight);
    const observer = new ResizeObserver(() => setHeight(frame.clientHeight));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

// Rendered as real DOM on top of the video rather than as WebVTT `::cue`
// styling: `::cue` ignores padding, border-radius and box-shadow, so it can
// never show the pill design being configured here (history/movie-recap.md).
export function MovieRecapSubtitleOverlay({ project, text }: { project: MovieRecapProject; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameHeight = useFrameHeight(ref);
  if (!text) return null;
  const fontPx = (project.subtitleFontSize / 100) * frameHeight;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-[6%] z-30 text-center"
      style={positionStyle(project)}
    >
      {/* No drop shadow: the ASS style writes `Shadow 0`, so one here would be
          preview-only decoration the export cannot reproduce — most visible at
          0% background opacity, where the preview drew a shadow with nothing
          casting it. */}
      <span
        className={`inline-block max-w-full whitespace-pre-wrap rounded-lg px-[1.2em] py-[0.35em] leading-snug ${subtitleFont.className}`}
        style={{
          fontSize: `${fontPx.toFixed(2)}px`,
          color: project.subtitleColor,
          backgroundColor: rgba(project.subtitleBgColor, project.subtitleBgOpacity),
          fontWeight: project.subtitleBold ? 700 : 400,
        }}
      >
        {text}
      </span>
    </div>
  );
}
