import { describe, expect, it } from "vitest";
import { buildShotFilter, type ShotFilterContext } from "./movie-recap-transform";

const ctx = (over: Partial<ShotFilterContext> = {}): ShotFilterContext => ({
  aspectRatio: "16:9",
  fitMode: "cover",
  copyrightFree: false,
  ...over,
});

describe("buildShotFilter", () => {
  it("adds nothing when the project has copyright-free off", () => {
    // Every transform is gated on the toggle, including the blurred backfill.
    const plain = buildShotFilter(ctx());
    expect(plain).toBe("scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720");
    for (const fragment of ["crop=floor", "eq=", "hflip", "boxblur"]) {
      expect(plain).not.toContain(fragment);
    }
    expect(buildShotFilter(ctx({ fitMode: "contain" }))).toContain("color=black");
  });

  it("zooms, recolours and mirrors a 16:9 shot", () => {
    const filter = buildShotFilter(ctx({ copyrightFree: true }));
    expect(filter).toContain("crop=floor(iw/1.08/2)*2");
    expect(filter).toContain("hflip");
    expect(filter).toContain("eq=contrast=1.06:saturation=1.08:gamma=0.98");
  });

  it("does not mirror portrait", () => {
    // Mirroring is landscape-only; the colour and zoom steps still apply.
    const filter = buildShotFilter(ctx({ aspectRatio: "9:16", copyrightFree: true }));
    expect(filter).not.toContain("hflip");
    expect(filter).toContain("eq=");
    expect(filter).toContain("crop=floor");
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

  it("crops to even dimensions", () => {
    // An odd crop width breaks yuv420p chroma subsampling, which is what the
    // clips are encoded as.
    expect(buildShotFilter(ctx({ copyrightFree: true }))).toContain("/2)*2");
  });
});
