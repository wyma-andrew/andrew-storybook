import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generateMovieRecapNarration, openai, type RecapScene, type TranscriptSegment } from "./openai";
import { describeScenes, detectScenes, extractKeyframes } from "./movie-recap-scenes";
import { movieRecapObjectKey, putObject } from "./r2";
import { synthesize } from "./tts/synthesize";
import { resolveMovieRecapVoice } from "./tts/voices";
import {
  movieRecapSubtitleStyle,
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_MOCK_NARRATION,
  MOVIE_RECAP_MOCK_SOURCE_SECONDS,
  MOVIE_RECAP_BLUR,
  MOVIE_RECAP_TARGET_DIMENSIONS,
} from "./constants/movie-recap";
import type { MovieRecapNarrationSegment, MovieRecapProject, MovieRecapRenderStage } from "./api/types";
import type { supabaseRoute } from "./supabase/route";

const execFileAsync = promisify(execFile);

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
const MAX_SEGMENT_S = 3.5;
const ABS_MAX_CUE_CHARS_PER_SECOND = 26;
// Floors, applied after the estimate. A recap beat shorter than this reads as a
// flash cut however well the narration fits it.
const MIN_SEGMENT_S = 2;
// A caption has to survive being read, not just being displayed: never shorter
// than this, and never faster than MAX_CUE_CHARS_PER_SECOND.
const MIN_CUE_S = 1;
const MAX_CUE_CHARS_PER_SECOND = 22;
// Hybrid duration match: within this ratio band, speed-ramp the video segment
// to fit the narration exactly. Outside it, freeze-pad (narration longer) or
// trim (narration shorter) instead of distorting playback speed further.
const SPEED_RAMP_MIN = 0.85;
const SPEED_RAMP_MAX = 1.15;
// Beyond this the mismatch is really a "needs re-cut" case (out of scope for
// this phase — see history) — freeze/trim still applies, just logged as a warning.
const EXTREME_RATIO_MIN = 0.33;
const EXTREME_RATIO_MAX = 3;

const TARGET_DIMENSIONS = MOVIE_RECAP_TARGET_DIMENSIONS;

// Every narration clip is resampled to this before the parts are concatenated —
// the concat demuxer needs one identical format across all of them, and a
// provider is free to return whatever rate it likes.
const NARRATION_SAMPLE_RATE = 24000;

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
function timeCaptionChunks(chunks: string[], segmentS: number) {
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
  if (grown <= MAX_SEGMENT_S) return { durations: wanted, segmentS: grown };

  // Over the cap: squeeze every cue by the same factor, but stop at the
  // absolute reading limit rather than compressing into an unreadable flash.
  const floors = chunks.map((chunk) => chunk.length / ABS_MAX_CUE_CHARS_PER_SECOND);
  const squeezed = wanted.map((value, i) => Math.max(floors[i], value * (MAX_SEGMENT_S / grown)));
  return { durations: squeezed, segmentS: squeezed.reduce((sum, value) => sum + value, 0) };
}

function scaleFilter(project: MovieRecapProject) {
  const [w, h] = TARGET_DIMENSIONS[project.aspectRatio];
  return project.fitMode === "contain"
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
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
    parts.push(`[toBlur]crop=${bw}:${bh}:${bx}:${by},boxblur=${MOVIE_RECAP_BLUR.radius}:${MOVIE_RECAP_BLUR.passes}[blurred]`);
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
  return MOVIE_RECAP_MOCK_NARRATION.map((text, i) => ({
    sourceStartS: Number((i * each).toFixed(3)),
    sourceEndS: Number(((i + 1) * each).toFixed(3)),
    text,
  }));
}

