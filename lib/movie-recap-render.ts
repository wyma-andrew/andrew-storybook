import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TranscriptSegment } from "./openai";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import {
  ensureNarrationMaster,
  probeDurationS,
  probeVideoFrameCount,
} from "./movie-recap-narration";
import { estimateSpokenSeconds, MIN_SEGMENT_S } from "./movie-recap-speech";
import { deleteObject, getObjectText, movieRecapObjectKey, publicUrlFor, putObject } from "./r2";
import { trimFailureMessage } from "./movie-recap";
import { buildShotFilter, holdMotionFilter, shotFilterContext } from "./movie-recap-transform";
import { detectContentCrop } from "./movie-recap-crop";
import { downloadMovieRecapSource } from "./movie-recap-source-download";
import {
  planMovieRecapBeatTimeline,
  resolveMovieRecapTimelineRates,
  type MovieRecapTimelineClip,
  type SourceWindow,
} from "./movie-recap-shots";
import { buildMovieRecapSceneTimingPlan } from "./movie-recap-scene-plan";
import { renderSnapshot, writeMovieRecapScript, type RecapColumnSnapshot } from "./movie-recap-episode";
import { resolveMovieRecapVoice } from "./tts/voices";
import {
  movieRecapSubtitleStyle,
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_WATERMARK,
  MOVIE_RECAP_MOCK_NARRATION,
  MOVIE_RECAP_MOCK_SOURCE_SECONDS,
  MOVIE_RECAP_BLUR,
  MOVIE_RECAP_EDIT,
  MOVIE_RECAP_CUT_CROSSFADE_S,
  MOVIE_RECAP_TARGET_DIMENSIONS,
  movieRecapBlurRadius,
  movieRecapPacing,
  MOVIE_RECAP_PLAYBACK_SPEED,
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_TARGET_FPS,
  MOVIE_RECAP_TIMELINE_WARNING_FRAME_THRESHOLD,
} from "./constants/movie-recap";
import type { MovieRecapEpisode, MovieRecapNarrationSegment, MovieRecapProject, MovieRecapRenderAnalysis, MovieRecapRenderShot, MovieRecapRenderStage } from "./api/types";
import type { supabaseRoute } from "./supabase/route";


const round2 = (value: number) => Number(value.toFixed(2));

// Homebrew's plain `ffmpeg` formula no longer bundles libass/freetype (they
// moved to the keg-only `ffmpeg-full`), and burning styled Burmese subtitles
// needs libass + harfbuzz. FFMPEG_PATH (see lib/movie-recap-ffmpeg.ts) points at
// a build that has them; without it everything still runs except styled
// subtitle burn-in.
const SUBTITLE_FONT = process.env.MOVIE_RECAP_SUBTITLE_FONT || "Noto Sans Myanmar";
// ASS has one weight control — a Bold flag — so anything between regular and
// bold has to be selected by naming the family fontconfig maps to that cut.
// These are the abbreviated names fontconfig actually answers to: `fc-match
// "Noto Sans Myanmar SemiBold"` returns VERDANA, while `... SemBd` returns the
// right face. Confirm any change with fc-match on the render host — a wrong name
// still renders Burmese (libass falls back per glyph), so it fails quietly.
const SUBTITLE_FONT_MEDIUM = process.env.MOVIE_RECAP_SUBTITLE_FONT_MEDIUM || "Noto Sans Myanmar Med";
const SUBTITLE_FONT_SEMIBOLD = process.env.MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD || "Noto Sans Myanmar SemBd";

export function subtitleFace(weight: number) {
  if (weight >= 700) return { name: SUBTITLE_FONT, bold: -1 };
  if (weight >= 600) return { name: SUBTITLE_FONT_SEMIBOLD, bold: 0 };
  if (weight >= 500) return { name: SUBTITLE_FONT_MEDIUM, bold: 0 };
  return { name: SUBTITLE_FONT, bold: 0 };
}
// CSS sizes text by em; libass sizes it so the font's ascent+descent fit
// `Fontsize`. Noto Sans Myanmar reserves 2.184em of vertical space for stacked
// Burmese marks, so an ASS Fontsize of N draws glyphs a browser would draw at
// N/2.184 — measured: the same line at nominal 100 is 1243px wide through
// FreeType and 540px through libass. Multiply by the ratio so the percentage
// the wizard shows means the same thing in the preview and in the export.
// For another font: (hhea ascender - descender) / unitsPerEm.
export const ASS_FONT_SIZE_RATIO = Number(process.env.MOVIE_RECAP_SUBTITLE_FONT_RATIO) || 2.184;

// Nothing holds a single shot longer than this, however long its line — beyond
// it the beat drags whatever the text says. Cues are compressed to fit, but
// never past ABS_MAX_CUE_CHARS_PER_SECOND, so an over-long line runs over the
// cap rather than becoming unreadable. That is the signal the narration prompt
// is being ignored, not something to solve with timing.
// The cap a beat's timed length is squeezed back to is per aspect ratio now —
// a 16:9 beat is allowed to run longer, because its lines are longer and its
// shots hold longer. It reaches timeCaptionChunks as an argument; see
// MOVIE_RECAP_PACING for both values.
// How a beat is cut into shots — the targets, the hold caps and the hard
// MAX_CONTINUOUS_SOURCE_S limit — lives in lib/movie-recap-shots.ts. The model
// groups the scenes (see lib/prompts/movie-recap-narration.ts); the planner
// decides how many of them a given beat can actually afford.
const ABS_MAX_CUE_CHARS_PER_SECOND = 26;
// A caption has to survive being read, not just being displayed: never shorter
// than this, and never faster than MAX_CUE_CHARS_PER_SECOND.
const MIN_CUE_S = 1;
const MAX_CUE_CHARS_PER_SECOND = 22;
// Beyond this ratio a re-cut may look better; the planner still fits available
// footage to narration and logs the mismatch.
const EXTREME_RATIO_MIN = 0.33;
const EXTREME_RATIO_MAX = 3;

const TARGET_DIMENSIONS = MOVIE_RECAP_TARGET_DIMENSIONS;

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// One render per project at a time (enforced by the route's "already
// running" check), so a projectId -> AbortController map is enough to let a
// separate cancel request reach an in-flight render — no queue/job system
// needed. Only works within one Node process, which is this app's whole
// deployment target (see history/movie-recap.md).
//
// On `globalThis`, NOT plain module state, and that is a fix rather than a
// style: recompiling this file — which `next dev` does on every save — handed
// the route a FRESH EMPTY map while the pipeline it was meant to cancel kept
// running inside the old module instance. Cancel then found no controller,
// concluded nothing was running, reset the row, and left a render the UI called
// cancelled still cutting segments and still about to overwrite that row. Two
// renders ended up running at once this way.
const activeRenders: Map<string, AbortController> = ((globalThis as typeof globalThis & {
  __movieRecapRenders?: Map<string, AbortController>;
}).__movieRecapRenders ??= new Map());

