import type { TranslateCue } from "@/lib/translate";

export type SpeechWord = { word: string; start: number; end: number };
type TimedChar = { start: number; end: number; word: number };

const CHUNK_WIDTH = 16;
const WIDE_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const BREAK_AFTER = /[。！？!?；;：:，、,၊။…]/u;
const SENTENCE_END = /[。！？!?.။…]["'」』”’)）]*$/u;
const SPEECH_MARGIN = 4;

export function normalizeSpeechText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function joinText(parts: string[]) {
  return parts.reduce((joined, part) => !joined ? part
    : WIDE_CHAR.test(Array.from(joined).at(-1) ?? "") && WIDE_CHAR.test(Array.from(part)[0] ?? "") ? joined + part : `${joined} ${part}`, "");
}

function textWidth(chars: string[]) {
  return chars.reduce((width, char) => width + (WIDE_CHAR.test(char) ? 1 : /\s/u.test(char) ? 0 : 0.5), 0);
}

export function splitSubtitleChunks(text: string): string[] {
  const chars = Array.from(text);
  const units: { start: number; end: number }[] = [];
  let start = -1;
  for (let index = 0; index <= chars.length; index++) {
    const char = chars[index];
    if (index === chars.length || /\s/u.test(char)) {
      if (start >= 0) units.push({ start, end: index });
      start = -1;
      continue;
    }
    if (start < 0) start = index;
    if (BREAK_AFTER.test(char) && !BREAK_AFTER.test(chars[index + 1] ?? "")) {
      units.push({ start, end: index + 1 });
      start = -1;
    }
  }

  const attached = units.reduce<{ start: number; end: number }[]>((merged, unit) => {
    const previous = merged.at(-1);
    if (previous && !/[\p{L}\p{N}]/u.test(chars.slice(unit.start, unit.end).join(""))) previous.end = unit.end;
    else merged.push({ ...unit });
    return merged;
  }, []);

  const pieces = attached.flatMap((unit) => {
    const unitChars = chars.slice(unit.start, unit.end);
    const width = textWidth(unitChars);
    if (width <= CHUNK_WIDTH || !unitChars.some((char) => WIDE_CHAR.test(char))) return [unit];
    const count = Math.ceil(width / CHUNK_WIDTH);
    const size = Math.ceil(unitChars.length / count);
    return Array.from({ length: count }, (_, part) => ({
      start: unit.start + part * size, end: Math.min(unit.end, unit.start + (part + 1) * size),
    })).filter((part) => part.end > part.start);
  });

  const chunks: string[] = [];
  let current: { start: number; end: number } | null = null;
  for (const piece of pieces) {
    if (current && textWidth(chars.slice(current.start, piece.end)) <= CHUNK_WIDTH
      && !SENTENCE_END.test(chars.slice(current.start, current.end).join(""))) {
      current.end = piece.end;
      continue;
    }
    if (current) chunks.push(chars.slice(current.start, current.end).join(""));
    current = { ...piece };
  }
  if (current) chunks.push(chars.slice(current.start, current.end).join(""));
  return chunks.map((chunk) => chunk.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

function timedSpeechChars(words: SpeechWord[], from: number, to: number) {
  const chars: string[] = [];
  const times: TimedChar[] = [];
  for (let index = from; index < to; index++) {
    const word = words[index];
    const normalized = Array.from(normalizeSpeechText(word.word));
    const step = (word.end - word.start) / normalized.length;
    normalized.forEach((char, offset) => {
      chars.push(char);
      times.push({ start: word.start + offset * step, end: word.start + (offset + 1) * step, word: index });
    });
  }
  return { chars, times };
}

// Semi-global alignment: every subtitle character is placed, while unrelated speech
// before and after the cue inside the search window costs nothing.
function alignChars(text: string[], speech: string[]): (number | null)[] {
  const rows = text.length + 1;
  const cols = speech.length + 1;
  const score = new Float64Array(rows * cols);
  const move = new Uint8Array(rows * cols);
  for (let row = 1; row < rows; row++) { score[row * cols] = -row; move[row * cols] = 2; }
  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const diagonal = score[(row - 1) * cols + col - 1] + (text[row - 1] === speech[col - 1] ? 2 : -1);
      const up = score[(row - 1) * cols + col] - 1;
      const left = score[row * cols + col - 1] - 1;
      const cell = row * cols + col;
      if (diagonal >= up && diagonal >= left) { score[cell] = diagonal; move[cell] = 1; }
      else if (up >= left) { score[cell] = up; move[cell] = 2; }
      else { score[cell] = left; move[cell] = 3; }
    }
  }
  let col = 0;
  for (let candidate = 1; candidate < cols; candidate++) {
    if (score[(rows - 1) * cols + candidate] > score[(rows - 1) * cols + col]) col = candidate;
  }
  const matched: (number | null)[] = Array(text.length).fill(null);
  let row = rows - 1;
  while (row > 0) {
    const step = col === 0 ? 2 : move[row * cols + col];
    if (step === 1) {
      if (text[row - 1] === speech[col - 1]) matched[row - 1] = col - 1;
      row--; col--;
    } else if (step === 2) row--;
    else col--;
  }
  return matched;
}

type TimedChunk = { text: string; start: number; end: number } | { text: string; start: null; end: null };

function timeCue(cue: TranslateCue, words: SpeechWord[], fromWord: number, limit: number): { parts: TranslateCue[]; lastWord: number } | null {
  let first = fromWord;
  while (first < words.length && (words[first].start + words[first].end) / 2 < cue.start - SPEECH_MARGIN) first++;
  let last = first;
  while (last < words.length && (words[last].start + words[last].end) / 2 <= cue.end + SPEECH_MARGIN) last++;
  if (last <= first) return null;

  const chunks = splitSubtitleChunks(cue.text);
  const text: string[] = [];
  const owner: number[] = [];
  chunks.forEach((chunk, index) => {
    for (const char of normalizeSpeechText(chunk)) { text.push(char); owner.push(index); }
  });
  const speech = timedSpeechChars(words, first, last);
  if (!text.length || !speech.chars.length || text.length * speech.chars.length > 8_000_000) return null;

  const matched = alignChars(text, speech.chars);
  const matchedCount = matched.filter((col) => col !== null).length;
  if (matchedCount / text.length < 0.4) return null;

  const timed: TimedChunk[] = chunks.map((chunk, index) => {
    const cols = matched.flatMap((col, char) => owner[char] === index && col !== null ? [col] : []);
    const total = owner.filter((chunkIndex) => chunkIndex === index).length;
    if (!cols.length || cols.length / Math.max(1, total) < 0.34) return { text: chunk, start: null, end: null };
    return { text: chunk, start: speech.times[cols[0]].start, end: speech.times[cols[cols.length - 1]].end };
  });
  if (!timed.some((chunk) => chunk.start !== null)) return null;

  const anchored: TranslateCue[] = [];
  let pending: string[] = [];
  for (const chunk of timed) {
    if (chunk.start === null) { pending.push(chunk.text); continue; }
    let text = chunk.text;
    const previous = anchored.at(-1);
    if (pending.length && !previous) text = joinText([...pending, text]);
    else if (pending.length && previous) {
      const step = (chunk.start - previous.end) / pending.length;
      if (step >= 0.5) pending.forEach((pendingText, offset) => anchored.push({
        text: pendingText, start: previous.end + offset * step, end: previous.end + (offset + 1) * step,
      }));
      else previous.text = joinText([previous.text, ...pending]);
    }
    pending = [];
    anchored.push({ text, start: chunk.start, end: chunk.end });
  }
  if (pending.length) anchored[anchored.length - 1].text = joinText([anchored[anchored.length - 1].text, ...pending]);

  const usedWords = matched.flatMap((col) => col === null ? [] : [speech.times[col].word]);
  return { parts: padParts(anchored, limit), lastWord: Math.max(...usedWords) };
}

function padParts(parts: TranslateCue[], limit: number): TranslateCue[] {
  const padded = parts.map((part) => ({ ...part, start: Math.max(0, part.start - 0.08), end: Math.min(limit, part.end + 0.25) }));
  for (let index = 0; index < padded.length; index++) {
    const next = padded[index + 1];
    if (padded[index].end - padded[index].start < 0.7) padded[index].end = Math.min(next?.start ?? limit, padded[index].start + 0.7);
    if (next && padded[index].end > next.start) padded[index].end = next.start;
  }
  const merged: TranslateCue[] = [];
  for (const part of padded) {
    const previous = merged.at(-1);
    if (previous && (part.end - part.start < 0.25 || previous.end - previous.start < 0.25)) {
      merged[merged.length - 1] = { text: joinText([previous.text, part.text]), start: previous.start, end: Math.max(previous.end, part.end) };
    } else merged.push(part);
  }
  return merged;
}

export function timeSubtitlesToSpeech(sourceCues: TranslateCue[], words: SpeechWord[], duration: number) {
  const limit = Math.max(duration, sourceCues.reduce((latest, cue) => Math.max(latest, cue.end), 0));
  const timed: TranslateCue[] = [];
  let aligned = 0;
  let fromWord = 0;
  for (const cue of sourceCues) {
    const result = cue.text.length <= 1000 ? timeCue(cue, words, fromWord, limit) : null;
    const previousStart = timed.at(-1)?.start ?? 0;
    if (result && result.parts[0].start >= previousStart) {
      timed.push(...result.parts);
      fromWord = result.lastWord;
      aligned++;
    } else if (cue.start >= previousStart) timed.push(cue);
    else timed.push({ ...cue, start: previousStart, end: Math.max(cue.end, previousStart + 0.5) });
  }
  for (let index = 0; index < timed.length - 1; index++) {
    if (timed[index].end > timed[index + 1].start && timed[index + 1].start - timed[index].start >= 0.3) {
      timed[index] = { ...timed[index], end: timed[index + 1].start };
    }
  }
  return { cues: timed, aligned };
}
