import { describe, expect, it } from "vitest";
import { clampBlurRect, formatBytes, formatDuration, movieRecapPartCount, movieRecapPartSize, pickShotSpeed, suggestMovieRecapFraming, thumbnailTimeFor } from "./movie-recap";

describe("movie recap multipart sizing", () => {
  it("uses 16 MiB parts for ordinary videos", () => {
    expect(movieRecapPartSize(500 * 1024 * 1024)).toBe(16 * 1024 * 1024);
    expect(movieRecapPartCount(33 * 1024 * 1024)).toBe(3);
  });

  it("grows the part size to stay within R2's 10,000 part limit", () => {
    const size = 200 * 1024 ** 3;
    const partSize = movieRecapPartSize(size);
    expect(partSize % (1024 * 1024)).toBe(0);
    expect(movieRecapPartCount(size, partSize)).toBeLessThanOrEqual(10_000);
  });
});

describe("movie recap display helpers", () => {
  it("formats duration and file size", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatBytes(1024 ** 3)).toBe("1.00 GB");
  });

  it("keeps a resized or moved blur rectangle inside the frame", () => {
    expect(clampBlurRect({ x: 90, y: -2, width: 30, height: 3 })).toEqual({ x: 70, y: 0, width: 30, height: 5 });
    expect(clampBlurRect({ x: 20, y: 20, width: 150, height: 150 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe("suggestMovieRecapFraming", () => {
  it("matches the output orientation to the source and fills it", () => {
    expect(suggestMovieRecapFraming(1920, 1080)).toEqual({ aspectRatio: "16:9", fitMode: "cover" });
    expect(suggestMovieRecapFraming(1080, 1920)).toEqual({ aspectRatio: "9:16", fitMode: "cover" });
  });

  it("treats a square source as landscape", () => {
    // Arbitrary but fixed: something has to win, and 16:9 is the commoner recap
    // output.
    expect(suggestMovieRecapFraming(1000, 1000).aspectRatio).toBe("16:9");
  });
});

describe("pickShotSpeed", () => {
  const speeds = [0.94, 0.96, 1.05, 1.07];

  it("never returns original speed", () => {
    for (let beat = 0; beat < 12; beat++) {
      for (let shot = 0; shot < 5; shot++) {
        expect(pickShotSpeed(speeds, "project-a", beat, shot)).not.toBe(1);
      }
    }
  });

  it("is deterministic — the same project renders the same way twice", () => {
    expect(pickShotSpeed(speeds, "project-a", 3, 1)).toBe(pickShotSpeed(speeds, "project-a", 3, 1));
    expect(pickShotSpeed(speeds, "project-b", 3, 1)).toBe(pickShotSpeed(speeds, "project-b", 3, 1));
  });

  it("spreads neighbouring shots across the set rather than drifting one way", () => {
    const run = Array.from({ length: 24 }, (_, n) => pickShotSpeed(speeds, "project-a", Math.floor(n / 4), n % 4));
    expect(new Set(run).size).toBeGreaterThan(2);
    // And both directions are represented, so a render does not come out
    // uniformly faster or slower than the source.
    expect(run.some((s) => s < 1)).toBe(true);
    expect(run.some((s) => s > 1)).toBe(true);
  });

  it("falls back to original speed only when there is nothing to choose from", () => {
    expect(pickShotSpeed([], "project-a", 0, 0)).toBe(1);
  });
});

describe("thumbnailTimeFor", () => {
  const DURATION = 6000; // a 100-minute film

  it("stays clear of the first and last 5%", () => {
    // Studio idents, fades from black and credits live there, and a black
    // thumbnail is the one result that makes the button look broken.
    for (let attempt = 0; attempt < 200; attempt++) {
      const t = thumbnailTimeFor(DURATION, attempt);
      expect(t).toBeGreaterThanOrEqual(DURATION * 0.05);
      expect(t).toBeLessThanOrEqual(DURATION * 0.95);
    }
  });

  it("is deterministic, so a stored attempt reproduces its frame", () => {
    expect(thumbnailTimeFor(DURATION, 7)).toBe(thumbnailTimeFor(DURATION, 7));
  });

  it("spreads the first few presses across the whole film", () => {
    // The point of the golden-ratio step: stepping linearly would hand back
    // four near-identical frames from the opening minutes.
    const first = [0, 1, 2, 3].map((attempt) => thumbnailTimeFor(DURATION, attempt));
    const sorted = [...first].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(DURATION * 0.1);
    }
  });

  it("never repeats a frame on consecutive presses", () => {
    const seen = new Set<number>();
    for (let attempt = 0; attempt < 50; attempt++) {
      const t = Math.round(thumbnailTimeFor(DURATION, attempt));
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });

  it("returns 0 for a source with no usable duration", () => {
    // Guard only — the route refuses a source that is not ready.
    expect(thumbnailTimeFor(0, 3)).toBe(0);
    expect(thumbnailTimeFor(Number.NaN, 1)).toBe(0);
  });
});
