import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generateMovieRecapHookTitles, generateMovieRecapNarration, openai, type RecapScene, type TranscriptSegment } from "./openai";
import { describeScenes, detectScenes, extractKeyframes, type MotionTrack } from "./movie-recap-scenes";
import { readSourceCaptions } from "./movie-recap-captions";
import { movieRecapObjectKey, putObject } from "./r2";
import { pickShotSpeed } from "./movie-recap";
import { buildShotFilter, shotFilterContext } from "./movie-recap-transform";
import { planBeat, type SourceWindow, SPEED_RAMP_MAX, SPEED_RAMP_MIN } from "./movie-recap-shots";
import { synthesize } from "./tts/synthesize";
import { resolveMovieRecapVoice } from "./tts/voices";
import {
  movieRecapSubtitleStyle,
  MOVIE_RECAP_COPYRIGHT_TRANSFORM,
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_MOCK_HOOK_TITLES,
  MOVIE_RECAP_MOCK_NARRATION,
  MOVIE_RECAP_MOCK_SOURCE_SECONDS,
  MOVIE_RECAP_BLUR,
  MOVIE_RECAP_TARGET_DIMENSIONS,
  movieRecapBlurRadius,
  movieRecapPacing,
  MOVIE_RECAP_TARGET_FPS,
} from "./constants/movie-recap";
import type { MovieRecapNarrationSegment, MovieRecapProject, MovieRecapRenderShot, MovieRecapRenderStage } from "./api/types";
import type { supabaseRoute } from "./supabase/route";

const execFileAsync = promisify(execFile);

const round2 = (value: number) => Number(value.toFixed(2));

// Whisper rejects an upload over 25MB. That is a real ceiling on this feature,
// not a formality: the extraction used to be 16kHz mono PCM, which is 32,000
// bytes a second, so anything longer than about 13.6 MINUTES failed — and the
// whole point is recapping feature-length films. Measured on a 131s source:
// 4,204,190 bytes of WAV against 245,693 of Opus.
//
// Opus at 16kbps mono is ~1,870 bytes a second, which puts the ceiling near 3.9
// hours and covers any film. It is a speech codec at a speech bitrate, so the
// quality cost is small: transcribing the same clip as WAV and as Opus returned
// the same dialogue apart from one proper noun. The narration prompt summarizes
// rather than quotes, so that is a fair trade for the feature working at all.
const TRANSCRIBE_AUDIO_BITRATE = "16k";
const WHISPER_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Homebrew's plain `ffmpeg` formula no longer bundles libass/freetype (they
// moved to the keg-only `ffmpeg-full`), and burning styled Burmese subtitles
// needs libass + harfbuzz. FFMPEG_PATH points at a build that has them;
// without it everything still runs except styled subtitle burn-in.
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const SUBTITLE_FONT = process.env.MOVIE_RECAP_SUBTITLE_FONT || "Noto Sans Myanmar";
// ASS has one weight control — a Bold flag — so anything between regular and
// bold has to be selected by naming the family fontconfig maps to that cut.
// These are the abbreviated names fontconfig actually answers to: `fc-match
// "Noto Sans Myanmar SemiBold"` returns VERDANA, while `... SemBd` returns the
// right face. Confirm any change with fc-match on the render host — a wrong name
// still renders Burmese (libass falls back per glyph), so it fails quietly.
const SUBTITLE_FONT_MEDIUM = process.env.MOVIE_RECAP_SUBTITLE_FONT_MEDIUM || "Noto Sans Myanmar Med";
const SUBTITLE_FONT_SEMIBOLD = process.env.MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD || "Noto Sans Myanmar SemBd";

