// recap-en-to-mm's checks on a translated batch (recap_planner.py). Each one
// that fires re-asks the batch with the problem named; the last answer is kept.
// Thresholds are the tool's. See history/recap-v2.md.

export type CheckedLine = { id: number; source: string; translation: string };

const BRACKETED = /\([^()]*\)/g;
const MYANMAR = /[က-႟]/;

function isAllowedLetter(ch: string) {
  const code = ch.codePointAt(0)!;
  return (code >= 0x1000 && code <= 0x109f) || (code >= 0xa9e0 && code <= 0xa9ff) || (code >= 0xaa60 && code <= 0xaa7f)
    || code <= 0x024f || (code >= 0x1e00 && code <= 0x1eff);
}

// Letters neither Myanmar nor Latin, outside ( ): "ဧည့်ခန်း" once came back as
// "მისခန်း", which the voice cannot read.
export function foreignLetters(text: string) {
  return [...new Set(Array.from(text.replace(BRACKETED, "")).filter((ch) => /\p{L}/u.test(ch) && !isAllowedLetter(ch)))];
}

export function dropForeignLetters(text: string) {
  const letters = new Set(foreignLetters(text));
  return Array.from(text).filter((ch) => !letters.has(ch)).join("").replace(/\s+/g, " ").trim();
}

// English words of 2+ letters outside ( ): a Burmese voice reads them with an
// English accent, and a mostly-English line can come back with no audio.
export function latinWords(text: string) {
  return [...new Set(text.replace(BRACKETED, "").match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]/g) ?? [])];
}

const NOTE = /\b(?:context\s+carried|continu(?:ing|ed|es)\s+(?:from\s+)?id|carried\s+by\s+id|(?:previous|next|same)\s+id|id\s*\d{2,})\b/i;

// A translator's note instead of narration, or a line whose only Burmese is in
// brackets ("(ရှေ့စာကြောင်း၏ အဆက်)"), which the voice would read out.
export function isNote(text: string) {
  return NOTE.test(text) || !MYANMAR.test(text.replace(BRACKETED, ""));
}

function repeatWords(text: string) {
  return text.split(/[\s၊။"'“”‘’,.!?()\-–:]+/).filter(Boolean);
}

function longestCommonRun(a: string, b: string) {
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) { row[j] = previous[j - 1] + 1; best = Math.max(best, row[j]); }
    }
    previous = row;
  }
  return best;
}

// How much of `right` the end of `left` already says (0-1): by words, or for
// text with few spaces by the longest shared run of 10+ letters.
export function repeatedTailShare(left: string, right: string) {
  const leftWords = repeatWords(left);
  const rightWords = repeatWords(right);
  const rightLetters = right.replace(/\s+/g, "");
  if (rightWords.length && rightLetters.length / rightWords.length > 12) {
    if (rightLetters.length < 10) return 0;
    const tail = left.replace(/\s+/g, "").slice(-(rightLetters.length + 15));
    const run = longestCommonRun(tail, rightLetters);
    return run >= 10 ? run / rightLetters.length : 0;
  }
  if (rightWords.length < 3) return 0;
  const tail = new Set(leftWords.slice(-(rightWords.length + 3)));
  return rightWords.filter((word) => tail.has(word)).length / rightWords.length;
}

export function findRepeatedNextLines(lines: CheckedLine[]) {
  const found: [number, number][] = [];
  for (let i = 1; i < lines.length; i++) {
    const [left, right] = [lines[i - 1], lines[i]];
    if (repeatedTailShare(left.translation, right.translation) >= 0.6 && repeatedTailShare(left.source, right.source) < 0.5) found.push([left.id, right.id]);
  }
  return found;
}

