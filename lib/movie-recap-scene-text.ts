// Dividing one hand-typed passage across the scenes it plays over, and refusing
// to take the model's word for it.
//
// The split pass (lib/prompts/movie-recap-scene-split.ts) is asked only to
// choose break points — every character it returns is supposed to be the user's
// own. It is a language model, so it will sometimes tidy a sentence, drop a
// clause, or lose count of the scenes. Any of those silently rewrites the user's
// story, so the result is CHECKED against the passage here and thrown away for a
// mechanical split when it does not match.

// Burmese sentence and clause marks. A passage with neither is split on
// whitespace, which is the best a mechanical fallback can do.
const SENTENCE_END = "။";
const CLAUSE_END = "၊";

const squash = (value: string) => value.replace(/\s+/g, "");

/** Sentences, each keeping its own trailing "။" so the text can be rejoined. */
export function splitIntoSentences(passage: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of passage) {
    current += char;
    if (char === SENTENCE_END) {
      parts.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

// A sentence long enough to be the only thing a scene carries is broken at its
// clause marks instead, so one runaway sentence cannot starve every scene after
// it.
function splitLongSentence(sentence: string, pieces: number): string[] {
  if (pieces <= 1 || !sentence.includes(CLAUSE_END)) return [sentence];
  const clauses: string[] = [];
  let current = "";
  for (const char of sentence) {
    current += char;
    if (char === CLAUSE_END) {
      clauses.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) clauses.push(current.trim());
  if (clauses.length <= 1) return [sentence];

  const perPiece = Math.ceil(clauses.length / pieces);
  const out: string[] = [];
  for (let i = 0; i < clauses.length; i += perPiece) out.push(clauses.slice(i, i + perPiece).join(" "));
  return out;
}

/**
 * The fallback, and the thing the model's answer is measured against: whole
 * sentences handed out in order, each scene taking sentences until it has its
 * share of the passage by LENGTH — its seconds as a fraction of the block's.
 *
 * Never splits mid-sentence except through `splitLongSentence`, and never loses
 * a character: the last scene takes whatever is left.
 */
export function splitPassageByDuration(passage: string, sceneSecondsList: number[]): string[] {
  const count = sceneSecondsList.length;
  if (count <= 1) return [passage.trim()];

  const totalSeconds = sceneSecondsList.reduce((sum, value) => sum + value, 0);
  if (!(totalSeconds > 0)) return [passage.trim(), ...Array(count - 1).fill("")];

  let sentences = splitIntoSentences(passage);
  // Fewer sentences than scenes: break the longest ones at their clauses until
  // there is something for each scene, or until there is nothing left to break.
  while (sentences.length < count) {
    let longest = 0;
    for (let i = 1; i < sentences.length; i++) {
      if (sentences[i].length > sentences[longest].length) longest = i;
    }
    const pieces = splitLongSentence(sentences[longest], 2);
    if (pieces.length < 2) break;
    sentences = [...sentences.slice(0, longest), ...pieces, ...sentences.slice(longest + 1)];
  }

  const totalChars = sentences.reduce((sum, value) => sum + value.length, 0);
  const out: string[] = [];
  let cursor = 0;
  let spent = 0;
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      out.push(sentences.slice(cursor).join(" ").trim());
      break;
    }
    spent += sceneSecondsList[i];
    const wantChars = (spent / totalSeconds) * totalChars;
    const taken: string[] = [];
    let chars = out.reduce((sum, value) => sum + value.length, 0);
    // Always take at least one sentence, and leave at least one for each scene
    // still to come.
    const spare = sentences.length - cursor - (count - i - 1);
    while (taken.length < Math.max(1, spare) && cursor < sentences.length) {
      taken.push(sentences[cursor]);
      chars += sentences[cursor].length;
      cursor++;
      if (chars >= wantChars) break;
    }
    out.push(taken.join(" ").trim());
  }
  return out;
}

/**
 * The model's split if it kept the user's words, the mechanical one if not.
 *
 * `parts` is what the model returned. It is accepted only when it has one entry
 * per scene AND rejoins to the passage character for character, whitespace
 * aside. Anything else — a reordered index, a tidied sentence, a dropped clause
 * — is a rewrite of the user's story and is not worth arguing with.
 */
export function resolveSceneTexts(
  passage: string,
  sceneSecondsList: number[],
  parts: { sceneIndex: number; text: string }[] | null
): { texts: string[]; usedModel: boolean } {
  const fallback = () => ({ texts: splitPassageByDuration(passage, sceneSecondsList), usedModel: false });
  if (!parts || parts.length !== sceneSecondsList.length) return fallback();

  const ordered = [...parts].sort((a, b) => a.sceneIndex - b.sceneIndex);
  const indexesAreExact = ordered.every((part, index) => part.sceneIndex === index);
  if (!indexesAreExact) return fallback();

  const texts = ordered.map((part) => part.text.trim());
  if (squash(texts.join("")) !== squash(passage)) return fallback();
  return { texts, usedModel: true };
}
