import { describe, expect, it } from "vitest";
import { buildShotFilter } from "./movie-recap-transform";

const base = { aspectRatio: "16:9" as const, fitMode: "contain" as const, zoom: 1 };

describe("buildShotFilter with a source crop", () => {
  it("cuts the letterbox before anything else looks at the frame", () => {
    // Order is the whole point: framing reasons about the aspect ratio of what
    // it is handed, and the bars are what make that ratio a lie.
    const filter = buildShotFilter({ ...base, crop: { width: 1280, height: 536, x: 0, y: 92 } });
    expect(filter.startsWith("crop=1280:536:0:92,")).toBe(true);
  });

  it("changes nothing when the source is all picture", () => {
    expect(buildShotFilter({ ...base, crop: null })).toBe(buildShotFilter(base));
  });

  it("still ends on one unlabelled filter, so the render can append to it", () => {
    // `setpts` and `tpad` are concatenated onto this by the render.
    const filter = buildShotFilter({ ...base, crop: { width: 1280, height: 536, x: 0, y: 92 } });
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2,");
    expect(filter.endsWith("]")).toBe(false);
  });
});