export function cancelMovieRecapRender(projectId: string) {
  const controller = activeRenders.get(projectId);
  if (!controller) return false;
  controller.abort();
  return true;
}

// The filter chain for one segment, always ending in the frame-rate resample.
//
// `fps` must come LAST, after `setpts` and `tpad`: it resamples whatever timing
// those produced onto a constant grid. Every branch below goes through here
// because a single segment that skips it re-introduces the stutter for the whole
// video — `concat -c copy` cannot reconcile two frame rates.
export function segmentFilters(...parts: string[]) {
  return [...parts, `fps=${MOVIE_RECAP_TARGET_FPS}`].join(",");
}

// Real progress: the client polls the project row while render_status is
// "running" (see history/movie-recap.md) — cheap, since these are plain row
// updates between ffmpeg/OpenAI calls that already take real wall-clock time,
// not extra work the pipeline has to slow down for.
function setProgress(db: Db, projectId: string, stage: MovieRecapRenderStage, current: number | null = null, total: number | null = null) {
  return db
    .from("movie_recap_projects")
    .update({ render_stage: stage, render_progress_current: current, render_progress_total: total })
    .eq("id", projectId);
}

// The ROW is the authority on whether this render should still be going, not
// just the AbortController. A cancel that cannot reach this pipeline's
// controller — an older module instance after a hot reload, or a restart — still
// writes `failed` there, and without this that reset changed nothing: the render
// kept cutting and then overwrote the row with its own result. Checked between
// beats rather than inside them, which is often enough to stop within seconds
// and cheap enough to ignore (one indexed read per beat).
async function cancelledElsewhere(db: Db, projectId: string) {
  const { data } = await db.from("movie_recap_projects").select("render_status").eq("id", projectId).single();
  return Boolean(data) && data!.render_status !== "running";
}

// Give every cue enough time to be read: at least MIN_CUE_S, and never above
// MAX_CUE_CHARS_PER_SECOND. Chunks start out sharing the segment's duration in
// proportion to their length; raising a short chunk to the floor would overrun
// the segment, so the whole run is scaled back down to fit afterwards.
function timeCaptionChunks(chunks: string[], segmentS: number, maxSegment: number) {
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const wanted = chunks.map((chunk) => {
    const share = totalChars > 0 ? (chunk.length / totalChars) * segmentS : segmentS / chunks.length;
    return Math.max(MIN_CUE_S, chunk.length / MAX_CUE_CHARS_PER_SECOND, share);
  });
  const needed = wanted.reduce((sum, value) => sum + value, 0);
  // The segment grows when its cues cannot be read in the time the narration
  // estimate allows — the clip is stretched to match further down, so the video
  // follows the subtitles rather than cutting away from them.
  const grown = Math.max(segmentS, needed);
  if (grown <= maxSegment) return { durations: wanted, segmentS: grown };

  // Over the cap: squeeze every cue by the same factor, but stop at the
  // absolute reading limit rather than compressing into an unreadable flash.
  const floors = chunks.map((chunk) => chunk.length / ABS_MAX_CUE_CHARS_PER_SECOND);
  const squeezed = wanted.map((value, i) => Math.max(floors[i], value * (maxSegment / grown)));
  return { durations: squeezed, segmentS: squeezed.reduce((sum, value) => sum + value, 0) };
}

// Blur/logo apply once, on the whole concatenated video, not per-segment —
// both are fixed positions/regions for the entire recap, so a single final
// pass is equivalent to per-segment and far simpler.
//
function buildOverlayFilter(project: MovieRecapProject, assPath: string | null, repairFrames = 0) {
  const [w, h] = TARGET_DIMENSIONS[project.aspectRatio];
  const parts: string[] = [`[0:v]settb=1/${MOVIE_RECAP_TARGET_FPS},setpts=N[timeline]`];
  let label = "timeline";

  if (repairFrames > 0) {
    parts.push(`[${label}]tpad=stop_mode=clone:stop=${repairFrames}[repaired]`);
    label = "repaired";
  }

  // One split/crop/overlay per region, chained. Each is independent — they may
  // overlap, and a region blurred twice is simply blurred twice.
  const radius = movieRecapBlurRadius(MOVIE_RECAP_BLUR.radius, project.aspectRatio);
  for (const [index, region] of project.blurRegions.entries()) {
    const bx = Math.round((region.x / 100) * w);
    const by = Math.round((region.y / 100) * h);
    const bw = Math.min(w - bx, Math.max(2, Math.round((region.width / 100) * w)));
    const bh = Math.min(h - by, Math.max(2, Math.round((region.height / 100) * h)));
    if (bw < 2 || bh < 2) continue;
    parts.push(`[${label}]split=2[base${index}][toBlur${index}]`);
    parts.push(`[toBlur${index}]crop=${bw}:${bh}:${bx}:${by},boxblur=${radius}:${MOVIE_RECAP_BLUR.passes}[blurred${index}]`);
    parts.push(`[base${index}][blurred${index}]overlay=${bx}:${by}[blurred_full${index}]`);
    label = `blurred_full${index}`;
  }

  // Styled subtitles are burned in here, before the logo, so the logo always
  // stays the topmost mark. libass does the Burmese shaping (harfbuzz), which
  // is why this needs the ffmpeg-full build — see history/movie-recap.md.
  if (assPath) {
    parts.push(`[${label}]ass=${assPath.replace(/([\\:,'[\]])/g, "\\$1")}[subbed]`);
    label = "subbed";
  }

  if (project.logoEnabled && project.logoUrl) {
    // Same contain-box as the customize-step preview (MOVIE_RECAP_LOGO_BOX):
    // fit inside width AND height, never just width — scaling on width alone
    // made a tall logo render larger than it previewed.
    const logoWidthPct = project.aspectRatio === "9:16" ? MOVIE_RECAP_LOGO_BOX.portraitWidthPct : MOVIE_RECAP_LOGO_BOX.widthPct;
    const logoW = Math.round((w * logoWidthPct) / 100);
    const logoH = Math.round((h * MOVIE_RECAP_LOGO_BOX.heightPct) / 100);
    const marginX = Math.round((w * MOVIE_RECAP_LOGO_BOX.marginPct) / 100);
    const marginY = Math.round((h * MOVIE_RECAP_LOGO_BOX.marginPct) / 100);
    const opacity = (project.logoOpacity / 100).toFixed(2);
    const x = project.logoPlacement.endsWith("right") ? `W-w-${marginX}` : `${marginX}`;
    const y = project.logoPlacement.startsWith("bottom") ? `H-h-${marginY}` : `${marginY}`;
    parts.push(`[1:v]scale=${logoW}:${logoH}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[logo]`);
    parts.push(`[${label}][logo]overlay=${x}:${y}[vout]`);
    label = "vout";
  }

  if (label !== "vout") parts.push(`[${label}]null[vout]`);
  return parts.join(";");
}