// Dialogue spoken inside a scene's own time range, joined into one string for
// the narration model. A scene with none is an action beat — its visual
// description is the only thing describing it.
function dialogueForScene(transcript: TranscriptSegment[], startS: number, endS: number) {
  return transcript
    .filter((line) => line.end > startS && line.start < endS)
    .map((line) => line.text.trim())
    .join(" ")
    .trim();
}

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
        render_stage: null,
        render_progress_current: null,
        render_progress_total: null,
        render_completed_at: new Date().toISOString(),
      })
      .eq("id", project.id);

  try {
    await db
      .from("movie_recap_projects")
      .update({ render_status: "running", render_is_mock: mock, render_error: null, render_started_at: new Date().toISOString() })
      .eq("id", project.id);

    let transcript: TranscriptSegment[] = [];
    let narration: MovieRecapNarrationSegment[];

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
      const rows = await detectScenes(localSource, workDir, signal);

      // 1b. What each scene LOOKS like — a transcript cannot see an action
      // beat, and those are most of a recap. One keyframe per scene.
      await setProgress(db, project.id, "describing_scenes", 0, rows.length);
      const frames = await extractKeyframes(FFMPEG, localSource, rows, workDir, signal);
      const visuals = await describeScenes(frames, signal, (done, total) =>
        setProgress(db, project.id, "describing_scenes", done, total)
      );

      // 1c. What each scene SOUNDS like.
      await setProgress(db, project.id, "extracting_audio");
      const audioPath = path.join(workDir, "audio.wav");
      await run(FFMPEG, ["-y", "-i", localSource, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audioPath], signal);
      await setProgress(db, project.id, "transcribing");
      const transcription = await openai().audio.transcriptions.create(
        {
          file: createReadStream(audioPath),
          model: "whisper-1",
          response_format: "verbose_json",
        },
        { signal }
      );
      const rawSegments = (transcription as unknown as { segments?: { start: number; end: number; text: string }[] }).segments ?? [];
      transcript = rawSegments.map((s) => ({ start: s.start, end: s.end, text: s.text }));

      const scenes: RecapScene[] = rows.map((row, index) => ({
        index,
        startS: Number(row.start.toFixed(2)),
        endS: Number(row.end.toFixed(2)),
        visual: visuals.get(index) ?? "",
        dialogue: dialogueForScene(transcript, row.start, row.end),
      }));

      // 3. Narration script over the scenes (2. copyright-free video transform
      // is applied per-segment below, alongside the render).
      await setProgress(db, project.id, "writing_script");
      const selected = await generateMovieRecapNarration(scenes, signal);
      // The model returns scene indexes, not timestamps, so every clip lands on
      // a real cut. Out-of-range indexes are dropped rather than clamped — a
      // wrong index means the model lost track, not that it meant the last scene.
      narration = selected
        .filter((line) => scenes[line.sceneIndex] && line.text.trim())
        .sort((a, b) => a.sceneIndex - b.sceneIndex)
        .map((line) => ({
          sourceStartS: scenes[line.sceneIndex].startS,
          sourceEndS: scenes[line.sceneIndex].endS,
          text: line.text.trim(),
        }));
      if (!narration.length) throw new Error("The AI returned no narration segments.");
      console.log(
        `[MovieRecapRender] project=${project.id} ${rows.length} scenes detected, ${transcript.length} transcript lines, ${narration.length} narration beats.`
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
        const wavPath = path.join(workDir, `narration-${i}.wav`);
        await writeFile(wavPath, result.audio);
        spokenAudio[i] = { path: wavPath, durationSeconds: result.durationSeconds };
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
    const vf = scaleFilter(project);
    const segmentPaths: string[] = [];
    // The length each video segment was rendered to, reused below to pad each
    // narration clip onto the same timeline.
    const segmentDurations: number[] = [];
    const cues: { start: number; end: number; text: string }[] = [];
    let cursor = 0;

    for (const [i, segment] of narration.entries()) {
      const sourceDurationS = Math.max(MIN_SEGMENT_S, segment.sourceEndS - segment.sourceStartS);
      // Subtitles decide the beat's length, not the other way round: split the
      // line into cues, give each one enough time to be read, and take the
      // total as this segment's target. It is never below MIN_SEGMENT_S.
      const chunks = mock ? [segment.text] : splitIntoCaptionChunks(segment.text);
      const spokenS = spokenAudio[i]?.durationSeconds ?? estimateSpokenSeconds(segment.text);
      const timed = timeCaptionChunks(chunks, spokenS);
      // timeCaptionChunks caps a beat at MAX_SEGMENT_S, which was the right
      // call against an estimate but would now cut real speech off mid-word.
      // Measured audio wins (history/movie-recap.md: "narration audio duration
      // is authoritative"); the cues stretch with it so captions stay on the
      // words being spoken instead of finishing early.
      const stretch = spokenAudio[i] && spokenS > timed.segmentS ? spokenS / timed.segmentS : 1;
      const cueDurations = stretch === 1 ? timed.durations : timed.durations.map((value) => value * stretch);
      const targetS = timed.segmentS * stretch;
      const ratio = targetS / sourceDurationS;

      if (ratio < EXTREME_RATIO_MIN || ratio > EXTREME_RATIO_MAX) {
        console.warn(
          `[MovieRecapRender] project=${project.id} segment=${i + 1} extreme duration mismatch (ratio=${ratio.toFixed(2)}) — a real re-cut would fit better than freeze/trim, but re-cut is out of scope for this phase.`
        );
      }

      const segPath = path.join(workDir, `seg-${i}.mp4`);
      const args = ["-y", "-i", sourceForClips, "-ss", String(segment.sourceStartS), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"];

      if (ratio >= SPEED_RAMP_MIN && ratio <= SPEED_RAMP_MAX) {
        // Speed-ramp: stretch/compress playback so the clip's own length becomes the estimate.
        args.push("-to", String(segment.sourceEndS), "-vf", `${vf},setpts=PTS*${ratio.toFixed(4)}`);
      } else if (targetS < sourceDurationS) {
        // Trim: the scene runs longer than the narration needs, so cut it down —
        // but targetS already carries the MIN_SEGMENT_S floor and the cues'
        // reading time, so a trim can never produce a flash cut.
        args.push("-to", String(segment.sourceStartS + targetS), "-vf", vf);
      } else {
        // Freeze-pad: the beat needs longer than the scene runs, hold the last frame.
        const padS = targetS - sourceDurationS;
        args.push("-to", String(segment.sourceEndS), "-vf", `${vf},tpad=stop_mode=clone:stop_duration=${padS.toFixed(3)}`);
      }
      args.push(segPath);
      await setProgress(db, project.id, "rendering_segments", i + 1, narration.length);
      await run(FFMPEG, args, signal);
      segmentPaths.push(segPath);
      segmentDurations.push(targetS);

      // Cues were sliced and timed above, before the clip length was chosen —
      // a mock line is deliberately left whole, so the burned caption is the
      // same words the step-3 preview shows.
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkS = cueDurations[chunkIndex];
        cues.push({ start: cursor, end: cursor + chunkS, text: chunk });
        cursor += chunkS;
      }
    }

    // Concat every segment into the final no-audio recap video.
    await setProgress(db, project.id, "concatenating");
    const listPath = path.join(workDir, "concat.txt");
    await writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join("\n"));
    const concatPath = path.join(workDir, "concat.mp4");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath], signal);

    // The narration track, built on the same timeline as the video: each clip
    // padded with silence out to the length its own segment was rendered to, so
    // beat N's speech starts exactly when beat N's picture does. Segments were
    // already sized to fit their audio, so padding never truncates.
    let narrationPath: string | null = null;
    if (spokenAudio.some(Boolean)) {
      const trackParts: string[] = [];
      for (const [i, clip] of spokenAudio.entries()) {
        const slotS = segmentDurations[i];
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

    await db
      .from("movie_recap_projects")
      .update({
        render_status: "done",
        render_error: null,
        render_transcript: mock ? null : transcript,
        render_script: narration satisfies MovieRecapNarrationSegment[],
        render_output_url: outputUrl,
        render_output_object_key: outputKey,
        render_stage: null,
        render_progress_current: null,
        render_progress_total: null,
        render_completed_at: new Date().toISOString(),
      })
      .eq("id", project.id);
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof Error && error.name === "AbortError");
    await markFailed(cancelled ? "Cancelled." : error instanceof Error ? error.message : "Render failed.");
  } finally {
    activeRenders.delete(project.id);
    await rm(workDir, { recursive: true, force: true });
  }
}
