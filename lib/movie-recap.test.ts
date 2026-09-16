import { describe, expect, it } from "vitest";
import { clampBlurRect, formatBytes, formatDuration, movieRecapPartCount, movieRecapPartSize, suggestMovieRecapFraming } from "./movie-recap";

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