function subtitleFace(weight: number) {
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
const ASS_FONT_SIZE_RATIO = Number(process.env.MOVIE_RECAP_SUBTITLE_FONT_RATIO) || 2.184;

// Rough Burmese spoken pace. A real render now measures its synthesized audio
// and uses that instead; this estimate is the fallback for a MOCK render, which
// never calls TTS (that is the point of mock — no API spend), and for a segment
// whose synthesis returned nothing usable.
// Burmese is not space-delimited — spaces mark phrase breaks, not words — so a
// word count is meaningless here: every narration line came out as ~4 "words"
// and got the same 1.7s no matter its length, which is what made shots flash by
// and subtitles unreadable. Characters are the usable proxy, but the rate is
// not flat: getting into a caption costs the most, and the rest is read faster
// once it has started. A flat rate therefore overpays long lines — the first
// LEAD_IN_CHARS run at the careful rate, everything after at the continuation
// rate.
const LEAD_IN_CHARS = 20;
const CHARS_PER_SECOND_BURMESE = 12.5;
const CONTINUATION_CHARS_PER_SECOND = 36;
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
// Floors, applied after the estimate. A recap beat shorter than this reads as a
// flash cut however well the narration fits it.
const MIN_SEGMENT_S = 2;
// A caption has to survive being read, not just being displayed: never shorter
// than this, and never faster than MAX_CUE_CHARS_PER_SECOND.
const MIN_CUE_S = 1;
const MAX_CUE_CHARS_PER_SECOND = 22;
// Beyond this the mismatch is really a "needs re-cut" case (out of scope for
// this phase — see history) — freeze/trim still applies, just logged as a warning.
const EXTREME_RATIO_MIN = 0.33;
const EXTREME_RATIO_MAX = 3;

const TARGET_DIMENSIONS = MOVIE_RECAP_TARGET_DIMENSIONS;

// Every narration clip is resampled to this before the parts are concatenated —
// the concat demuxer needs one identical format across all of them, and a
// provider is free to return whatever rate it likes.
const NARRATION_SAMPLE_RATE = 24000;

// Azure pads every clip it returns with silence — measured at ~0.18s before the
// speech and ~0.81s after it on a 4.85s clip. That silence is part of the file,
// so its duration sizes the beat, and the picture sits on a frame through all of
// it: five beats of narration carried nearly five seconds of dead air. Clips are
// trimmed back to their speech, and a single deliberate gap is added instead.
const SILENCE_THRESHOLD_DB = -40;
// Left either side of the speech so trimming can never clip a soft first or last
// syllable.
const SPEECH_MARGIN_S = 0.06;
// The breath between one line and the next. Real narration has one; what it does
// not have is a different one every time, set by whatever the TTS felt like
// appending.
const BEAT_GAP_S = 0.15;

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// One render per project at a time (enforced by the route's "already
// running" check), so a projectId -> AbortController map is enough to let a
// separate cancel request reach an in-flight render — no queue/job system
// needed. Only works within one Node process, which is this app's whole
// deployment target (see history/movie-recap.md).
const activeRenders = new Map<string, AbortController>();

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

async function run(cmd: string, args: string[], signal?: AbortSignal) {
  await execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 64, signal });
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

