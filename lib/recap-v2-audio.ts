// recap-en-to-mm's `trim_edge_silence` ("Short pauses"), ported as is: cut the
// silence the TTS puts before and after a clip, keeping 0.05s before and 0.20s
// after the speech, but never below `minDurationS` — under source window /
// max video speed Smart Sync would have to cut picture, so there a longer
// pause is kept, up to what the raw clip has.
const KEEP_LEAD_S = 0.05;
const KEEP_TAIL_S = 0.2;
const THRESHOLD = 10 ** (-50 / 20);

export function shortPauseBounds(samples: Int16Array, rate: number, minDurationS: number) {
  const duration = samples.length / rate;
  const window = Math.max(1, Math.floor(rate / 100));
  const count = Math.floor(samples.length / window);
  let firstLoud = -1;
  let lastLoud = -1;
  for (let block = 0; block < count; block++) {
    let sum = 0;
    for (let i = block * window; i < (block + 1) * window; i++) sum += samples[i] * samples[i];
    if (Math.sqrt(sum / window) / 32768 > THRESHOLD) {
      if (firstLoud < 0) firstLoud = block;
      lastLoud = block;
    }
  }
  if (firstLoud < 0) return { first: 0, last: samples.length };
  let start = Math.max(0, firstLoud * window / rate - KEEP_LEAD_S);
  let end = Math.min(duration, (lastLoud + 1) * window / rate + KEEP_TAIL_S);
  if (end - start < minDurationS) {
    end = Math.min(duration, start + minDurationS);
    start = Math.max(0, end - minDurationS);
  }
  return { first: Math.round(start * rate), last: Math.round(end * rate) };
}

export function pcmToWav(samples: Int16Array, rate: number) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const BLOCK_S = 0.01;
const MIN_PAUSE_S = 0.12;
// A caption stays this long after the voice stops, then clears until the next line speaks.
export const CAPTION_HOLD_S = 0.3;

function loudBlocks(samples: Int16Array, rate: number) {
  const window = Math.max(1, Math.round(rate * BLOCK_S));
  const count = Math.floor(samples.length / window);
  const loud: boolean[] = [];
  for (let block = 0; block < count; block++) {
    let sum = 0;
    for (let i = block * window; i < (block + 1) * window; i++) sum += samples[i] * samples[i];
    loud.push(Math.sqrt(sum / window) / 32768 > THRESHOLD);
  }
  return { loud, blockS: window / rate };
}

// When each caption piece of a line appears, and when the last one clears, in
// seconds into the line's clip.
// The first waits for the voice to start; each later one switches where the
// voice resumes after the pause nearest its length-proportional estimate — the
// TTS pauses at "။" and "၊", which is where the pieces are cut. With no usable
// pause the estimate stands.
export function captionTimes(samples: Int16Array, rate: number, chunkLengths: number[]) {
  const clipS = samples.length / rate;
  const { loud, blockS } = loudBlocks(samples, rate);
  const first = loud.indexOf(true);
  if (first < 0) {
    const total = chunkLengths.reduce((sum, length) => sum + length, 0) || 1;
    let seen = 0;
    return { starts: chunkLengths.map((length) => { const start = clipS * seen / total; seen += length; return start; }), end: clipS };
  }
  const last = loud.lastIndexOf(true);
  const onset = first * blockS;
  const speechEnd = (last + 1) * blockS;
  const resumes: number[] = [];
  let quietFrom = -1;
  for (let block = first; block <= last; block++) {
    if (!loud[block]) { if (quietFrom < 0) quietFrom = block; continue; }
    if (quietFrom >= 0 && (block - quietFrom) * blockS >= MIN_PAUSE_S) resumes.push(block * blockS);
    quietFrom = -1;
  }
  const total = chunkLengths.reduce((sum, length) => sum + length, 0) || 1;
  const starts = [onset];
  let seen = chunkLengths[0] ?? 0;
  for (let k = 1; k < chunkLengths.length; k++) {
    const estimate = onset + (speechEnd - onset) * seen / total;
    const previous = starts[k - 1];
    const candidates = resumes.filter((time) => time > previous + 0.3 && Math.abs(time - estimate) <= Math.max(1, (speechEnd - onset) * 0.25));
    const snapped = candidates.sort((a, b) => Math.abs(a - estimate) - Math.abs(b - estimate))[0];
    starts.push(Math.max(previous + 0.3, snapped ?? estimate));
    seen += chunkLengths[k];
  }
  return { starts, end: Math.min(clipS, speechEnd + CAPTION_HOLD_S) };
}