// A narration segment is a full recap sentence/paragraph — correct for TTS,
// too long for one subtitle cue (wraps into many lines, and ::cue boxes each
// wrapped line separately, so a long cue renders as stacked boxes instead of
// one caption). Split on Burmese sentence breaks first, then on spaces if a
// single "sentence" is still too long.
const MAX_CUE_CHARS = 40;

function splitIntoCaptionChunks(text: string): string[] {
  const sentences = text
    .split("။")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${s}။`);
  const chunks: string[] = [];
  for (const sentence of sentences.length ? sentences : [text]) {
    if (sentence.length <= MAX_CUE_CHARS) {
      chunks.push(sentence);
      continue;
    }
    const words = sentence.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > MAX_CUE_CHARS && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.length ? chunks : [text];
}

/**
 * Split a narration line into exactly `count` caption chunks, balanced by
 * length, at word boundaries.
 *
 * Returns FEWER than asked when the line has too few words to divide — Burmese
 * is written with spaces between phrases rather than every word, so a short
 * line can be one indivisible token. The caller distributes whatever comes back
 * across the shots.
 */
export function splitIntoNChunks(text: string, count: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (count <= 1 || words.length <= 1) return [text];
  const wanted = Math.min(count, words.length);
  const total = words.reduce((sum, word) => sum + word.length, 0);
  const chunks: string[] = [];
  let current: string[] = [];
  let used = 0;
  for (const [i, word] of words.entries()) {
    current.push(word);
    used += word.length;
    const remainingWords = words.length - i - 1;
    const remainingChunks = wanted - chunks.length - 1;
    if (remainingChunks <= 0) continue;
    // Close this chunk once it holds its share of the characters — or sooner, if
    // there are only just enough words left to give every remaining chunk one.
    const share = (total / wanted) * (chunks.length + 1);
    if (used >= share || remainingWords <= remainingChunks) {
      chunks.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

/**
 * How many shots each caption chunk is shown across, summing to `shotCount`.
 *
 * One cue per shot is the point — a caption that outlives the cut under it is
 * what made a long beat read as a wall of text. When the line cannot be divided
 * that finely, the longest chunks take the extra shots rather than the first
 * ones, so a two-word chunk is not left on screen for three cuts.
 */
export function spreadCuesOverShots(chunks: string[], shotCount: number): number[] {
  const spread = chunks.map(() => 1);
  let left = shotCount - chunks.length;
  if (left <= 0) return spread;
  const order = chunks
    .map((chunk, index) => ({ index, length: chunk.length }))
    .sort((a, b) => b.length - a.length || a.index - b.index);
  let at = 0;
  while (left > 0) {
    spread[order[at % order.length].index] += 1;
    at += 1;
    left -= 1;
  }
  return spread;
}

function movieRecapWatermarkText(project: MovieRecapProject) {
  return project.logoEnabled ? project.logoWatermarkText?.trim() || null : null;
}

// ASS colors are &HAABBGGRR — byte-reversed from CSS hex, and the alpha byte
// is INVERTED (00 = fully opaque, FF = fully transparent).
export function toAssColor(hex: string, opacityPercent = 100) {
  const value = hex.replace("#", "");
  const alpha = Math.round(255 - (Math.min(100, Math.max(0, opacityPercent)) / 100) * 255);
  const rr = value.slice(0, 2);
  const gg = value.slice(2, 4);
  const bb = value.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0")}${bb}${gg}${rr}`.toUpperCase();
}

