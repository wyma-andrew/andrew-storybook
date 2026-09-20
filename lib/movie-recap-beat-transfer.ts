import { charactersPerSecond } from "./movie-recap-speech";
import { beatOverrunS } from "./movie-recap";
import type { MovieRecapNarrationSegment } from "./api/types";

// `[Beat 7 | cut 1.2s | max 96 characters]`. The beat NUMBER is the anchor and
// the only part parsed back — everything after the first `|` is there for the
// person and the model reading it, and a reply that rewords or drops it still
// applies. Anchoring on the text instead would break the moment the text
// changed, which is the entire point of the round trip.
const HEADER = /^\s*\[\s*beat\s+(\d+)\b[^\]]*\]\s*$/i;

const PREAMBLE =
  "Below are lines of Burmese video narration that run longer than the footage behind them. " +
  "Shorten each one to fit.\n\n" +
  "Reply with the same [Beat N] headers and the shortened Burmese under each, and nothing else.";

/**
 * Characters to REMOVE from a beat, not characters that fit.
 *
 * The difference was measured and it is large. "About 70 characters fit" beside
 * an 88-character line reads as "rewrite this to 70", and a chat given a length
 * hits it and then some: a 0.3s overrun came back 1.3s short, with the one adverb
 * carrying the line's weight gone. A delta cannot be overshot that way — it says
 * how much to cut, not how long to end up.
 *
 * An estimate: `CHARS_PER_SECOND` is a fit, and a line heavy with Burmese digits
 * reads far slower than it (see lib/movie-recap-speech.ts). The seconds beside it
 * are the real target; this is here because a chat cannot count seconds.
 */
export function beatCutChars(beat: MovieRecapNarrationSegment) {
  return Math.max(1, Math.round(beatOverrunS(beat) * charactersPerSecond()));
}

/**
 * The overrunning beats, as a block of text to hand to another chat.
 *
 * Returns "" when nothing overruns, so the caller has one thing to check.
 */
export function buildOverrunPrompt(script: MovieRecapNarrationSegment[]) {
  const blocks: string[] = [];
  for (const [index, beat] of script.entries()) {
    const overS = beatOverrunS(beat);
    if (overS <= 0.05) continue;
    blocks.push(
      `[Beat ${index + 1} | ${overS.toFixed(1)}s over | remove about ${beatCutChars(beat)} characters]\n${beat.text}`
    );
  }
  return blocks.length ? `${PREAMBLE}\n\n${blocks.join("\n\n")}` : "";
}

/**
 * The reply, read back into beat edits.
 *
 * Tolerant on purpose — this text has been through a chat window and a
 * clipboard. Anything before the first header is dropped (models like to open
 * with "Here you go"), blank lines inside a beat are kept out, and a header with
 * no words under it is ignored rather than clearing that beat.
 *
 * `count` bounds the beat numbers; anything outside it is dropped rather than
 * silently landing on the wrong line.
 */
export function parseBeatEdits(reply: string, count: number): { index: number; text: string }[] {
  const edits = new Map<number, string[]>();
  let open: string[] | null = null;
  for (const line of reply.split("\n")) {
    const header = line.match(HEADER);
    if (header) {
      const index = Number(header[1]) - 1;
      if (index < 0 || index >= count) {
        open = null;
        continue;
      }
      open = [];
      edits.set(index, open);
      continue;
    }
    if (!open) continue;
    const trimmed = line.trim();
    if (trimmed) open.push(trimmed);
  }
  return [...edits.entries()]
    .map(([index, lines]) => ({ index, text: lines.join(" ").trim() }))
    .filter((edit) => edit.text.length > 0);
}
