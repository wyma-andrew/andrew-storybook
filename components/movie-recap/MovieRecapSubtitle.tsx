"use client";

import { useEffect, useRef, useState } from "react";
import { Noto_Sans_Myanmar } from "next/font/google";
import type { MovieRecapProject } from "@/lib/api/types";
import { MOVIE_RECAP_SUBTITLE_LINE_EM, movieRecapSubtitleStyle } from "@/lib/constants/movie-recap";

// The SAME face libass burns into the render (MOVIE_RECAP_SUBTITLE_FONT).
// Burmese faces differ a lot in how much of the em box the glyph body fills —
// measured at one size, the same line is 33% of frame width in Noto Sans
// Myanmar, 39% in Pyidaungsu, 44% in Myanmar Sangam MN — so the preview has to
// use the render's face or it reports a size the export won't reproduce.
const subtitleFont = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["400", "500", "600", "700"] });

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
// styling: `::cue` support for text-shadow and precise placement is uneven
// across browsers, so it cannot be trusted to show what the export will look
// like (history/movie-recap.md).
export function MovieRecapSubtitleOverlay({ project, text }: { project: MovieRecapProject; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameHeight = useFrameHeight(ref);
  if (!text) return null;
  const style = movieRecapSubtitleStyle(project);
  const fontPx = (style.fontSizePct / 100) * frameHeight;
  const outlinePx = fontPx * style.outlineEm;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-[6%] z-30 text-center"
      style={positionStyle(project)}
    >
      {/* The outline is `-webkit-text-stroke` with `paint-order: stroke fill`,
          which paints the stroke BEHIND the glyph — without it the stroke eats
          into the letterform and the caption reads thinner here than in the
          export, where libass expands the contour outwards. No drop shadow in
          either renderer; see the constants for why. */}
      <span
        className={`inline-block max-w-full whitespace-pre-wrap ${subtitleFont.className}`}
        style={{
          fontSize: `${fontPx.toFixed(2)}px`,
          // The font's own line box, stated explicitly: it is also the ratio the
          // ASS font size is inflated by, so leaving it to Tailwind would put
          // the caption at a different height than the export.
          lineHeight: MOVIE_RECAP_SUBTITLE_LINE_EM,
          color: style.color,
          fontWeight: style.weight,
          WebkitTextStrokeWidth: `${outlinePx.toFixed(2)}px`,
          WebkitTextStrokeColor: style.outlineColor,
          paintOrder: "stroke fill",
        }}
      >
        {text}
      </span>
    </div>
  );
}