function toAssTimestamp(seconds: number) {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// The same subtitle design the wizard configures, expressed for libass. Sizes
// are percentages of the frame, so they land identically at any output
// resolution and match the CSS preview (MovieRecapSubtitleOverlay).
function buildAss(project: MovieRecapProject, cues: { start: number; end: number; text: string }[], durationS: number) {
  const [w, h] = TARGET_DIMENSIONS[project.aspectRatio];
  const style = movieRecapSubtitleStyle(project);
  // The size the CSS preview uses, in output pixels — the shared meaning of the
  // resolved `fontSizePct`. Everything else here is derived from it.
  const cssPx = (style.fontSizePct / 100) * h;
  const fontSize = Math.round(cssPx * ASS_FONT_SIZE_RATIO);
  const alignment = project.subtitlePosition === "top" ? 8 : project.subtitlePosition === "middle" ? 5 : 2;
  const marginV = project.subtitlePosition === "middle" ? 0 : Math.round((project.subtitleOffset / 100) * h);
  const marginH = Math.round((w * 6) / 100);
  const transparent = "&HFF000000";
  // Outline is a fixed fraction of the subtitle font size, resolved against the
  // CSS-equivalent size (not the inflated ASS one). It expands the glyph contour
  // on every side — that is what keeps the caption readable against a frame of
  // any brightness. `Shadow` stays 0: see the constants for why.
  const outline = Math.max(1, Math.round(cssPx * style.outlineEm));
  const color = toAssColor(style.color);
  // Weight is part of the preset, not a per-project switch.
  const face = subtitleFace(style.weight);
  const common = `${face.bold},0,0,0,100,100,0,0`;
  const geometry = `${alignment},${marginH},${marginH},${marginV},1`;
  const hookAlignment = project.hookTitlePosition === "top" ? 8 : project.hookTitlePosition === "middle" ? 5 : 2;
  const hookMarginV = project.hookTitlePosition === "middle" ? 0 : Math.round((project.hookTitleOffset / 100) * h);
  const hookGeometry = `${hookAlignment},${marginH},${marginH},${hookMarginV},1`;

  // One style, one layer per cue. The two-layer box/glyph split this used to
  // carry existed only to draw the background pill (BorderStyle 3 with the box
  // colour in OutlineColour); with the pill gone there is nothing behind the
  // text to keep independent.
  const watermarkPx = (MOVIE_RECAP_WATERMARK.sizePct[project.aspectRatio] / 100) * h;
  const watermarkColor = toAssColor(MOVIE_RECAP_WATERMARK.color, MOVIE_RECAP_WATERMARK.opacityPct);
  const watermarkFace = subtitleFace(MOVIE_RECAP_WATERMARK.weight);
  const watermarkSpacing = Math.round(watermarkPx * MOVIE_RECAP_WATERMARK.letterSpacingEm);
  const styles = [
    `Style: Watermark,${watermarkFace.name},${Math.round(watermarkPx * ASS_FONT_SIZE_RATIO)},${watermarkColor},${watermarkColor},${transparent},${transparent},${watermarkFace.bold},0,0,0,100,100,${watermarkSpacing},0,1,0,0,5,${marginH},${marginH},0,1`,
    `Style: Text,${face.name},${fontSize},${color},${color},${toAssColor(style.outlineColor)},${transparent},${common},1,${outline},0,${geometry}`,
    `Style: HookTitle,${face.name},${fontSize},${color},${color},${toAssColor(style.outlineColor)},${transparent},${common},1,${outline},0,${hookGeometry}`,
  ];

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = cues
    .map((cue) => {
      const text = cue.text.replace(/\r?\n/g, "\\N");
      const timing = `${toAssTimestamp(cue.start)},${toAssTimestamp(cue.end)}`;
      return `Dialogue: 0,${timing},Text,,0,0,0,,${text}`;
    })
    .join("\n");
  const hookEvent = project.hookTitle
    ? `Dialogue: 1,${toAssTimestamp(0)},${toAssTimestamp(durationS)},HookTitle,,0,0,0,,${project.hookTitle.replace(/\r?\n/g, "\\N")}`
    : "";

  const watermarkText = movieRecapWatermarkText(project);
  const watermarkEvent = watermarkText
    ? `Dialogue: 0,${toAssTimestamp(0)},${toAssTimestamp(durationS)},Watermark,,0,0,0,,${watermarkText.toUpperCase().replace(/\r?\n/g, "\\N")}`
    : "";

  return `${header}\n${[watermarkEvent, events, hookEvent].filter(Boolean).join("\n")}\n`;
}

// Runs the full pipeline synchronously: read -> copyright-free transform ->
// narration script -> TTS -> duration-matched render. Writes its own status/result onto the project row rather than
// throwing, so the caller just re-reads the row after this resolves.
// Mock narration: evenly slice the first MOVIE_RECAP_MOCK_SOURCE_SECONDS of
// the source between the canned lines, so a mock render exercises the exact
// same segment/overlay/subtitle code path as a real one — without scene
// detection, the vision pass, Whisper, or the narration model.
function mockNarration(project: MovieRecapProject): MovieRecapNarrationSegment[] {
  const span = Math.max(
    MIN_SEGMENT_S * MOVIE_RECAP_MOCK_NARRATION.length,
    Math.min(project.sourceDurationSeconds || MOVIE_RECAP_MOCK_SOURCE_SECONDS, MOVIE_RECAP_MOCK_SOURCE_SECONDS)
  );
  const each = span / MOVIE_RECAP_MOCK_NARRATION.length;
  // Two shots per line: a mock render has to exercise the cutting path, not
  // just the single-shot case, or it stops being a preview of the real one.
  return MOVIE_RECAP_MOCK_NARRATION.map((text, i) => {
    const start = i * each;
    const mid = start + each / 2;
    return {
      shots: [
        { sourceStartS: Number(start.toFixed(3)), sourceEndS: Number(mid.toFixed(3)) },
        { sourceStartS: Number(mid.toFixed(3)), sourceEndS: Number(((i + 1) * each).toFixed(3)) },
      ],
      text,
    };
  });
}

// Dialogue spoken inside a scene's own time range, joined into one string for
// the narration model. A scene with none is an action beat — its visual
// description is the only thing describing it.
// PARKED with the narration model that consumed it — nothing calls this while
// the script is typed by hand. See history/movie-recap.md.
export function dialogueForScene(transcript: TranscriptSegment[], startS: number, endS: number) {
  return transcript
    .filter((line) => line.end > startS && line.start < endS)
    .map((line) => line.text.trim())
    .join(" ")
    .trim();
}

// The tail is the source right after the previous clip, at that clip's speed,
// so the cut first continues the motion and then dissolves into the next clip.
// Only for a forward skip long enough to hold the tail: a backward jump or an
// overlap would show the next clip's frames twice.
export function crossfadeFromPreviousClip({
  previousEndS,
  previousSpeed,
  nextStartS,
  slotFrames,
  fps = MOVIE_RECAP_TARGET_FPS,
  crossfadeS = MOVIE_RECAP_CUT_CROSSFADE_S,
}: {
  previousEndS: number | null;
  previousSpeed: number | null;
  nextStartS: number;
  slotFrames: number;
  fps?: number;
  crossfadeS?: number;
}) {
  const frames = Math.round(crossfadeS * fps);
  if (previousEndS === null || !previousSpeed || frames < 1 || slotFrames <= frames * 2) return null;
  const durationS = frames / fps;
  const tailSourceS = (frames + 1) / fps * previousSpeed;
  if (nextStartS - previousEndS < tailSourceS) return null;
  return { frames, durationS, tailStartS: previousEndS, tailSourceS };
}

export function silentTimingFilter() {
  const retainFrames = Math.round(MOVIE_RECAP_EDIT.retainSourceS * MOVIE_RECAP_TARGET_FPS);
  const cycleFrames = Math.round(
    (MOVIE_RECAP_EDIT.retainSourceS + MOVIE_RECAP_EDIT.skipSourceS) * MOVIE_RECAP_TARGET_FPS
  );
  const slowedFrameRate = MOVIE_RECAP_TARGET_FPS * MOVIE_RECAP_PLAYBACK_SPEED;
  return [
    `fps=${MOVIE_RECAP_TARGET_FPS}`,
    `select='lt(mod(n\\,${cycleFrames})\\,${retainFrames})'`,
    `setpts=N/(${slowedFrameRate}*TB)`,
    `fps=${MOVIE_RECAP_TARGET_FPS}`,
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  ].join(",");
}

// Null on anything unreadable — a missing object, a bucket change, a half-written
// blob. The caller turns that into "render again from the source" rather than a
// render that silently plans against nothing.
async function detectAndSaveSourceCrop(db: Db, project: MovieRecapProject, sourcePath: string, signal: AbortSignal) {
  const crop = await detectContentCrop(sourcePath, project.sourceDurationSeconds, signal).catch(() => null);
  const analysisKey = movieRecapObjectKey(project.id, "analysis", "analysis.json");
  await putObject(analysisKey, Buffer.from(JSON.stringify({ crop } satisfies MovieRecapRenderAnalysis)), "application/json");
  await db.from("movie_recap_projects").update({ render_analysis_key: analysisKey }).eq("id", project.id);
  return crop;
}

async function loadRenderAnalysis(project: MovieRecapProject): Promise<MovieRecapRenderAnalysis | null> {
  if (!project.renderAnalysisKey) return null;
  const text = await getObjectText(project.renderAnalysisKey);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as MovieRecapRenderAnalysis;
    return { crop: parsed.crop ?? null };
  } catch {
    return null;
  }
}

