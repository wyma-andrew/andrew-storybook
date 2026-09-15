import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generateMovieRecapNarration, openai, type TranscriptSegment } from "./openai";
import { movieRecapObjectKey, putObject } from "./r2";
import {
  MOVIE_RECAP_LOGO_BOX,
  MOVIE_RECAP_MOCK_NARRATION,
  MOVIE_RECAP_MOCK_SOURCE_SECONDS,
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
// CSS sizes text by em; libass sizes it so the font's ascent+descent fit
// `Fontsize`. Noto Sans Myanmar reserves 2.184em of vertical space for stacked
// Burmese marks, so an ASS Fontsize of N draws glyphs a browser would draw at
// N/2.184 — measured: the same line at nominal 100 is 1243px wide through
// FreeType and 540px through libass. Multiply by the ratio so the percentage
// the wizard shows means the same thing in the preview and in the export.
// For another font: (hhea ascender - descender) / unitsPerEm.
const ASS_FONT_SIZE_RATIO = Number(process.env.MOVIE_RECAP_SUBTITLE_FONT_RATIO) || 2.184;

// Rough Burmese spoken pace, used only to ESTIMATE narration length while the
// real TTS step is skipped (console.log stand-in — see history/movie-recap.md,
// "Phase-two pipeline order and audio/video duration matching"). Swap this
// estimate for the real synthesized-audio duration once TTS is wired up.
const WORDS_PER_SECOND_BURMESE = 2.3;
const MIN_SEGMENT_S = 1;
// Hybrid duration match: within this ratio band, speed-ramp the video segment
// to fit the narration exactly. Outside it, freeze-pad (narration longer) or
// trim (narration shorter) instead of distorting playback speed further.
const SPEED_RAMP_MIN = 0.85;
const SPEED_RAMP_MAX = 1.15;
// Beyond this the mismatch is really a "needs re-cut" case (out of scope for
// this phase — see history) — freeze/trim still applies, just logged as a warning.
const EXTREME_RATIO_MIN = 0.33;
const EXTREME_RATIO_MAX = 3;

const TARGET_DIMENSIONS: Record<MovieRecapProject["aspectRatio"], [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
};

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
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SEGMENT_S, words / WORDS_PER_SECOND_BURMESE);
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
    parts.push(`[toBlur]crop=${bw}:${bh}:${bx}:${by},boxblur=12:2[blurred]`);
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
  // The size the CSS preview uses, in output pixels — the shared meaning of
  // `subtitleFontSize`. Everything else here is derived from it.
  const cssPx = (project.subtitleFontSize / 100) * h;
  const fontSize = Math.round(cssPx * ASS_FONT_SIZE_RATIO);
  const alignment = project.subtitlePosition === "top" ? 8 : project.subtitlePosition === "middle" ? 5 : 2;
  const marginV = project.subtitlePosition === "middle" ? 0 : Math.round((project.subtitleOffset / 100) * h);
  const marginH = Math.round((w * 6) / 100);
  // Matches the CSS pill's 0.35em vertical padding (ASS pads both axes by
  // Outline), against the CSS-equivalent size, not the inflated ASS one.
  const padding = Math.max(2, Math.round(cssPx * 0.35));
  const transparent = "&HFF000000";
  const boxColor = toAssColor(project.subtitleBgColor, project.subtitleBgOpacity);
  const bold = project.subtitleBold ? -1 : 0;
  const common = `${bold},0,0,0,100,100,0,0`;
  const geometry = `${alignment},${marginH},${marginH},${marginV},1`;

  // Two styles, drawn as two layers per cue: layer 0 paints the background box
  // with invisible text (BorderStyle 3, box colour in OutlineColour), layer 1
  // paints the real glyphs on top (BorderStyle 1, no border). Splitting them
  // keeps the box independent of the glyph rendering — and the box layer is
  // skipped entirely at 0% opacity, so nothing is drawn behind the text.
  // (BorderStyle 4 was rejected: it boxes each run separately, so a line
  // renders as overlapping blobs.)
  const styles = [
    `Style: Box,${SUBTITLE_FONT},${fontSize},${transparent},${transparent},${boxColor},${transparent},${common},3,${padding},0,${geometry}`,
    `Style: Text,${SUBTITLE_FONT},${fontSize},${toAssColor(project.subtitleColor)},${toAssColor(project.subtitleColor)},${transparent},${transparent},${common},1,0,0,${geometry}`,
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
    .flatMap((cue) => {
      const text = cue.text.replace(/\r?\n/g, "\\N");
      const timing = `${toAssTimestamp(cue.start)},${toAssTimestamp(cue.end)}`;
      const line = (layer: number, style: string) => `Dialogue: ${layer},${timing},${style},,0,0,0,,${text}`;
      // Skip the box layer entirely at 0% opacity — nothing to paint.
      return project.subtitleBgOpacity > 0 ? [line(0, "Box"), line(1, "Text")] : [line(1, "Text")];
    })
    .join("\n");

  return `${header}\n${events}\n`;
}

