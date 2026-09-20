// How long a line of Burmese takes to say, without asking Azure.
//
// Its own module because BOTH sides need it: the render falls back to it when
// there is no synthesized clip, and the Transcript step uses it in the browser
// to warn that a block has more narration than its timestamps can cover — before
// an hour of rendering finds out. Nothing here may import a node-only module.

// Burmese spoken pace at the narration voice's rate, MEASURED.
//
// 30 real beats of Azure's Burmese, against the length ffprobe reports
// for each synthesized clip: least squares gives 0.0549s per character with an
// intercept of -0.1s, so a flat 18.2 characters a second is the whole model. It
// is accurate to 0.47s on average and 2.05s at worst, and 28 of the 30 land
// inside a second.
//
// It replaces a two-rate model — 12.5 chars/s for the first 20 characters and 36
// after — which came from a much earlier pipeline and was wrong in one
// direction: it UNDER-estimated every beat, by 1.83s on average and 6.24s at
// worst, because nothing is read at 36 characters a second. That mattered: the
// Transcript step warns when a block has more narration than its timestamps
// cover, and a warning built on that estimate almost never fired when it should.
//
// Characters, not words: Burmese is not space-delimited — spaces mark phrase
// breaks — so every narration line counted as about four "words" and got the
// same duration whatever its length.
//
// To re-measure after a voice or rate change: read `render_script` for a project
// whose beats carry `audioS`, and fit `audioS` against the character count of
// `text` with whitespace stripped.
// MEASURED at +20% on 2026-09-20: 11 real beats, 905 characters against 46.3s of
// synthesized speech. Fitted 19.56, median 19.70 per beat; 19.5 rather than 19.6
// so the estimate leans long and the overrun warning fires early rather than
// late. Per-beat rates ran 18.6-22.6.
//
// THE OUTLIER, which is not noise: a line of Burmese DIGITS reads far slower per
// character than letters — "၁၉၈၇ ခုနှစ် ... အနှစ် ၄၀" measured 11.9 ch/s against
// the 19-20 everything else sat at, because four digits are spoken as a dozen
// syllables. A beat heavy with years, counts or measurements will overrun more
// than this estimate says. The Narrative Script step measures the real thing, so
// this only has to be close enough for the Transcript step's warning.
const CHARS_PER_SECOND = 19.5;

// Floors, applied after the estimate. A recap beat shorter than this reads as a
// flash cut however well the narration fits it.
export const MIN_SEGMENT_S = 2;

/** The rate behind the estimate, for callers that turn seconds back into characters. */
export function charactersPerSecond() {
  return CHARS_PER_SECOND;
}

export function estimateSpokenSeconds(text: string) {
  const characters = text.replace(/\s+/g, "").length;
  return Math.max(MIN_SEGMENT_S, characters / CHARS_PER_SECOND);
}
