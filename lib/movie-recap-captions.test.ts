import { describe, expect, it } from "vitest";
import { captionsLookUsable, cleanCueText, ffprobeFor, parseSrt, pickCaptionStream } from "./movie-recap-captions";

const stream = (over: Record<string, unknown> = {}) => ({
  index: 2,
  codec_type: "subtitle",
  codec_name: "subrip",
  ...over,
});

describe("pickCaptionStream", () => {
  it("returns null when there is no subtitle stream at all", () => {
    // The normal case — a download or a cutter export usually strips it.
    expect(pickCaptionStream([{ index: 0, codec_type: "video", codec_name: "h264" }])).toBeNull();
  });

  it("ignores bitmap subtitles", () => {
    // Pictures of words. ffmpeg cannot turn these into text, so treating them as
    // a caption source would produce an empty file, not an error.
    for (const codec of ["dvd_subtitle", "hdmv_pgs_subtitle", "dvb_subtitle"]) {
      expect(pickCaptionStream([stream({ codec_name: codec })])).toBeNull();
    }
  });

  it("skips forced tracks", () => {
    // A forced track translates the one foreign-language scene. Using it as the
    // film's dialogue would hand the narration model almost nothing while
    // looking like it had worked.
    expect(pickCaptionStream([stream({ disposition: { forced: 1 } })])).toBeNull();
  });

  it("prefers the default track over the first one", () => {
    const picked = pickCaptionStream([
      stream({ index: 2, tags: { language: "fra" } }),
      stream({ index: 3, tags: { language: "eng" }, disposition: { default: 1 } }),
    ]);
    expect(picked?.index).toBe(3);
    expect(picked?.language).toBe("eng");
  });

  it("falls back to the first text track when none is default", () => {
    expect(pickCaptionStream([stream({ index: 4 }), stream({ index: 5 })])?.index).toBe(4);
  });
});

describe("parseSrt", () => {
  it("parses cues into the shape Whisper segments arrive in", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,500\nHello there\n\n2\n00:01:02,250 --> 00:01:04,000\nSecond line";
    expect(parseSrt(srt)).toEqual([
      { start: 1, end: 3.5, text: "Hello there" },
      { start: 62.25, end: 64, text: "Second line" },
    ]);
  });

  it("joins a cue's own line breaks into one line", () => {
    // Those breaks are typesetting, not sentence structure.
    expect(parseSrt("1\n00:00:01,000 --> 00:00:02,000\nfirst\nsecond")[0].text).toBe("first second");
  });

  it("drops a cue whose timing will not parse", () => {
    // Guessing produces dialogue attached to the wrong scene, silently.
    expect(parseSrt("1\nbroken --> also broken\ntext")).toEqual([]);
    expect(parseSrt("1\n00:00:05,000 --> 00:00:02,000\nbackwards")).toEqual([]);
  });

  it("handles CRLF, WebVTT dots, and a missing hour field", () => {
    expect(parseSrt("1\r\n00:02.500 --> 00:04.000\r\nhi")).toEqual([{ start: 2.5, end: 4, text: "hi" }]);
  });

  it("skips cues that are empty once styling is stripped", () => {
    expect(parseSrt("1\n00:00:01,000 --> 00:00:02,000\n{\\an8}")).toEqual([]);
  });
});

describe("cleanCueText", () => {
  it("strips ASS overrides and SRT markup", () => {
    // Styling instructions would otherwise reach the narration model as dialogue.
    expect(cleanCueText("{\\an8}<i>Get   down!</i>")).toBe("Get down!");
    expect(cleanCueText('<font color="#fff">Run</font>')).toBe("Run");
  });
});

describe("captionsLookUsable", () => {
  const cues = (count: number, each: number) =>
    Array.from({ length: count }, (_, i) => ({ start: i * 10, end: i * 10 + each, text: "x" }));

  it("accepts a real dialogue track", () => {
    expect(captionsLookUsable(cues(50, 3), 600)).toBe(true);
  });

  it("rejects a track that covers almost nothing", () => {
    // A forced track that slipped through, or song lyrics only.
    expect(captionsLookUsable(cues(20, 0.5), 7200)).toBe(false);
  });

  it("rejects a handful of cues", () => {
    expect(captionsLookUsable(cues(3, 5), 60)).toBe(false);
  });

  it("rejects an unknown source duration rather than dividing by it", () => {
    expect(captionsLookUsable(cues(50, 3), 0)).toBe(false);
    expect(captionsLookUsable(cues(50, 3), Number.NaN)).toBe(false);
  });
});

describe("ffprobeFor", () => {
  it("resolves beside the ffmpeg binary it was given", () => {
    // FFMPEG_PATH may point at a keg-only build that is not on PATH.
    expect(ffprobeFor("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg")).toBe("/opt/homebrew/opt/ffmpeg-full/bin/ffprobe");
  });

  it("stays a bare command when ffmpeg is one", () => {
    expect(ffprobeFor("ffmpeg")).toBe("ffprobe");
  });
});