function charGrams(text: string, n = 3) {
  const value = text.replace(/[\s၊။"'“”‘’,.!?()\-–:—…]+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i + n <= value.length; i++) grams.add(value.slice(i, i + n));
  return grams;
}

function overlap(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Lines at most two IDs apart that say much the same while their sources do not.
export function findNearDuplicates(lines: CheckedLine[]) {
  const found: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    const a = charGrams(lines[i].translation);
    if (a.size < 12) continue;
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const b = charGrams(lines[j].translation);
      if (b.size < 12 || overlap(a, b) < 0.6) continue;
      const sa = charGrams(lines[i].source);
      const sb = charGrams(lines[j].source);
      if (sa.size && sb.size && overlap(sa, sb) >= 0.5) continue;
      found.push([lines[i].id, lines[j].id]);
    }
  }
  return found;
}

// Letters and digits without vowel signs: close to a syllable count in Burmese,
// Hindi and Thai alike.
function letterCount(text: string) {
  return Math.max(1, Array.from(text).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length);
}

// Runs of 4+ lines whose translation length fits the NEXT line's source better
// than their own: every line said the next one's words.
export function findSlidRuns(lines: CheckedLine[], nextSource?: string) {
  if (lines.length < 8) return [];
  const src = [...lines.map((line) => letterCount(line.source)), nextSource?.trim() ? letterCount(nextSource) : 0];
  const tr = lines.map((line) => letterCount(line.translation));
  const ratios = tr.map((t, i) => t / src[i]).sort((a, b) => a - b);
  const ratio = ratios[Math.floor(ratios.length / 2)];
  const own = tr.map((t, i) => Math.abs(Math.log(t / (ratio * src[i]))));
  const next = tr.map((t, i) => src[i + 1] ? Math.abs(Math.log(t / (ratio * src[i + 1]))) : Infinity);
  const runs: [number, number][] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && next[j] < own[j]) j++;
    const sum = (values: number[]) => values.slice(i, j).reduce((total, value) => total + value, 0);
    if (j - i >= 4 && sum(next) < 0.45 * sum(own) && sum(own) / (j - i) > 0.3) runs.push([lines[i].id, lines[j - 1].id]);
    i = Math.max(j, i + 1);
  }
  return runs;
}

const pad = (id: number) => `ID ${id}`;

// The tool's correction text, problem by problem, for the re-ask.
export function translationProblems(lines: CheckedLine[], nextSource?: string) {
  const problems: string[] = [];
  const empty = lines.filter((line) => line.source.trim() && !/[\p{L}\p{N}]/u.test(line.translation)).map((line) => pad(line.id));
  if (empty.length) problems.push(`no speakable words (${empty.join(", ")}): never return placeholders such as "..." — write the narration`);
  const foreign = lines.filter((line) => foreignLetters(line.translation).length).map((line) => `${pad(line.id)}: ${foreignLetters(line.translation).join(" ")}`);
  if (foreign.length) problems.push(`letters of another script inside the Burmese (${foreign.join("; ")}); write every word in Burmese script`);
  const english = lines.filter((line) => latinWords(line.translation).length).map((line) => `${pad(line.id)}: ${latinWords(line.translation).join(", ")}`);
  if (english.length) problems.push(`English words inside the Burmese (${english.slice(0, 10).join("; ")}): write them in Burmese script — translate titles and terms, write names by sound`);
  const notes = lines.filter((line) => isNote(line.translation)).map((line) => pad(line.id));
  if (notes.length) problems.push(`a note instead of narration (${notes.join(", ")}): write the narration of that ID's own source words — even when the source is only the end of a sentence, say those words; never a remark such as '(continuation of the previous sentence)' and nothing only inside brackets`);
  const repeats = findRepeatedNextLines(lines);
  if (repeats.length) problems.push(`the same words twice (${repeats.map(([a, b]) => `${pad(b)} repeats the end of ${pad(a)}`).join(", ")}): a sentence split across two IDs - each ID says only its own source words, never the next ID's`);
  const twice = findNearDuplicates(lines);
  if (twice.length) problems.push(`the same thing said twice (${twice.map(([a, b]) => `IDs ${a} and ${b}`).join(", ")} say much the same): each ID says only its own source line`);
  const slid = findSlidRuns(lines, nextSource);
  if (slid.length) problems.push(`lines slid one ID early (${slid.map(([a, b]) => `IDs ${a}-${b}`).join(", ")} each say the NEXT ID's source words): every ID translates its own source line`);
  return problems;
}