/**
 * Runs the whole pipeline and writes its own status/result onto the project row,
 * so the caller just re-reads the row afterwards.
 *
 * It RETURNS the shot log — how every cut actually came out — which is
 * deliberately not stored on the row: it is a record of how one generation went,
 * useful for comparing runs, and it lives in the browser's localStorage rather
 * than the database (see history/movie-recap.md). Null when the render failed.
 */
export async function runMovieRecapRender(
  db: Db,
  project: MovieRecapProject,
  { mock = false, silentTiming = false, episode, previous }: {
    mock?: boolean;
    silentTiming?: boolean;
    // `project.renderScript` is already the episode's (episodeProject()).
    episode?: MovieRecapEpisode;
    // Pre-claim render columns, put back when an episode render ends.
    previous?: RecapColumnSnapshot;
  } = {}
) {
  const controller = new AbortController();
  activeRenders.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-"));
  const previousRenderState = previous ?? renderSnapshot(project);
  let episodeOutputKey: string | null = null;
  let timelineWarning: string | null = null;
  const markFailed = async (error: string) => {
    if (episode) {
      await db.from("movie_recap_episodes").update({
        render_status: "failed", render_error: trimFailureMessage(error), updated_at: new Date().toISOString(),
      }).eq("id", episode.id);
      await db.from("movie_recap_projects").update(previousRenderState).eq("id", project.id);
      if (episodeOutputKey) await deleteObject(episodeOutputKey).catch(() => undefined);
      return;
    }
    await db
      .from("movie_recap_projects")
      .update({
        render_status: "failed",
        render_error: trimFailureMessage(error),
        // The stage is deliberately NOT cleared here. It is the only record of
        // WHERE the render failed, and the Review tab's progress bar marks that
        // step red — clearing it would leave a failed render with a bar showing
        // nothing started. The progress counters do go, since "scene 12 of 40"
        // is meaningless once the run is over.
        render_progress_current: null,
        render_progress_total: null,
        render_completed_at: new Date().toISOString(),
      })
      .eq("id", project.id);
  };

  try {
    // The aspect ratio IS the format: 9:16 cuts fast for TikTok and Facebook,
    // 16:9 holds longer for YouTube. Everything about beat length and shot
    // length below reads from here.
    const pacing = movieRecapPacing(project.aspectRatio);

    if (silentTiming) {
      const sourcePath = path.join(workDir, "source.mp4");
      const outputPath = path.join(workDir, "silent-timing-test.mp4");
      await setProgress(db, project.id, "downloading_source");
      await downloadMovieRecapSource(project, sourcePath, {
        signal,
        report: (done, total) => setProgress(db, project.id, "downloading_source", done, total),
      });
      const sourceDurationS = (await probeDurationS(sourcePath, signal)) ?? project.sourceDurationSeconds;
      await setProgress(db, project.id, "rendering_segments", 0, 1);
      await run(
        FFMPEG,
        [
          "-y", "-i", sourcePath, "-an", "-vf", silentTimingFilter(), "-t",
          sourceDurationS.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p",
          "-movflags", "+faststart", outputPath,
        ],
        signal
      );
      await setProgress(db, project.id, "rendering_segments", 1, 1);
      await setProgress(db, project.id, "uploading");
      const outputKey = movieRecapObjectKey(project.id, "render", `silent-timing-${project.id}.mp4`);
      const outputUrl = await putObject(outputKey, await readFile(outputPath), "video/mp4");
      const durationS = (await probeDurationS(outputPath, signal)) ?? sourceDurationS;
      await db
        .from("movie_recap_projects")
        .update({
          render_status: "done",
          render_error: null,
          render_warning: null,
          render_output_url: outputUrl,
          render_output_object_key: outputKey,
          render_audio_url: null,
          render_audio_object_key: null,
          render_footage_url: outputUrl,
          render_footage_object_key: outputKey,
          render_stage: null,
          render_progress_current: null,
          render_progress_total: null,
          render_completed_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      return {
        createdAt: new Date().toISOString(),
        mock: false,
        timingTest: true,
        durationS: round2(durationS),
        beats: 0,
        shots: [],
        padS: 0,
      };
    }

    // The route already claimed this row — status, mock flag, cleared error and
    // start time all landed there in the one statement that won the claim. This
    // used to write them again here, which is what left the claim non-atomic.

    // What the transform currently covers: zoom, colour, mirror (16:9) and the
    // blurred letterbox fill. What it does NOT: source-continuity limits, forced
    // speed changes, and freeze/zoom cadence — each of those changes a shot's
    // duration or its placement, so they belong to the planner, not the filter.
    console.log(
      `[MovieRecapRender] project=${project.id} shot filter: ${buildShotFilter(shotFilterContext(project))}`
    );

    let narration: MovieRecapNarrationSegment[];
    // The source's own letterbox, found by the script run. A mock render has no
    // analysis, so it frames the raw file — the same thing it did before.
    let sourceCrop: MovieRecapRenderAnalysis["crop"] = null;
    if (mock) {
      // Mock render: no download, no scene detection, no Whisper, no GPT, no
      // API spend. Everything after this point is the real pipeline, so
      // framing/logo/subtitle design can be checked for free (see history).
      narration = mockNarration(project);
      console.log(`[MovieRecapRender] project=${project.id} MOCK render — the script run, vision and narration skipped.`);
    } else {
      // EVERY real render cuts the saved script and nothing else. Reading the
      // source, dividing the story across its scenes and speaking it all belong
      // to the script run (lib/movie-recap-script.ts), which happens first and
      // which the user has read the measurements from. What is left here is
      // ffmpeg — plus cache reads for audio that run has already paid for.
      narration = project.renderScript ?? [];
      if (!narration.length) throw new Error("Build the script first — there is nothing to render.");
      const analysis = await loadRenderAnalysis(project);

      await setProgress(db, project.id, "downloading_source");
      const sourcePath = path.join(workDir, "source.mp4");
      await downloadMovieRecapSource(project, sourcePath, {
        signal,
        report: (done, total) => setProgress(db, project.id, "downloading_source", done, total),
      });
      // Missing after a same-video quality replacement: the crop is in source
      // pixels, so it is measured again on the new file rather than rebuilt with
      // the script.
      sourceCrop = analysis
        ? analysis.crop ?? null
        : await detectAndSaveSourceCrop(db, project, sourcePath, signal);
      console.log(
        `[MovieRecapRender] project=${project.id} cutting ${narration.length} beat(s); ` +
          `detection, the vision pass and the split are not run here.`
      );
    }

    // Narration is the master timeline. The script run normally created this
    // exact WAV and timing manifest already; a render downloads both in one
    // cache hit. If they are missing, rebuilding still uses the per-beat cache,
    // so only edited/missing beats are synthesized.
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    let renderRates;
    if (mock) {
      renderRates = resolveMovieRecapTimelineRates(
        narration.map((segment) => ({ shots: segment.shots, targetS: estimateSpokenSeconds(segment.text) }))
      );
    } else {
      renderRates = {
        videoSpeed: MOVIE_RECAP_PLAYBACK_SPEED,
        narrationRate: MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
      };
    }
    const videoSpeed = renderRates.videoSpeed;
    const narrationRate = renderRates.narrationRate;
    let narrationPath: string | null = null;
    let narrationAudioKey: string | null = null;
    let narrationTimings: { beat: number; startS: number; endS: number; durationS: number }[] = [];

    if (!mock) {
      const master = await ensureNarrationMaster({
        projectId: project.id,
        voice,
        texts: narration.map((segment) => segment.text),
        workDir,
        signal,
        knownClipDurations: narration.map((segment) => segment.rawAudioS ?? (
          segment.audioS && segment.narrationRate ? segment.audioS * segment.narrationRate : undefined
        )),
        playbackRate: narrationRate,
      });
      narrationPath = master.path;
      narrationAudioKey = master.audioKey;
      narrationTimings = master.timings;
      if (narration.some((segment, index) =>
        segment.narrationRate !== narrationRate || segment.audioS !== round2(master.timings[index].durationS)
      )) {
        narration = narration.map((segment, index) => ({
          ...segment,
          audioS: round2(master.timings[index].durationS),
          narrationRate,
          videoSpeed,
        }));
        await writeMovieRecapScript(db, project.id, episode?.id ?? null, narration);
      }
      await setProgress(db, project.id, "synthesizing_narration", narration.length, narration.length);
      console.log(
        `[MovieRecapRender] project=${project.id} narration.wav ready for ${narration.length} beat(s) ` +
          `(${master.cached ? "master cache hit" : "master rebuilt from beat cache"}).`
      );
    }

    // Narration remains the master timeline. Real footage is planned per beat:
    // excess picture trims at that beat's end and a short beat holds its own
    // final frame, never borrowing from another beat.
    const sourceForClips = mock ? project.sourceUrl! : path.join(workDir, "source.mp4");
    // Framing and the copyright-free transform both live in
    // lib/movie-recap-transform.ts; the same chain is used for every shot.
    const vf = buildShotFilter(shotFilterContext(project, sourceCrop));
    if (sourceCrop) {
      console.log(
        `[MovieRecapRender] project=${project.id} source letterbox cut: ${sourceCrop.width}x${sourceCrop.height} at ${sourceCrop.x},${sourceCrop.y}`
      );
    }
    const sourceLengthOf = (shot: SourceWindow) => Math.max(MOVIE_RECAP_EDIT.minSourceS, shot.sourceEndS - shot.sourceStartS);
    const segmentPaths: string[] = [];
    const beatDurations: number[] = [];
    const cues: { start: number; end: number; text: string }[] = [];
    // How each shot actually came out, handed back to the caller so the browser
    // can keep a history of generations. `padS` is the one that matters: it is
    // seconds with no footage behind them, which the render fills by holding a
    // frame, and a silent version of it shipped once.
    const shotLog: MovieRecapRenderShot[] = [];
    let lastSourceEndS: number | null = null;
    let lastSpeed: number | null = null;
    let cursor = 0;
    let encodedFrameBudget = 0;
    let plannedVideoDurationS: number | null = null;

    const sceneForBeat = new Map<number, {
      firstIndex: number;
      startS: number;
      endS: number;
      targetS: number;
      videoSpeed: number;
      clips: MovieRecapTimelineClip[];
    }>();
    if (!mock) {
      const scenePlan = buildMovieRecapSceneTimingPlan({
        narration: narration.map((segment, index) => ({
          ...segment,
          audioS: narrationTimings[index]?.durationS ?? segment.audioS,
        })),
        videoSpeed,
        targetFps: MOVIE_RECAP_TARGET_FPS,
      });
      plannedVideoDurationS = scenePlan.finalS;
      for (const group of scenePlan.groups) {
        const renderGroup = {
          firstIndex: group.firstBeatIndex,
          startS: group.sourceStartS,
          endS: group.sourceEndS,
          targetS: group.targetS,
          videoSpeed: group.videoSpeed,
          clips: group.clips,
        };
        for (const beatIndex of group.beatIndices) sceneForBeat.set(beatIndex, renderGroup);
      }
    }

    for (const [i, segment] of narration.entries()) {
      if (await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      const chunks = mock ? [segment.text] : splitIntoCaptionChunks(segment.text);
      const estimatedS = estimateSpokenSeconds(segment.text);
      const scene = sceneForBeat.get(i);
      const firstSceneBeat = !scene || scene.firstIndex === i;
      const targetS = mock
        ? timeCaptionChunks(chunks, estimatedS, pacing.maxSegmentS).segmentS
        : scene?.targetS ?? narrationTimings[i]?.durationS ?? estimatedS;
      const adjustedTargetS = mock
        ? targetS * (MOVIE_RECAP_NARRATION_PLAYBACK_RATE / narrationRate)
        : targetS;
      const shots = mock
        ? planMovieRecapBeatTimeline({
            shots: segment.shots,
            spares: [],
            targetS: adjustedTargetS,
            playbackSpeed: videoSpeed,
          }).clips
        : firstSceneBeat ? scene?.clips ?? [] : [];
      if (mock && !shots.length) throw new Error(`Narration beat ${i + 1} has no footage to render.`);
      let slots = shots.map((shot) => shot.slotS);

      if (mock) {
        let quantized = 0;
        let elapsed = 0;
        slots = slots.map((value) => {
          elapsed += value;
          const boundary = Math.round(elapsed * MOVIE_RECAP_TARGET_FPS) / MOVIE_RECAP_TARGET_FPS;
          const slot = boundary - quantized;
          quantized = boundary;
          return slot;
        });
      }
      if (!mock && scene && shots.length) {
        const naturalS = slots.reduce((total, value) => total + value, 0);
        if (scene.targetS > naturalS) slots[slots.length - 1] += scene.targetS - naturalS;
        else {
          let remaining = scene.targetS;
          slots = slots.map((value) => {
            const slot = Math.max(0, Math.min(value, remaining));
            remaining -= slot;
            return slot;
          });
        }
        // The last shot takes the rounding remainder so this scene cannot drift past its narration boundary.
        const sceneFrames = Math.round(scene.targetS * MOVIE_RECAP_TARGET_FPS);
        let elapsedS = 0;
        let allocatedFrames = 0;
        slots = slots.map((value, index) => {
          elapsedS += value;
          const endFrame = index === slots.length - 1
            ? sceneFrames
            : Math.min(sceneFrames, Math.max(allocatedFrames, Math.round(elapsedS * MOVIE_RECAP_TARGET_FPS)));
          const slotFrames = endFrame - allocatedFrames;
          allocatedFrames = endFrame;
          return slotFrames / MOVIE_RECAP_TARGET_FPS;
        });
      }
      const shotCount = shots.length;
      const beatVideoSpeed = mock ? videoSpeed : scene?.videoSpeed ?? videoSpeed;
      const beatS = mock ? slots.reduce((total, value) => total + value, 0) : (firstSceneBeat ? targetS : narrationTimings[i]?.durationS ?? estimatedS);
      const heldS = shots.reduce(
        (total, shot, index) => total + Math.max(0, slots[index] - sourceLengthOf(shot) / beatVideoSpeed),
        0
      );
      if (heldS > 0.1) {
        console.warn(
          `[MovieRecapRender] project=${project.id} beat=${i + 1} ${heldS.toFixed(2)}s has no footage behind it — ` +
            `selected and additional relevant footage were exhausted.`
        );
      }
      console.log(
        `[MovieRecapRender] project=${project.id} beat=${i + 1} ${beatS.toFixed(2)}s -> ${shotCount} shot(s) ` +
          `[${slots.map((value) => value.toFixed(2)).join(", ")}].`
      );

      for (const [shotIndex, shot] of shots.entries()) {
        const slotS = slots[shotIndex];
        if (!(slotS > 1 / MOVIE_RECAP_TARGET_FPS)) break;
        const sourceDurationS = sourceLengthOf(shot);
        const ratio = slotS / sourceDurationS;

        if (ratio < EXTREME_RATIO_MIN || ratio > EXTREME_RATIO_MAX) {
          console.warn(
            `[MovieRecapRender] project=${project.id} beat=${i + 1} shot=${shotIndex + 1} extreme duration mismatch (ratio=${ratio.toFixed(2)}) — a re-cut may look better.`
          );
        }

        const segPath = path.join(workDir, `seg-${i}-${shotIndex}.mp4`);
        const slotFrames = Math.max(1, Math.round(slotS * MOVIE_RECAP_TARGET_FPS));

        // Both branches use the resolved speed for this beat so its clips stay consistent,
        // so the only question is whether the scene is long enough to fill the
        // slot at that speed.
        const usedS = Math.min(sourceDurationS, slotS * beatVideoSpeed);
        const padS = Math.max(0, slotS - usedS / beatVideoSpeed);
        const slow = `setpts=PTS/${beatVideoSpeed}`;
        const filters =
          padS > 0
            ? // Freeze-pad: the scene runs out before its slot does, so hold the
              // last frame — and move it, so the hold reads as a choice rather
              // than as a stall.
              segmentFilters(
                vf,
                slow,
                `tpad=stop_mode=clone:stop_duration=${padS.toFixed(3)}`,
                `fps=${MOVIE_RECAP_TARGET_FPS}`,
                holdMotionFilter({ aspectRatio: project.aspectRatio, slotS, fps: MOVIE_RECAP_TARGET_FPS })
              )
            : // Trim: the scene has footage to spare, so only `slot * speed` of
              // it is read in the first place.
              segmentFilters(vf, slow);

        // `-ss`/`-t` BEFORE `-i` — INPUT-side seeking, and this is a performance
        // decision, not a style one. As output options ffmpeg decodes the file
        // from the start and throws frames away until it reaches `-ss`, so every
        // shot re-reads the whole film up to its own cut point. Measured on a
        // 17-minute source, one 3.5s shot at 241s: 17.0s output-side against
        // 1.54s input-side, for byte-identical output (105 frames, 3.500s). At
        // ~300 shots that is the difference between an hour and a few minutes,
        // and it is what made a full render outlive its own request.
        //
        // Input-side seeking makes `-t` a DURATION from the seek point, where
        // output-side `-to` was an absolute timestamp — so the branches above hand
        // over how much source to read, not where to stop.
        const fade = crossfadeFromPreviousClip({
          previousEndS: lastSourceEndS,
          previousSpeed: lastSpeed,
          nextStartS: shot.sourceStartS,
          slotFrames,
        });
        const shotInput = ["-ss", shot.sourceStartS.toFixed(3), "-t", usedS.toFixed(3), "-i", sourceForClips];
        const graph = fade
          ? ["-ss", fade.tailStartS.toFixed(3), "-t", fade.tailSourceS.toFixed(3), "-i", sourceForClips, ...shotInput,
             "-filter_complex",
             `[0:v]${segmentFilters(vf, `setpts=PTS/${lastSpeed}`)},trim=end_frame=${fade.frames},setpts=PTS-STARTPTS,format=yuv420p[tail];` +
               `[1:v]${filters},format=yuv420p[shot];` +
               `[tail][shot]xfade=transition=fade:duration=${fade.durationS.toFixed(6)}:offset=0[v]`,
             "-map", "[v]"]
          : [...shotInput, "-vf", filters];
        await run(
          FFMPEG,
          ["-y", ...graph, "-an", "-frames:v", String(slotFrames),
           "-c:v", "libx264", "-pix_fmt", "yuv420p", segPath],
          signal
        );
        encodedFrameBudget += slotFrames;
        segmentPaths.push(segPath);
        shotLog.push({
          beat: episode ? episode.startBeat + i : i + 1,
          shot: shotIndex + 1,
          slotS: round2(slotS),
          sourceStartS: round2(shot.sourceStartS),
          sourceEndS: round2(shot.sourceStartS + usedS),
          sourceS: round2(usedS),
          padS: round2(padS),
          speed: beatVideoSpeed,
          skipS: lastSourceEndS === null ? null : round2(shot.sourceStartS - lastSourceEndS),
        });
        lastSourceEndS = shot.sourceStartS + usedS;
        lastSpeed = beatVideoSpeed;
      }
      beatDurations.push(mock || firstSceneBeat ? beatS : 0);

      await setProgress(db, project.id, "rendering_segments", i + 1, narration.length);

      if (mock) {
        const share = beatS / Math.max(1, chunks.length);
        for (const chunk of chunks) {
          cues.push({ start: cursor, end: cursor + share, text: chunk });
          cursor += share;
        }
      } else {
        const timing = narrationTimings[i];
        const totalChars = chunks.reduce((total, chunk) => total + chunk.length, 0);
        let cueCursor = timing?.startS ?? cursor;
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const end = chunkIndex === chunks.length - 1
            ? timing?.endS ?? cueCursor
            : cueCursor + (timing?.durationS ?? 0) * (chunk.length / Math.max(1, totalChars));
          cues.push({ start: cueCursor, end, text: chunk });
          cueCursor = end;
        }
        cursor = timing?.endS ?? cueCursor;
      }
    }

    if (!segmentPaths.length) throw new Error("The source contains no footage to render.");

    // Concat every segment into the final no-audio recap video.
    await setProgress(db, project.id, "concatenating");
    const listPath = path.join(workDir, "concat.txt");
    await writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join("\n"));
    const concatPath = path.join(workDir, "concat.mp4");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath], signal);
    let timelineRepairFrames = 0;
    if (plannedVideoDurationS !== null) {
      const expectedFrames = Math.round(plannedVideoDurationS * MOVIE_RECAP_TARGET_FPS);
      const concatFrames = await probeVideoFrameCount(concatPath, signal).catch((error) => {
        if (signal.aborted) throw error;
        return null;
      });
      const frameDifference = concatFrames === null ? null : expectedFrames - concatFrames;
      if (frameDifference === null) {
        timelineWarning = "The video frame count could not be verified. Review its timing before using this export.";
        console.warn(`[MovieRecapRender] project=${project.id} video frame count unavailable after concat.`);
      } else if (Math.abs(frameDifference) > MOVIE_RECAP_TIMELINE_WARNING_FRAME_THRESHOLD) {
        const differenceS = (Math.abs(frameDifference) / MOVIE_RECAP_TARGET_FPS).toFixed(2);
        timelineWarning = frameDifference > 0
          ? `The video was ${frameDifference} frames (${differenceS}s) shorter than the narration. The final frame was held to keep the audio complete. Review the timing before using this export.`
          : `The video was ${-frameDifference} frames (${differenceS}s) longer than the narration. Extra end frames were trimmed. Review the timing before using this export.`;
        console.warn(
          `[MovieRecapRender] project=${project.id} timeline mismatch: ${concatFrames}/${expectedFrames} frames, ` +
            `${encodedFrameBudget} requested across ${segmentPaths.length} segments.`
        );
      }
      timelineRepairFrames = Math.max(0, frameDifference ?? 0);
    }

    // Burn captions/logo into the footage-only artifact first. The combined
    // output then stream-copies these exact video frames and adds narration, so
    // downloading footage never produces a visually different render.
    const footagePath = path.join(workDir, "footage.mp4");
    const assPath = project.subtitlesEnabled || project.hookTitle || movieRecapWatermarkText(project)
      ? path.join(workDir, "subtitles.ass")
      : null;
    if (assPath) {
      await writeFile(assPath, buildAss(project, project.subtitlesEnabled ? cues : [], plannedVideoDurationS ?? project.sourceDurationSeconds), "utf-8");
    }
    {
      await setProgress(db, project.id, "applying_overlays");
      const inputs = ["-i", concatPath];
      if (project.logoEnabled && project.logoUrl) inputs.push("-i", project.logoUrl);
      await run(
        FFMPEG,
        [
          "-y", ...inputs, "-filter_complex", buildOverlayFilter(project, assPath, timelineRepairFrames),
          "-map", "[vout]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
          ...(plannedVideoDurationS === null
            ? []
            : ["-frames:v", String(Math.round(plannedVideoDurationS * MOVIE_RECAP_TARGET_FPS))]),
          "-movflags", "+faststart", footagePath,
        ],
        signal
      );
    }

    let outputPath = footagePath;
    if (narrationPath) {
      outputPath = path.join(workDir, "output.mp4");
      await run(
        FFMPEG,
        [
          "-y", "-i", footagePath, "-i", narrationPath,
          "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart", outputPath,
        ],
        signal
      );
    }

    await setProgress(db, project.id, "uploading");
    const outputDurationS = await probeDurationS(outputPath, signal);
    if (episode) {
      episodeOutputKey = movieRecapObjectKey(project.id, "render", `episode-${episode.id}.mp4`);
      const outputUrl = await putObject(episodeOutputKey, await readFile(outputPath), "video/mp4");
      const { data: before } = await db.from("movie_recap_episodes").select("output_object_key").eq("id", episode.id).single();
      const now = new Date().toISOString();
      const { error: saveEpisodeError } = await db.from("movie_recap_episodes").update({
        render_status: "done",
        render_error: null,
        render_warning: timelineWarning,
        output_object_key: episodeOutputKey,
        output_url: outputUrl,
        duration_seconds: outputDurationS ?? plannedVideoDurationS,
        rendered_at: now,
        updated_at: now,
      }).eq("id", episode.id);
      if (saveEpisodeError) throw new Error(saveEpisodeError.message);
      const savedKey = episodeOutputKey;
      episodeOutputKey = null;
      if (before?.output_object_key && before.output_object_key !== savedKey) {
        await deleteObject(before.output_object_key).catch(() => undefined);
      }
      const { error: restoreError } = await db.from("movie_recap_projects")
        .update(previousRenderState).eq("id", project.id);
      if (restoreError) throw new Error(restoreError.message);
    } else {
      const [outputBuffer, footageBuffer] = await Promise.all([readFile(outputPath), readFile(footagePath)]);
      const outputKey = movieRecapObjectKey(project.id, "render", `recap-${project.id}.mp4`);
      const footageKey = movieRecapObjectKey(project.id, "render", `footage-${project.id}.mp4`);
      const [outputUrl, footageUrl] = await Promise.all([
        putObject(outputKey, outputBuffer, "video/mp4"),
        putObject(footageKey, footageBuffer, "video/mp4"),
      ]);
      const audioUrl = narrationAudioKey ? publicUrlFor(narrationAudioKey) : null;

      const { error: saveError } = await db
        .from("movie_recap_projects")
        .update({
          render_status: "done",
          render_error: null,
          render_warning: timelineWarning,
          ...(mock ? { render_transcript: null } : {}),
          render_output_url: outputUrl,
          render_output_object_key: outputKey,
          render_audio_url: audioUrl,
          render_audio_object_key: narrationAudioKey,
          render_footage_url: footageUrl,
          render_footage_object_key: footageKey,
          render_stage: null,
          render_progress_current: null,
          render_progress_total: null,
          render_completed_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      if (saveError) throw new Error(saveError.message);
      if (project.renderAudioObjectKey && project.renderAudioObjectKey !== narrationAudioKey) {
        await deleteObject(project.renderAudioObjectKey).catch(() => undefined);
      }
    }
    return {
      createdAt: new Date().toISOString(),
      mock,
      durationS: round2(outputDurationS ?? beatDurations.reduce((total, value) => total + value, 0)),
      beats: narration.length,
      shots: shotLog,
      padS: round2(shotLog.reduce((total, entry) => total + entry.padS, 0)),
      narrationRate,
    };
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof Error && error.name === "AbortError");
    await markFailed(cancelled ? "Cancelled." : error instanceof Error ? error.message : "Render failed.");
    return null;
  } finally {
    activeRenders.delete(project.id);
    await rm(workDir, { recursive: true, force: true });
  }
}
