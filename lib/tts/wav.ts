// Duration straight out of the RIFF header, so a provider that returns WAV
// bytes needs no ffprobe round-trip to report how long its audio is. Walks the
// chunk list rather than assuming `data` sits at byte 36 — Azure's responses
// carry extra chunks before it.
export function wavInfo(buffer: Buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let sampleRate = 0;
  let byteRate = 0;
  let dataBytes = 0;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 8 + 16 <= buffer.length) {
      sampleRate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16);
    } else if (id === "data") {
      // A streamed WAV can declare size 0 (or overstate it); trust what
      // actually arrived.
      dataBytes = Math.min(size || Number.MAX_SAFE_INTEGER, buffer.length - offset - 8);
      break;
    }
    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset += 8 + size + (size % 2);
  }

  if (!sampleRate || !byteRate || !dataBytes) return null;
  return { sampleRate, durationSeconds: dataBytes / byteRate };
}
