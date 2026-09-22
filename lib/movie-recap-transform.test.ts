import { describe, expect, it } from "vitest";
import { buildShotFilter, type ShotFilterContext } from "./movie-recap-transform";
import { MOVIE_RECAP_LOOK } from "./constants/movie-recap";

const ctx = (over: Partial<ShotFilterContext> = {}): ShotFilterContext => ({
  aspectRatio: "16:9",
  fitMode: "cover",
  dynamicBackgroundBlurEnabled: true,
  zoom: 1.05,
  ...over,
});

describe("buildShotFilter", () => {
  it("applies the look to every shot, with no toggle to turn it off", () => {
    // These were all gated on `copyrightFree` until the toggle was removed
    // (history/movie-recap.md, 2026-09-19). A shot that came back bare would
    // mean the gate had grown back.
    const filter = buildShotFilter(ctx());
    for (const fragment of ["trunc(iw*", "eq=", "hflip"]) {
      expect(filter).toContain(fragment);
    }
    // And `contain` never falls back to black bars.
    expect(buildShotFilter(ctx({ fitMode: "contain" }))).not.toContain("color=black");
  });

  it("zooms, recolours and mirrors a 16:9 shot", () => {
    const filter = buildShotFilter(ctx());
    expect(filter).toContain("scale=trunc(iw*1.05/2)*2");
    expect(filter).toContain("hflip");
    // The grade is a tuned number, not a contract — assert that every part of it
    // reaches the chain, not what this month's values happen to be.
    const { contrast, saturation, gamma } = MOVIE_RECAP_LOOK;
    expect(filter).toContain(`eq=contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`);
  });

  it("mirrors portrait too", () => {
    const filter = buildShotFilter(ctx({ aspectRatio: "9:16" }));
    expect(filter).toContain("hflip");
    expect(filter).toContain("eq=");
    expect(filter).toContain("scale=trunc(iw*");
  });

  it("fills letterbox bars with the blurred clip instead of black", () => {
    const filter = buildShotFilter(ctx({ fitMode: "contain" }));
    expect(filter).toContain("boxblur=20:2");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).not.toContain("color=black");
  });

  it("can leave contain bars unfilled when dynamic background blur is off", () => {
    const filter = buildShotFilter(ctx({ fitMode: "contain", dynamicBackgroundBlurEnabled: false }));
    expect(filter).not.toContain("boxblur=");
    expect(filter).not.toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).toContain("force_original_aspect_ratio=decrease");
    expect(filter).toContain("pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black");
  });

  it("pads a square contain render to the configured 1:1 output", () => {
    const filter = buildShotFilter(ctx({
      aspectRatio: "1:1",
      fitMode: "contain",
      dynamicBackgroundBlurEnabled: false,
      zoom: 1.1,
    }));
    const fit = filter.indexOf("force_original_aspect_ratio=decrease");
    const pad = filter.indexOf("pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black");
    const zoom = filter.indexOf("scale=trunc(iw*1.1");
    expect(fit).toBeGreaterThan(-1);
    expect(pad).toBeGreaterThan(fit);
    expect(zoom).toBeGreaterThan(pad);
  });

  it("leaves the graph with one unlabelled output the render can append to", () => {
    // The render appends `,setpts=...` or `,tpad=...`; that only works while the
    // chain ends on a filter with no output label.
    for (const c of [
      ctx(),
      ctx({ fitMode: "contain" }),
      ctx({ aspectRatio: "9:16", fitMode: "contain" }),
    ]) {
      expect(buildShotFilter(c)).not.toMatch(/\]$/);
    }
  });

  it("treats zoom 1 as no zoom", () => {
    // The slider's floor. `crop=iw/1` would be a no-op filter; skip it.
    const filter = buildShotFilter(ctx({ zoom: 1 }));
    expect(filter).not.toContain("trunc(iw*");
    expect(filter).toContain("eq=");
  });

  it("scales to even dimensions", () => {
    // An odd width breaks yuv420p chroma subsampling, which is what the clips
    // are encoded as.
    expect(buildShotFilter(ctx())).toContain("/2)*2");
  });

  it("zooms AFTER framing, so the zoom eats into the letterbox bars", () => {
    // Cropping the source first would preserve its aspect ratio, leaving the
    // bars exactly as wide however far you zoom — see history/movie-recap.md.
    const filter = buildShotFilter(ctx({ fitMode: "contain", zoom: 1.56 }));
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

describe("blur radius scaling", () => {
  it("leaves 16:9 exactly as it was", () => {
    // 1280 is the width its backfill radius was tuned at, so nothing moves.
    expect(buildShotFilter(ctx({ fitMode: "contain" }))).toContain("boxblur=20:2");
  });

  it("scales 9:16 with the raised resolution", () => {
    // 720 -> 1080 is 1.5x, so a radius that hid a watermark at 720 still hides
    // it at 1080 instead of blurring relatively less.
    expect(
      buildShotFilter(ctx({ aspectRatio: "9:16", fitMode: "contain" }))
    ).toContain("boxblur=30:2");
  });
});
