import { describe, expect, it } from "vitest";
import { wavInfo } from "./wav";

function wav({ sampleRate = 24000, samples = 24000, extraChunk = false } = {}) {
  const dataBytes = samples * 2;
  const chunks: Buffer[] = [];
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  chunks.push(fmt);
  if (extraChunk) {
    // Azure puts chunks between `fmt ` and `data`; the parser has to walk past
    // them instead of assuming data starts at byte 36.
    const list = Buffer.alloc(8 + 4);
    list.write("LIST", 0, "ascii");
    list.writeUInt32LE(4, 4);
    chunks.push(list);
  }
  const header = Buffer.alloc(8);
  header.write("data", 0, "ascii");
  header.writeUInt32LE(dataBytes, 4);
  chunks.push(header, Buffer.alloc(dataBytes));

  const body = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, body]);
}

describe("wavInfo", () => {
  it("reads rate and duration from the header", () => {
    expect(wavInfo(wav())).toEqual({ sampleRate: 24000, durationSeconds: 1 });
    expect(wavInfo(wav({ samples: 12000 }))?.durationSeconds).toBe(0.5);
  });

  it("walks past chunks that sit before the data chunk", () => {
    expect(wavInfo(wav({ extraChunk: true }))?.durationSeconds).toBe(1);
  });

  it("returns null for anything that is not a WAV", () => {
    expect(wavInfo(Buffer.from("not audio"))).toBeNull();
  });
});
