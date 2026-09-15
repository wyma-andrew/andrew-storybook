import { describe, expect, it } from "vitest";
import { clampBlurRect, formatBytes, formatDuration, movieRecapPartCount, movieRecapPartSize } from "./movie-recap";

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
