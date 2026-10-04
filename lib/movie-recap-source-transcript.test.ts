import { describe, expect, it } from "vitest";
import { buildAutoSourceTranscript, dialogueDuring, dropUnreliableSegments, formatMovieRecapSourceTranscript, formatTranscriptStamp } from "./movie-recap-source-transcript";

describe("formatMovieRecapSourceTranscript", () => {
  it("keeps timestamped source lines and removes translation lines", () => {
    expect(formatMovieRecapSourceTranscript(
      "00:00 那个护工\nThat caregiver,\n\n00:02 就是你妈吧？\nis your mother, right?",
    )).toBe("00:00 那个护工\n00:02 就是你妈吧？");
  });

  it("removes standalone timestamps and keeps the text before the extra stamp", () => {
    expect(formatMovieRecapSourceTranscript("00:00 In a forest, Troy wakes up in terrible\n00:03"))
      .toBe("00:00 In a forest, Troy wakes up in terrible");
  });

  it("splits timestamped lines pasted on one line", () => {
    expect(formatMovieRecapSourceTranscript("00:00 first 00:03 second")).toBe("00:00 first\n00:03 second");
  });
});

describe("formatTranscriptStamp", () => {
  it("uses MM:SS under an hour and H:MM:SS past it", () => {
    expect(formatTranscriptStamp(65.9)).toBe("01:05");
    expect(formatTranscriptStamp(4510)).toBe("1:15:10");
  });
});

describe("buildAutoSourceTranscript", () => {
  it("interleaves scenes and dialogue by time, scene first on a shared second", () => {
    const text = buildAutoSourceTranscript(
      [
        { start: 3.4, text: " Where are you going? " },
        { start: 12, text: "Home." },
      ],
      [
        { start: 0, visual: "A man walks to a jet." },
        { start: 12.6, visual: "The jet takes off." },
        { start: 20, visual: "" },
      ]
    );
    expect(text).toBe(
      ["00:00 [Scene] A man walks to a jet.", "00:03 Where are you going?", "00:12 [Scene] The jet takes off.", "00:12 Home."].join("\n")
    );
  });

  it("joins dialogue lines that share a stamp, but never into a scene line", () => {
    const text = buildAutoSourceTranscript(
      [
        { start: 0.2, text: "女人只是随手在路边买下一块石头，" },
        { start: 2.1, text: "结果回家后，" },
        { start: 2.8, text: "丈夫竟直接提出离婚，" },
        { start: 5, text: "Wait." },
        { start: 5.5, text: "Stop." },
      ],
      [{ start: 2, visual: "A man frowns." }]
    );
    expect(text).toBe(
      [
        "00:00 女人只是随手在路边买下一块石头，",
        "00:02 [Scene] A man frowns.",
        "00:02 结果回家后，丈夫竟直接提出离婚，",
        "00:05 Wait. Stop.",
      ].join("\n")
    );
  });

  it("survives the source transcript's own paste formatting", () => {
    const text = buildAutoSourceTranscript([{ start: 3700, text: "Late line." }], [{ start: 5, visual: "A door opens." }]);
    expect(formatMovieRecapSourceTranscript(text)).toBe(text);
  });
});

describe("dialogueDuring", () => {
  it("joins only the lines that overlap the scene", () => {
    const segments = [
      { start: 0, end: 2, text: "Before." },
      { start: 4, end: 6, text: " Inside. " },
      { start: 9, end: 12, text: "Straddles the end." },
      { start: 12, end: 14, text: "After." },
    ];
    expect(dialogueDuring(segments, 3, 10)).toBe("Inside. Straddles the end.");
  });
});

describe("dropUnreliableSegments", () => {
  it("drops repetition loops and confident-silence inventions, keeps the rest", () => {
    const kept = dropUnreliableSegments([
      { start: 0, end: 2, text: "Real line.", no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 1.2 },
      { start: 2, end: 4, text: "Thank you for watching.", no_speech_prob: 0.8, avg_logprob: -1.4, compression_ratio: 1.0 },
      { start: 4, end: 6, text: "no no no no no no no no", no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 3.1 },
      { start: 6, end: 8, text: "Quiet but clear.", no_speech_prob: 0.8, avg_logprob: -0.4, compression_ratio: 1.1 },
    ]);
    expect(kept.map((segment) => segment.text)).toEqual(["Real line.", "Quiet but clear."]);
  });
});