function estimateSpokenSeconds(text: string) {
  const characters = text.replace(/\s+/g, "").length;
  const leadIn = Math.min(characters, LEAD_IN_CHARS) / CHARS_PER_SECOND_BURMESE;
  const rest = Math.max(0, characters - LEAD_IN_CHARS) / CONTINUATION_CHARS_PER_SECOND;
  return Math.max(MIN_SEGMENT_S, leadIn + rest);
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

// Cuts a synthesized clip back to the speech inside it. ffmpeg reports where the
// silence runs are; the first non-silent sample and the last are the bounds, with
// SPEECH_MARGIN_S left on either side. A clip that is silent end to end, or that
// ffmpeg reports nothing for, is passed through untouched — better a long beat
// than one with its first word missing.
async function trimToSpeech(inputPath: string, outputPath: string, durationSeconds: number, signal?: AbortSignal) {
  // ffmpeg writes silencedetect to stderr and exits 0; a failure still carries
  // whatever it managed to report, so both paths feed the same parse.
  const args = ["-hide_banner", "-i", inputPath, "-af", `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=0.1`, "-f", "null", "-"];
  const report = await execFileAsync(FFMPEG, args, { maxBuffer: 1024 * 1024 * 16, signal })
    .then((result) => result.stderr)
    .catch((error: { stderr?: string }) => error.stderr ?? "");

  const starts = [...report.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...report.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // A leading run is one starting at (or just after) zero. A trailing run is one
  // whose END lands on the end of the file: ffmpeg closes the final run at EOF
  // rather than leaving it open, so testing for a missing `silence_end` finds
  // nothing and the clip keeps its tail.
  const leading = starts.length && starts[0] <= 0.05 && ends.length ? ends[0] : 0;
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  const closesAtEof = ends.length === starts.length && lastEnd >= durationSeconds - 0.02;
  const trailing = closesAtEof || ends.length < starts.length ? starts[starts.length - 1] : durationSeconds;

  const from = Math.max(0, leading - SPEECH_MARGIN_S);
  const to = Math.min(durationSeconds, trailing + SPEECH_MARGIN_S);
  // Nothing usable detected, or the clip is silence end to end: pass it through
  // rather than risk cutting a word off.
  if (!(to > from) || to - from < 0.2) return { path: inputPath, durationSeconds };

  await run(FFMPEG, ["-y", "-i", inputPath, "-ss", from.toFixed(3), "-to", to.toFixed(3), "-c:a", "pcm_s16le", outputPath], signal);
  return { path: outputPath, durationSeconds: Number((to - from).toFixed(3)) };
}

// Blur/logo apply once, on the whole concatenated video, not per-segment —
// both are fixed positions/regions for the entire recap, so a single final
// pass is equivalent to per-segment and far simpler.
function buildOverlayFilter(project: MovieRecapProject, assPath: string | null) {
  const [w, h] = TARGET_DIMENSIONS[project.aspectRatio];
  const parts: string[] = [];
  let label = "0:v";

  if (project.blurEnabled) {
    const bx = Math.round((project.blurX / 100) * w);
    const by = Math.round((project.blurY / 100) * h);
    const bw = Math.min(w - bx, Math.max(2, Math.round((project.blurWidth / 100) * w)));
    const bh = Math.min(h - by, Math.max(2, Math.round((project.blurHeight / 100) * h)));
    parts.push(`[${label}]split=2[base][toBlur]`);
    parts.push(`[toBlur]crop=${bw}:${bh}:${bx}:${by},boxblur=${movieRecapBlurRadius(MOVIE_RECAP_BLUR.radius, project.aspectRatio)}:${MOVIE_RECAP_BLUR.passes}[blurred]`);
    parts.push(`[base][blurred]overlay=${bx}:${by}[blurred_full]`);
    label = "blurred_full";
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
    const logoW = Math.round((w * MOVIE_RECAP_LOGO_BOX.widthPct) / 100);
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

// ASS colors are &HAABBGGRR — byte-reversed from CSS hex, and the alpha byte
// is INVERTED (00 = fully opaque, FF = fully transparent).
function toAssColor(hex: string, opacityPercent = 100) {
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
function buildAss(project: MovieRecapProject, cues: { start: number; end: number; text: string }[]) {
  const [w, h] = TARGET_DIMENSIONS[project.aspectRatio];
  const style = movieRecapSubtitleStyle(project);
  // The size the CSS preview uses, in output pixels — the shared meaning of the
  // preset's `fontSizePct`. Everything else here is derived from it.
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

  // One style, one layer per cue. The two-layer box/glyph split this used to
  // carry existed only to draw the background pill (BorderStyle 3 with the box
  // colour in OutlineColour); with the pill gone there is nothing behind the
  // text to keep independent.
  const styles = [
    `Style: Text,${face.name},${fontSize},${color},${color},${toAssColor(style.outlineColor)},${transparent},${common},1,${outline},0,${geometry}`,
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

  return `${header}\n${events}\n`;
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
// Whisper, with the audio compressed first. Extracted from the pipeline so the
// caller reads as the one decision it is: use the source's captions, or listen
// to it.
async function transcribeSource(
  db: Db,
  projectId: string,
  localSource: string,
  workDir: string,
  signal: AbortSignal
): Promise<TranscriptSegment[]> {
  await setProgress(db, projectId, "extracting_audio");
  const audioPath = path.join(workDir, "audio.ogg");
  await run(
    FFMPEG,
    ["-y", "-i", localSource, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", TRANSCRIBE_AUDIO_BITRATE, audioPath],
    signal
  );
  // Checked rather than assumed: the ceiling is wide but not infinite, and the
  // API's own error for an oversized upload does not say what to do about it.
  const audioBytes = (await stat(audioPath)).size;
  if (audioBytes > WHISPER_MAX_UPLOAD_BYTES) {
    throw new Error(
      `The source is too long to transcribe in one pass (${(audioBytes / 1024 / 1024).toFixed(1)}MB of audio against a 25MB limit).`
    );
  }
  await setProgress(db, projectId, "transcribing");
  const transcription = await openai().audio.transcriptions.create(
    { file: createReadStream(audioPath), model: "whisper-1", response_format: "verbose_json" },
    { signal }
  );
  const rawSegments = (transcription as unknown as { segments?: { start: number; end: number; text: string }[] }).segments ?? [];
  return rawSegments.map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }));
}

function dialogueForScene(transcript: TranscriptSegment[], startS: number, endS: number) {
  return transcript
    .filter((line) => line.end > startS && line.start < endS)
    .map((line) => line.text.trim())
    .join(" ")
    .trim();
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
export async function runMovieRecapRender(db: Db, project: MovieRecapProject, { mock = false } = {}) {
  const controller = new AbortController();
  activeRenders.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-"));
  const markFailed = (error: string) =>
    db
      .from("movie_recap_projects")
      .update({
        render_status: "failed",
        render_error: error,
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

  try {
    // The aspect ratio IS the format: 9:16 cuts fast for TikTok and Facebook,
    // 16:9 holds longer for YouTube. Everything about beat length and shot
    // length below reads from here.
    const pacing = movieRecapPacing(project.aspectRatio);

    await db
      .from("movie_recap_projects")
      .update({ render_status: "running", render_is_mock: mock, render_error: null, render_started_at: new Date().toISOString() })
      .eq("id", project.id);

    // What the transform currently covers: zoom, colour, mirror (16:9) and the
    // blurred letterbox fill. What it does NOT: source-continuity limits, forced
    // speed changes, and freeze/zoom cadence — each of those changes a shot's
    // duration or its placement, so they belong to the planner, not the filter.
    console.log(
      `[MovieRecapRender] project=${project.id} copyrightFree=${project.copyrightFree} — shot filter: ${buildShotFilter(shotFilterContext(project))}`
    );

    let transcript: TranscriptSegment[] = [];
    let narration: MovieRecapNarrationSegment[];
    let spareScenes: SourceWindow[] = [];
    // Both left unset by a mock render, which never runs detection.
    let sourceCuts: number[] = [];
    let sourceMotion: MotionTrack | null = null;

    if (mock) {
      // Mock render: no download, no scene detection, no Whisper, no GPT, no
      // API spend. Everything after this point is the real pipeline, so
      // framing/logo/subtitle design can be checked for free (see history).
      narration = mockNarration(project);
      console.log(`[MovieRecapRender] project=${project.id} MOCK render — scene detection, vision, transcription and narration skipped.`);
    } else {
      // 0. Pull the source down once. Scene detection decodes the whole file,
      // and every later ffmpeg seek would otherwise re-fetch over the network.
      await setProgress(db, project.id, "downloading_source");
      const localSource = path.join(workDir, "source.mp4");
      await run(FFMPEG, ["-y", "-i", project.sourceUrl!, "-c", "copy", localSource], signal);

      // 1a. The video's own structure: where the cuts are.
      await setProgress(db, project.id, "detecting_scenes");
      const detected = await detectScenes(localSource, workDir, signal);
      const rows = detected.scenes;
      // Every cut, including the ones merged away to build the scene list. The
      // shot planner needs them so a shot is never laid across one of the film's
      // own edits — see history/movie-recap.md.
      sourceCuts = detected.cuts;
      sourceMotion = detected.motion;

      // 1b. What each scene LOOKS like — a transcript cannot see an action
      // beat, and those are most of a recap. One keyframe per scene.
      await setProgress(db, project.id, "describing_scenes", 0, rows.length);
      const frames = await extractKeyframes(FFMPEG, localSource, rows, workDir, pacing.keyframesPerScene, signal);
      const visuals = await describeScenes(frames, signal, (done, total) =>
        setProgress(db, project.id, "describing_scenes", done, total)
      );

      // 1c. What each scene SOUNDS like.
      //
      // The source's own subtitle track first, when it has one: exact wording,
      // exact timings, no API call, no upload limit, no wait. Most sources do
      // not carry one — a download or a cutter export usually strips it — so
      // this fails soft and transcription stays the normal path.
      await setProgress(db, project.id, "reading_captions");
      const captions = await readSourceCaptions(FFMPEG, localSource, workDir, project.sourceDurationSeconds, signal);
      if (captions) {
        console.info(
          `[MovieRecapRender] project=${project.id} read ${captions.segments.length} cues from the source's ` +
            `${captions.stream.codec} subtitle track${captions.stream.language ? ` (${captions.stream.language})` : ""} — skipping transcription`
        );
        transcript = captions.segments;
      } else {
        transcript = await transcribeSource(db, project.id, localSource, workDir, signal);
      }

      const scenes: RecapScene[] = rows.map((row, index) => ({
        index,
        startS: Number(row.start.toFixed(2)),
        endS: Number(row.end.toFixed(2)),
        visual: visuals.get(index)?.visual ?? "",
        dialogue: dialogueForScene(transcript, row.start, row.end),
      }));
      // Where inside each scene the description came from, carried separately
      // because the narration model has no use for it — the SHOT PLANNER does.
      // With several frames per scene this is the model's chosen peak, so the
      // cut lands on the action rather than a fixed third of the way in.
      const keyframeFractionOf = (index: number) => visuals.get(index)?.keyframeFraction;

      // 3. Narration script over the scenes (2. copyright-free video transform
      // is applied per-segment below, alongside the render).
      await setProgress(db, project.id, "writing_script");
      const selected = await generateMovieRecapNarration(scenes, pacing, signal);
      // The model returns scene indexes, not timestamps, so every clip lands on
      // a real cut. Out-of-range indexes are dropped rather than clamped — a
      // wrong index means the model lost track, not that it meant the last scene.
      // A scene used twice would show the same footage under two different
      // lines, which reads as a mistake even when the prompt allows it by
      // accident. First use wins.
      const usedScenes = new Set<number>();
      narration = selected
        .map((line) => ({
          text: line.text.trim(),
          shots: (line.sceneIndexes ?? [])
            .filter((index) => {
              if (!scenes[index] || usedScenes.has(index)) return false;
              usedScenes.add(index);
              return true;
            })
            .map((index) => ({
              sourceStartS: scenes[index].startS,
              sourceEndS: scenes[index].endS,
              keyframeFraction: keyframeFractionOf(index),
            })),
        }))
        .filter((line) => line.text && line.shots.length)
        .sort((a, b) => a.shots[0].sourceStartS - b.shots[0].sourceStartS);
      // Scenes the model passed over are not waste: a beat whose line outruns
      // its own scenes borrows the nearest of these rather than holding one
      // frame for four seconds.
      spareScenes = scenes
        .filter((scene) => !usedScenes.has(scene.index))
        .map((scene) => ({
          sourceStartS: scene.startS,
          sourceEndS: scene.endS,
          keyframeFraction: keyframeFractionOf(scene.index),
        }));
      if (!narration.length) throw new Error("The AI returned no narration segments.");
      console.log(
        `[MovieRecapRender] project=${project.id} ${rows.length} scenes detected from ${detected.cuts.length + 1} cuts` +
          `${detected.motion ? "" : " (no motion track)"}, ` +
          `${transcript.length} transcript lines, ${narration.length} narration beats.`
      );
    }

    // 4. Narration audio. One synthesis call per beat rather than one for the
    // whole script, because each beat needs its own measured duration to size
    // its video segment — a single track would have to be split again on
    // silence, which is guesswork.
    //
    // Mock renders never synthesize: staying free of API spend is the whole
    // reason mock exists, so a mock render still runs on the character-count
    // estimate and comes out silent.
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    const spokenAudio: ({ path: string; durationSeconds: number } | null)[] = narration.map(() => null);

    if (!mock) {
      await setProgress(db, project.id, "synthesizing_narration", 0, narration.length);
      for (const [i, segment] of narration.entries()) {
        const result = await synthesize({ text: segment.text, voice, signal });
        const rawPath = path.join(workDir, `narration-${i}-raw.wav`);
        await writeFile(rawPath, result.audio);
        const wavPath = path.join(workDir, `narration-${i}.wav`);
        const trimmed = await trimToSpeech(rawPath, wavPath, result.durationSeconds, signal);
        spokenAudio[i] = { path: trimmed.path, durationSeconds: trimmed.durationSeconds };
        await setProgress(db, project.id, "synthesizing_narration", i + 1, narration.length);
      }
      console.log(
        `[MovieRecapRender] project=${project.id} synthesized ${narration.length} narration beats with ${voice.providerId}:${voice.id}.`
      );
    }

    // 5. Hybrid duration matching against the MEASURED narration length (the
    // estimate only stands in for a mock render, which has no audio).
    // A real render already downloaded the source; a mock one never does, so it
    // clips straight from the URL.
    const sourceForClips = mock ? project.sourceUrl! : path.join(workDir, "source.mp4");
    // Framing and the copyright-free transform both live in
    // lib/movie-recap-transform.ts; the same chain is used for every shot.
    const vf = buildShotFilter(shotFilterContext(project));
    const segmentPaths: string[] = [];
    // The length each BEAT was rendered to, reused below to pad that beat's
    // narration clip onto the same timeline. One entry per beat, not per shot:
    // a beat's shots share its single line of speech.
    const beatDurations: number[] = [];
    const cues: { start: number; end: number; text: string }[] = [];
    // How each shot actually came out, handed back to the caller so the browser
    // can keep a history of generations. `padS` is the one that matters: it is
    // seconds with no footage behind them, which the render fills by holding a
    // frame, and a silent version of it shipped once.
    const shotLog: MovieRecapRenderShot[] = [];
    let lastSourceEndS: number | null = null;
    let cursor = 0;

    for (const [i, segment] of narration.entries()) {
      // Subtitles decide the beat's length, not the other way round: split the
      // line into cues, give each one enough time to be read, and take the
      // total as this beat's target. It is never below MIN_SEGMENT_S.
      const chunks = mock ? [segment.text] : splitIntoCaptionChunks(segment.text);
      const spokenS = spokenAudio[i]?.durationSeconds ?? estimateSpokenSeconds(segment.text);
      const timed = timeCaptionChunks(chunks, spokenS, pacing.maxSegmentS);
      // timeCaptionChunks caps a beat at `pacing.maxSegmentS`, which was the right
      // call against an estimate but would now cut real speech off mid-word.
      // Measured audio wins (history/movie-recap.md: "narration audio duration
      // is authoritative"); the cues stretch with it so captions stay on the
      // words being spoken instead of finishing early.
      const stretch = spokenAudio[i] && spokenS > timed.segmentS ? spokenS / timed.segmentS : 1;
      const cueDurations = stretch === 1 ? timed.durations : timed.durations.map((value) => value * stretch);
      // One deliberate breath per beat, now that the clip carries no silence of
      // its own. The last beat gets none — a recap should not end on dead air.
      const gapS = !mock && spokenAudio[i] && i < narration.length - 1 ? BEAT_GAP_S : 0;
      const targetS = timed.segmentS * stretch + gapS;

      // Everything about which footage this beat plays — borrowing unused
      // scenes, how many cuts it gets, and keeping any run of source under
      // MAX_CONTINUOUS_SOURCE_S — is decided in lib/movie-recap-shots.ts.
      // The speed callback has to be the SAME call the segment loop makes
      // below, or the planner measures continuity against a speed the render
      // does not use.
      const speedFor = project.copyrightFree
        ? (shotIndex: number) => pickShotSpeed(MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds, project.id, i, shotIndex)
        : undefined;
      const plan = planBeat({
        pacing,
        shots: segment.shots,
        spares: spareScenes,
        targetS,
        speedFor,
        cuts: sourceCuts,
        motion: sourceMotion,
      });
      spareScenes = spareScenes.filter((_, index) => !plan.sparesUsed.includes(index));
      const { shots, slotS, shotCount } = plan;
      if (plan.warning) console.warn(`[MovieRecapRender] project=${project.id} beat=${i + 1} ${plan.warning}`);
      console.log(
        `[MovieRecapRender] project=${project.id} beat=${i + 1} ${targetS.toFixed(2)}s -> ${shotCount} shot(s) of ${slotS.toFixed(2)}s ` +
          `(borrowed ${plan.sparesUsed.length}).`
      );

      for (const [shotIndex, shot] of shots.entries()) {
        const sourceDurationS = Math.max(0.05, shot.sourceEndS - shot.sourceStartS);
        const ratio = slotS / sourceDurationS;

        if (ratio < EXTREME_RATIO_MIN || ratio > EXTREME_RATIO_MAX) {
          console.warn(
            `[MovieRecapRender] project=${project.id} beat=${i + 1} shot=${shotIndex + 1} extreme duration mismatch (ratio=${ratio.toFixed(2)}) — a real re-cut would fit better than freeze/trim, but re-cut is out of scope for this phase.`
          );
        }

        const segPath = path.join(workDir, `seg-${i}-${shotIndex}.mp4`);

        if (project.copyrightFree) {
          // Speed is an INPUT here, not something derived from how long the shot
          // has to last. Pick a speed that is never 1.0, then take `slot * speed`
          // seconds of source and play them at that speed: the output is still
          // exactly `slot` long, so nothing downstream moves and the narration
          // stays aligned. This is why the transform can change every shot's
          // speed without touching the planner.
          const speed = pickShotSpeed(MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds, project.id, i, shotIndex);
          const takenS = Math.min(slotS * speed, sourceDurationS);
          // `-ss`/`-t` BEFORE `-i` — input-side seeking. As output options they
          // are applied AFTER the filter chain, so `setpts` has already re-timed
          // the stream and the window means something else entirely (measured:
          // a 1.4s slot came out 1.30s and 1.47s at two different speeds).
          //
          // Then `tpad` holds the last frame — covering both a scene shorter than
          // the window and the frame of rounding a speed change leaves — and the
          // output-side `-t` cuts back to exactly the slot. Belt and braces, but
          // the alternative is audio drifting away from the picture.
          const filters = segmentFilters(vf, `setpts=PTS/${speed.toFixed(4)}`, `tpad=stop_mode=clone:stop_duration=${(slotS + 0.2).toFixed(3)}`);
          await run(
            FFMPEG,
            ["-y", "-ss", shot.sourceStartS.toFixed(3), "-t", takenS.toFixed(3), "-i", sourceForClips, "-an",
             "-vf", filters, "-t", slotS.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p", segPath],
            signal
          );
          segmentPaths.push(segPath);
          shotLog.push({
            beat: i + 1,
            shot: shotIndex + 1,
            slotS: round2(slotS),
            sourceStartS: round2(shot.sourceStartS),
            sourceEndS: round2(shot.sourceStartS + takenS),
            sourceS: round2(takenS),
            padS: round2(Math.max(0, slotS - takenS / speed)),
            speed,
            skipS: lastSourceEndS === null ? null : round2(shot.sourceStartS - lastSourceEndS),
          });
          lastSourceEndS = shot.sourceStartS + takenS;
          continue;
        }

        const args = ["-y", "-i", sourceForClips, "-ss", String(shot.sourceStartS), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"];

        // How much ORIGINAL footage this shot ends up showing, which is not its
        // slot: the three branches below each use a different amount.
        let usedS = sourceDurationS;

        if (ratio >= SPEED_RAMP_MIN && ratio <= SPEED_RAMP_MAX) {
          // Speed-ramp: stretch/compress playback so the clip's own length becomes its slot.
          args.push("-to", String(shot.sourceEndS), "-vf", segmentFilters(vf, `setpts=PTS*${ratio.toFixed(4)}`));
        } else if (slotS < sourceDurationS) {
          // Trim: the scene runs longer than its slot, so cut it down. The slot
          // is never below MIN_SHOT_S, so a trim cannot produce a flash frame.
          args.push("-to", String(shot.sourceStartS + slotS), "-vf", segmentFilters(vf));
          usedS = slotS;
        } else {
          // Freeze-pad: the slot outlasts the scene, hold the last frame.
          const padS = slotS - sourceDurationS;
          args.push("-to", String(shot.sourceEndS), "-vf", segmentFilters(vf, `tpad=stop_mode=clone:stop_duration=${padS.toFixed(3)}`));
        }
        args.push(segPath);
        await run(FFMPEG, args, signal);
        segmentPaths.push(segPath);
        // Only the freeze branch leaves the slot unfilled; a ramp plays the whole
        // scene over the slot, and a trim has footage to spare.
        const padS = ratio > SPEED_RAMP_MAX && slotS > sourceDurationS ? slotS - sourceDurationS : 0;
        shotLog.push({
          beat: i + 1,
          shot: shotIndex + 1,
          slotS: round2(slotS),
          sourceStartS: round2(shot.sourceStartS),
          sourceEndS: round2(shot.sourceStartS + usedS),
          sourceS: round2(usedS),
          padS: round2(padS),
          speed: null,
          skipS: lastSourceEndS === null ? null : round2(shot.sourceStartS - lastSourceEndS),
        });
        lastSourceEndS = shot.sourceStartS + usedS;
      }
      beatDurations.push(slotS * shotCount);

      await setProgress(db, project.id, "rendering_segments", i + 1, narration.length);

      // CAPTIONS ARE CUT WITH THE PICTURE. The chunks above sized the beat, but
      // their boundaries had nothing to do with the cuts, so one caption could
      // sit across two or three shots — which is what made a long beat read as a
      // wall of text rather than as narration moving with the edit.
      //
      // So the line is re-divided into as many pieces as the beat has shots, and
      // each cue is held for exactly its shot. A mock line is deliberately left
      // whole, so the burned caption is the same words the step-3 preview shows.
      if (mock) {
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const chunkS = cueDurations[chunkIndex];
          cues.push({ start: cursor, end: cursor + chunkS, text: chunk });
          cursor += chunkS;
        }
      } else {
        // May come back shorter than `shotCount` — a line with fewer words than
        // cuts cannot be divided that finely, so the longest pieces take the
        // extra shots instead.
        const aligned = splitIntoNChunks(segment.text, shotCount);
        const spread = spreadCuesOverShots(aligned, shotCount);
        for (const [chunkIndex, chunk] of aligned.entries()) {
          const heldS = slotS * spread[chunkIndex];
          cues.push({ start: cursor, end: cursor + heldS, text: chunk });
          cursor += heldS;
        }
      }
    }

    // Concat every segment into the final no-audio recap video.
    await setProgress(db, project.id, "concatenating");
    const listPath = path.join(workDir, "concat.txt");
    await writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join("\n"));
    const concatPath = path.join(workDir, "concat.mp4");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath], signal);

    // The narration track, built on the same timeline as the video: each clip
    // padded with silence out to the length of its BEAT — the sum of that beat's
    // shots — so beat N's speech starts exactly when beat N's first shot does
    // and keeps playing across its cuts. Beats were already sized to fit their
    // audio, so padding never truncates.
    let narrationPath: string | null = null;
    if (spokenAudio.some(Boolean)) {
      const trackParts: string[] = [];
      for (const [i, clip] of spokenAudio.entries()) {
        const slotS = beatDurations[i];
        const partPath = path.join(workDir, `track-${i}.wav`);
        const args = clip
          ? ["-y", "-i", clip.path, "-af", "apad"]
          : ["-y", "-f", "lavfi", "-i", `anullsrc=r=${NARRATION_SAMPLE_RATE}:cl=mono`];
        await run(
          FFMPEG,
          [...args, "-t", slotS.toFixed(3), "-ar", String(NARRATION_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", partPath],
          signal
        );
        trackParts.push(partPath);
      }
      const trackListPath = path.join(workDir, "narration.txt");
      await writeFile(trackListPath, trackParts.map((p) => `file '${p}'`).join("\n"));
      narrationPath = path.join(workDir, "narration.wav");
      await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", trackListPath, "-c", "copy", narrationPath], signal);
    }

    // 6. Burn in blur, subtitles, and logo — one final pass on the whole video.
    // Subtitles always burn in: styled-and-burned is the only mode (see
    // history/movie-recap.md), so there is nothing to branch on.
    let outputPath = concatPath;
    const assPath = path.join(workDir, "subtitles.ass");
    await writeFile(assPath, buildAss(project, cues), "utf-8");
    {
      await setProgress(db, project.id, "applying_overlays");
      outputPath = path.join(workDir, "output.mp4");
      const inputs = ["-i", concatPath];
      // buildOverlayFilter only ever names inputs 0 and 1, so the narration
      // track goes last and its index depends on whether a logo was added.
      if (project.logoEnabled && project.logoUrl) inputs.push("-i", project.logoUrl);
      const narrationIndex = narrationPath ? inputs.length / 2 : null;
      if (narrationPath) inputs.push("-i", narrationPath);
      const audioArgs =
        narrationIndex === null
          ? ["-an"]
          : ["-map", `${narrationIndex}:a`, "-c:a", "aac", "-b:a", "128k", "-shortest"];
      await run(FFMPEG, ["-y", ...inputs, "-filter_complex", buildOverlayFilter(project, assPath), "-map", "[vout]", ...audioArgs, "-c:v", "libx264", "-pix_fmt", "yuv420p", outputPath], signal);
    }

    await setProgress(db, project.id, "uploading");
    const outputBuffer = await readFile(outputPath);
    const outputKey = movieRecapObjectKey(project.id, "render", `recap-${project.id}.mp4`);
    const outputUrl = await putObject(outputKey, outputBuffer, "video/mp4");

    // Hook titles last, from the narration this render just wrote. It runs after
    // the upload on purpose: the video is the deliverable, and a GPT call that
    // fails must not cost the user a render that already succeeded. A mock
    // render uses canned titles, like its canned narration, so it spends nothing.
    await setProgress(db, project.id, "writing_hook_titles");
    // null means "leave the column alone" — a failed call must not blank the
    // titles a previous render produced, since the only way to get titles is to
    // render again.
    let hookTitles: string[] | null = null;
    if (mock) {
      hookTitles = [...MOVIE_RECAP_MOCK_HOOK_TITLES];
    } else {
      try {
        hookTitles = await generateMovieRecapHookTitles(narration, signal);
      } catch (error) {
        // A cancel is not a title failure — let it fail the render like any
        // other aborted step, or "Cancel" would report a finished video.
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      }
    }

    await db
      .from("movie_recap_projects")
      .update({
        render_status: "done",
        render_error: null,
        render_transcript: mock ? null : transcript,
        render_script: narration satisfies MovieRecapNarrationSegment[],
        render_output_url: outputUrl,
        render_output_object_key: outputKey,
        ...(hookTitles ? { hook_titles: hookTitles } : {}),
        render_stage: null,
        render_progress_current: null,
        render_progress_total: null,
        render_completed_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    return {
      createdAt: new Date().toISOString(),
      mock,
      durationS: round2(beatDurations.reduce((total, value) => total + value, 0)),
      beats: narration.length,
      shots: shotLog,
      padS: round2(shotLog.reduce((total, entry) => total + entry.padS, 0)),
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
