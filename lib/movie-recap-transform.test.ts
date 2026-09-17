import { describe, expect, it } from "vitest";
import { MOVIE_RECAP_COPYRIGHT_TRANSFORM } from "./constants/movie-recap";
import { buildShotFilter, type ShotFilterContext } from "./movie-recap-transform";

const ctx = (over: Partial<ShotFilterContext> = {}): ShotFilterContext => ({
  aspectRatio: "16:9",
  fitMode: "cover",
  copyrightFree: false,
  zoom: 1.05,
  ...over,
});

describe("buildShotFilter", () => {
  it("adds nothing when the project has copyright-free off", () => {
    // Every transform is gated on the toggle, including the blurred backfill.
    const plain = buildShotFilter(ctx());
    expect(plain).toBe("scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720");
    for (const fragment of ["trunc(iw*", "eq=", "hflip", "boxblur"]) {
      expect(plain).not.toContain(fragment);
    }
    expect(buildShotFilter(ctx({ fitMode: "contain" }))).toContain("color=black");
  });

  it("zooms, recolours and mirrors a 16:9 shot", () => {
    const filter = buildShotFilter(ctx({ copyrightFree: true }));
    expect(filter).toContain("scale=trunc(iw*1.05/2)*2");
    expect(filter).toContain("hflip");
    expect(filter).toContain("eq=contrast=1.06:saturation=1.08:gamma=0.98");
  });

  it("mirrors portrait too", () => {
    const filter = buildShotFilter(ctx({ aspectRatio: "9:16", copyrightFree: true }));
    expect(filter).toContain("hflip");
    expect(filter).toContain("eq=");
    expect(filter).toContain("scale=trunc(iw*");
  });

  it("fills letterbox bars with the blurred clip instead of black", () => {
    const filter = buildShotFilter(ctx({ fitMode: "contain", copyrightFree: true }));
    expect(filter).toContain("boxblur=20:2");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).not.toContain("color=black");
  });

  it("leaves the graph with one unlabelled output the render can append to", () => {
    // The render appends `,setpts=...` or `,tpad=...`; that only works while the
    // chain ends on a filter with no output label.
    for (const c of [
      ctx({ copyrightFree: true }),
      ctx({ copyrightFree: true, fitMode: "contain" }),
      ctx({ copyrightFree: true, aspectRatio: "9:16", fitMode: "contain" }),
    ]) {
      expect(buildShotFilter(c)).not.toMatch(/\]$/);
    }
  });

  it("treats zoom 1 as no zoom", () => {
    // 1 is the value a project carries with the transform off, and the value the
    // slider's floor produces. `crop=iw/1` would be a no-op filter; skip it.
    const filter = buildShotFilter(ctx({ copyrightFree: true, zoom: 1 }));
    expect(filter).not.toContain("trunc(iw*");
    expect(filter).toContain("eq=");
  });

  it("scales to even dimensions", () => {
    // An odd width breaks yuv420p chroma subsampling, which is what the clips
    // are encoded as.
    expect(buildShotFilter(ctx({ copyrightFree: true }))).toContain("/2)*2");
  });

  it("zooms AFTER framing, so the zoom eats into the letterbox bars", () => {
    // Cropping the source first would preserve its aspect ratio, leaving the
    // bars exactly as wide however far you zoom — see history/movie-recap.md.
    const filter = buildShotFilter(ctx({ fitMode: "contain", copyrightFree: true, zoom: 1.56 }));
    const fit = filter.indexOf("force_original_aspect_ratio=decrease");
    const zoom = filter.indexOf("scale=trunc(iw*1.56");
    expect(fit).toBeGreaterThan(-1);
    expect(zoom).toBeGreaterThan(fit);
    // And the zoomed picture is clipped to the frame, never past it — with the
    // commas ESCAPED, or ffmpeg reads them as filter separators and fails with
    // "No such filter". This assertion exists because the first version of this
    // emitted bare commas: `\,` in a template literal collapses to `,`.
    expect(filter).toContain("crop=min(iw\\,1280):min(ih\\,720)");
  });
});

describe("MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds", () => {
  it("only ever slows a shot down, and never to 1.0", () => {
    // Speeding a shot up fights the pacing; a slow one also consumes less source
    // than its slot, which leaves the continuity invariant more room.
    for (const speed of MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds) {
      expect(speed).toBeLessThan(1);
    }
  });

  it("stays outside the dead zone and short of visible slow motion", () => {
    // Under 3% is too close to untouched to count as a transform; 0.94 and below
    // reads as deliberate slow motion.
    for (const speed of MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds) {
      expect(speed).toBeLessThanOrEqual(0.97);
      expect(speed).toBeGreaterThanOrEqual(0.95);
    }
  });
});

describe("blur radius scaling", () => {
  it("leaves 16:9 exactly as it was", () => {
    // 1280 is the width its backfill radius was tuned at, so nothing moves.
    expect(buildShotFilter(ctx({ fitMode: "contain", copyrightFree: true }))).toContain("boxblur=20:2");
  });

  it("scales 9:16 with the raised resolution", () => {
    // 720 -> 1080 is 1.5x, so a radius that hid a watermark at 720 still hides
    // it at 1080 instead of blurring relatively less.
    expect(
      buildShotFilter(ctx({ aspectRatio: "9:16", fitMode: "contain", copyrightFree: true }))
    ).toContain("boxblur=30:2");
  });
});