// Runs the full phase-two-a pipeline synchronously: read -> copyright-free
// transform -> narration script -> (TTS skipped, logged) -> duration-matched
// render. Writes its own status/result onto the project row rather than
// throwing, so the caller just re-reads the row after this resolves.
// Mock narration: evenly slice the first MOVIE_RECAP_MOCK_SOURCE_SECONDS of
// the source between the canned lines, so a mock render exercises the exact
// same segment/overlay/subtitle code path as a real one.
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
      // Mock render: no Whisper, no GPT, no API spend. Everything after this
      // point is the real pipeline, so framing/logo/subtitle design can be
      // checked for free (see history/movie-recap.md).
      narration = mockNarration(project);
      console.log(`[MovieRecapRender] project=${project.id} MOCK render — AI transcription and narration skipped.`);
    } else {
      // 1. AI reads the video: pull the audio track and transcribe it.
      await setProgress(db, project.id, "extracting_audio");
      const audioPath = path.join(workDir, "audio.wav");
      await run(FFMPEG, ["-y", "-i", project.sourceUrl!, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audioPath], signal);
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
      if (!transcript.length) throw new Error("The source video has no detectable speech to recap.");

      // 3. Narration script from the transcript (2. copyright-free video
      // transform is applied per-segment below, alongside the render).
      await setProgress(db, project.id, "writing_script");
      narration = await generateMovieRecapNarration(transcript, signal);
      if (!narration.length) throw new Error("The AI returned no narration segments.");
    }

    // 4. TTS is skipped this phase — log what would have been synthesized.
    narration.forEach((segment, i) => {
      console.log(
        `[MovieRecapRender] project=${project.id} segment=${i + 1}/${narration.length} TTS skipped, would synthesize: "${segment.text}"`
      );
    });

    // 5. Hybrid duration matching against the estimated narration length.
    const vf = scaleFilter(project);
    const segmentPaths: string[] = [];
    const cues: { start: number; end: number; text: string }[] = [];
    let cursor = 0;

    for (const [i, segment] of narration.entries()) {
      const sourceDurationS = Math.max(MIN_SEGMENT_S, segment.sourceEndS - segment.sourceStartS);
      const estimatedS = estimateSpokenSeconds(segment.text);
      const ratio = estimatedS / sourceDurationS;

      if (ratio < EXTREME_RATIO_MIN || ratio > EXTREME_RATIO_MAX) {
        console.warn(
          `[MovieRecapRender] project=${project.id} segment=${i + 1} extreme duration mismatch (ratio=${ratio.toFixed(2)}) — a real re-cut would fit better than freeze/trim, but re-cut is out of scope for this phase.`
        );
      }

      const segPath = path.join(workDir, `seg-${i}.mp4`);
      const args = ["-y", "-i", project.sourceUrl!, "-ss", String(segment.sourceStartS), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"];

      if (ratio >= SPEED_RAMP_MIN && ratio <= SPEED_RAMP_MAX) {
        // Speed-ramp: stretch/compress playback so the clip's own length becomes the estimate.
        args.push("-to", String(segment.sourceEndS), "-vf", `${vf},setpts=PTS*${ratio.toFixed(4)}`);
      } else if (estimatedS < sourceDurationS) {
        // Trim: narration is shorter than the source beat, cut the clip down to fit.
        args.push("-to", String(segment.sourceStartS + estimatedS), "-vf", vf);
      } else {
        // Freeze-pad: narration is longer, hold the last frame for the difference.
        const padS = estimatedS - sourceDurationS;
        args.push("-to", String(segment.sourceEndS), "-vf", `${vf},tpad=stop_mode=clone:stop_duration=${padS.toFixed(3)}`);
      }
      args.push(segPath);
      await setProgress(db, project.id, "rendering_segments", i + 1, narration.length);
      await run(FFMPEG, args, signal);
      segmentPaths.push(segPath);

      // Split into short caption-sized cues, sharing this segment's duration
      // proportionally so short-line and long-line chunks aren't equal length.
      // A mock line is already exactly one caption — splitting it would put
      // different words on screen than the step-3 preview shows, which is the
      // one thing a mock render exists to let you compare.
      const chunks = mock ? [segment.text] : splitIntoCaptionChunks(segment.text);
      const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      for (const chunk of chunks) {
        const chunkS = totalChars > 0 ? (chunk.length / totalChars) * estimatedS : estimatedS / chunks.length;
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
      if (project.logoEnabled && project.logoUrl) inputs.push("-i", project.logoUrl);
      await run(FFMPEG, ["-y", ...inputs, "-filter_complex", buildOverlayFilter(project, assPath), "-map", "[vout]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", outputPath], signal);
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
