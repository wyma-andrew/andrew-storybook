import type { SourceWindow } from "./movie-recap-shots";

// Laying the picture under a narration that has already been locked.
//
// This is the documentary "radio cut" order, and it is the opposite of what this
// pipeline did before: the speech is finished first and its length IS the
// clock, then the source is run underneath it as one continuous ribbon. A beat
// gets exactly as much footage as its clip is long — never a frozen frame,
// never a stretched one, and never a change of reading speed part-way through
// (both were tried; see history/movie-recap.md, 2026-09-19).
//
// The user's timestamps stay meaningful as TARGETS, not as sync points. A block
// whose line runs long borrows from the footage after it and the next block
// starts late; one whose line runs short gives footage back. That offset is the
// drift, and it is only corrected when it grows past `driftCapS` — a cut that
// lands a second or two from where it was typed is invisible, while a picture
// forced onto an exact timestamp is a jump the viewer sees.

const round3 = (value: number) => Number(value.toFixed(3));

/**
 * The nearest of the film's own cuts to `atS`, or `atS` when none is close.
 *
 * Used wherever the picture JUMPS — the start of the video and a drift
 * correction — because a jump that lands mid-scene reads as a glitch while the
 * same jump landing on a real edit reads as an edit.
 */
export function snapToCut(atS: number, cuts: number[], windowS: number) {
  let best = atS;
  let bestGap = windowS;
  for (const cut of cuts) {
    const gap = Math.abs(cut - atS);
    if (gap <= bestGap) {
      bestGap = gap;
      best = cut;
    }
  }
  return round3(best);
}

export type RibbonBeat = {
  /** Which hand-timed block this beat's words came from. */
  blockIndex: number;
  /** Where the user said that block starts. A target, not a sync point. */
  blockStartS: number;
  /** Measured length of this beat's narration clip. */
  audioS: number;
};

export type RibbonWindow = SourceWindow & {
  /** Set when the picture was re-anchored to this block's own timestamp. */
  resynced: boolean;
  /** Seconds this beat has no footage for, because the source ran out. */
  shortfallS: number;
};

/**
 * Walk the source under the narration.
 *
 * `driftCapS` bounds how far the picture may sit from the timestamp that
 * describes it. Past it the next block re-anchors — a skip forward or back, and
 * a real cut either way, which is why it snaps to one.
 */
export function layoutRibbon({
  beats,
  cuts,
  startS,
  endS,
  driftCapS,
  startSnapS,
  resyncSnapS,
}: {
  beats: RibbonBeat[];
  cuts: number[];
  startS: number;
  endS: number;
  driftCapS: number;
  /** How far the video's own first frame may move to land on a cut. */
  startSnapS: number;
  /** How far a drift correction may move to land on one. Wider: the jump is
   *  already visible, so landing it on an edit matters more than precision. */
  resyncSnapS: number;
}): RibbonWindow[] {
  const windows: RibbonWindow[] = [];
  let cursor = snapToCut(startS, cuts, startSnapS);
  let block = beats[0]?.blockIndex ?? 0;

  for (const [index, beat] of beats.entries()) {
    let resynced = false;
    if (index > 0 && beat.blockIndex !== block) {
      block = beat.blockIndex;
      // Only ever at a block boundary. Correcting mid-block would cut a
      // sentence's own picture in half for the sake of a number.
      if (Math.abs(cursor - beat.blockStartS) > driftCapS) {
        cursor = snapToCut(beat.blockStartS, cuts, resyncSnapS);
        resynced = true;
      }
    }

    const wanted = cursor + beat.audioS;
    const sourceEndS = Math.min(wanted, endS);
    windows.push({
      sourceStartS: round3(cursor),
      sourceEndS: round3(sourceEndS),
      resynced,
      // The end of the film is the one place borrowing cannot help: there is
      // nothing after it to take. What is left becomes a held frame.
      shortfallS: round3(Math.max(0, wanted - sourceEndS)),
    });
    cursor = sourceEndS;
  }

  return windows;
}
