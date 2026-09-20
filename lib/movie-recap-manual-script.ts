import { MOVIE_RECAP_PLAYBACK_SPEED, MOVIE_RECAP_RIBBON_GROUP_S } from "./constants/movie-recap";
import { charactersPerSecond, estimateSpokenSeconds } from "./movie-recap-speech";

// How far a block's narration may run past its footage before the Transcript
// step says so. Not zero, because the estimate behind it is accurate to about
// half a second (see lib/movie-recap-speech.ts) and a warning that fires on
// rounding is a warning people learn to ignore.
const OVERRUN_SLACK_S = 1;

export type ManualScriptBlock = { startS: number; endS: number; text: string };

// `HH:MM:SS` or `MM:SS` at the START of a line, either alone or followed by
// that block's words. A stamp anywhere ELSE on the line is part of the sentence,
// not a new block — "he leaves at 00:01:00 sharp" is narration.
//
// Both layouts exist in real scripts: a stamp on its own line above a wrapped
// paragraph, and one line per stamp when the text was pulled off a video's own
// narration track. Rejecting the second silently produced ZERO blocks.
const STAMP = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:\s+(\S.*))?\s*$/;

function secondsOf(match: RegExpMatchArray) {
  const [, hours, minutes, seconds] = match;
  return (hours ? Number(hours) * 3600 : 0) + Number(minutes) * 60 + Number(seconds);
}

/**
 * The hand-typed narration, split on its timestamps.
 *
 * Each stamp starts a block that runs until the next one; the last runs to the
 * end of the source. The stamps are positions in the SOURCE — the uploaded video
 * is the one they were read off — so a block's footage is simply the source
 * between its own two times. That is why this needs no scene detection to place
 * anything (see history/movie-recap.md).
 *
 * A block starting at or past the end of the source is dropped rather than
 * clamped: it describes footage that is not there, and giving it a zero-length
 * window would put narration over nothing. Same for a stamp that goes backwards
 * — one bad line should not drag the blocks after it out of order.
 */
export function parseTimestampedBlocks(source: string, durationS: number): ManualScriptBlock[] {
  const found: { startS: number; lines: string[] }[] = [];
  for (const line of source.split("\n")) {
    const match = line.match(STAMP);
    if (match) {
      found.push({ startS: secondsOf(match), lines: match[4] ? [match[4]] : [] });
      continue;
    }
    found[found.length - 1]?.lines.push(line);
  }

  const started: { startS: number; text: string }[] = [];
  for (const block of found) {
    const text = block.lines.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (block.startS >= durationS) continue;
    if (started.length && block.startS <= started[started.length - 1].startS) continue;
    started.push({ startS: block.startS, text });
  }

  return started.map((block, index) => ({
    startS: block.startS,
    endS: index + 1 < started.length ? started[index + 1].startS : durationS,
    text: block.text,
  }));
}

export type ManualScriptGroup = {
  startS: number;
  endS: number;
  /** Indexes into the blocks this was built from, in order. */
  blocks: number[];
};

/**
 * Consecutive blocks merged until each group spans MOVIE_RECAP_RIBBON_GROUP_S.
 *
 * A group is what the ribbon lays narration over, and its edges are the only
 * timestamps the render treats as walls — see the constant for why. A group
 * always holds at least one block, so a single long block is its own group and
 * nothing is merged that did not need to be.
 *
 * The LAST group can come out short: whatever is left over at the end of the
 * story joins the group before it rather than standing alone, because a 3s group
 * is the wall this exists to remove.
 */
export function groupBlocks(blocks: ManualScriptBlock[], targetS = MOVIE_RECAP_RIBBON_GROUP_S): ManualScriptGroup[] {
  const groups: ManualScriptGroup[] = [];
  for (const [index, block] of blocks.entries()) {
    const open = groups[groups.length - 1];
    if (open && open.endS - open.startS < targetS) {
      open.endS = block.endS;
      open.blocks.push(index);
    } else {
      groups.push({ startS: block.startS, endS: block.endS, blocks: [index] });
    }
  }
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.endS - last.startS < targetS / 2) {
    const previous = groups[groups.length - 2];
    previous.endS = last.endS;
    previous.blocks.push(...last.blocks);
    groups.pop();
  }
  return groups;
}

export type ManualScriptOverrun = {
  /** 1-based, so it can be shown to the user as they count their own groups. */
  block: number;
  startS: number;
  endS: number;
  /** SCREEN seconds, which is the group's own length stretched by the playback speed. */
  footageS: number;
  /** Estimated seconds of speech; the render measures the real thing. */
  spokenS: number;
  /** Seconds of held frame this group would produce as it stands. */
  overS: number;
  /** Characters the group spends now, spaces not counted. */
  chars: number;
  /** Characters it may spend. `chars - budgetChars` is the edit to make. */
  budgetChars: number;
};

/** Characters a stretch of footage can carry, spoken at the narration voice's rate. */
export function budgetCharsFor(startS: number, endS: number) {
  return Math.floor(((endS - startS) / MOVIE_RECAP_PLAYBACK_SPEED) * charactersPerSecond());
}

/**
 * Ribbon groups with more narration than their own timestamps can cover.
 *
 * Measured per GROUP, not per block, because that is what the render does: the
 * ribbon shares a group's footage across the lines inside it, so a line that
 * runs long beside one that runs short is not an overrun and warning about it
 * teaches people to ignore the warning. Only a group whose total outruns its own
 * two stamps ends in a held frame.
 *
 * Nothing in the pipeline speeds the reading up to make it fit — both ways of
 * doing that were built and rejected (history/movie-recap.md). The fix is fewer
 * words or a later timestamp, and both are the user's, which is why this is
 * shown here rather than discovered an hour into a render.
 *
 * Deliberately estimate-based: measuring would mean synthesizing the whole story
 * to draw a warning, and the Narrative Script step does exactly that later, per
 * beat. This only has to be close, and `estimateSpokenSeconds` is within about
 * half a second.
 */
export function manualScriptOverruns(blocks: ManualScriptBlock[]): ManualScriptOverrun[] {
  const overruns: ManualScriptOverrun[] = [];
  for (const [index, group] of groupBlocks(blocks).entries()) {
    const footageS = (group.endS - group.startS) / MOVIE_RECAP_PLAYBACK_SPEED;
    const spokenS = group.blocks.reduce((total, block) => total + estimateSpokenSeconds(blocks[block].text), 0);
    if (spokenS <= footageS + OVERRUN_SLACK_S) continue;
    overruns.push({
      block: index + 1,
      startS: group.startS,
      endS: group.endS,
      footageS,
      spokenS,
      overS: Number((spokenS - footageS).toFixed(1)),
      chars: group.blocks.reduce((total, block) => total + blocks[block].text.replace(/\s+/g, "").length, 0),
      budgetChars: budgetCharsFor(group.startS, group.endS),
    });
  }
  return overruns;
}
