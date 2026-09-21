import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { detectContentCrop } from "./movie-recap-crop";
import { parseTimestampedBlocks } from "./movie-recap-manual-script";
import { ensureNarrationMaster, narrationClip, narrationPlaybackRateForDuration } from "./movie-recap-narration";
import { trimFailureMessage } from "./movie-recap";
import { movieRecapObjectKey, putObject } from "./r2";
import { resolveMovieRecapVoice } from "./tts/voices";
import {
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_PLAYBACK_SPEED,
} from "./constants/movie-recap";
import type {
  MovieRecapNarrationSegment,
  MovieRecapProject,
  MovieRecapRenderAnalysis,
  MovieRecapRenderStage,
} from "./api/types";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// THE SCRIPT RUN: everything a recap needs decided and MEASURED, with nothing
// cut yet.
//
// It parses the user's timestamped narration, assigns consecutive blocks to
// configurable ribbon groups, measures every beat, and prepares the cached
// narration master. Rendering later lays the 3/1 cadence over each group.

const round2 = (value: number) => Number(value.toFixed(2));

function narrationTimelineRates(clips: { durationSeconds: number }[], sourceDurationS: number) {
  return {
    videoSpeed: MOVIE_RECAP_PLAYBACK_SPEED,
    narrationRate: narrationPlaybackRateForDuration(
      clips.map((clip) => clip.durationSeconds),
      sourceDurationS,
      MOVIE_RECAP_NARRATION_PLAYBACK_RATE
    ),
  };
}

// Same reasoning as the render's own map: one script run per project, reachable
// from a separate cancel request, surviving the module reload `next dev` does on
// every save.
const activeScriptRuns: Map<string, AbortController> = ((
  globalThis as { __movieRecapScripts?: Map<string, AbortController> }
).__movieRecapScripts ??= new Map());

export function cancelMovieRecapScript(projectId: string) {
  const controller = activeScriptRuns.get(projectId);
  controller?.abort();
  return Boolean(controller);
}

function setStage(
  db: Db,
  projectId: string,
  stage: MovieRecapRenderStage,
  current: number | null = null,
  total: number | null = null
) {
  return db
    .from("movie_recap_projects")
    .update({ script_stage: stage, script_progress_current: current, script_progress_total: total })
    .eq("id", projectId);
}

// The ROW decides whether this run should still be going, not just the
// AbortController — a cancel that cannot reach this process's controller still
// writes the row, and without this check the run would carry on and then
// overwrite it. Same fix as the render's.
async function cancelledElsewhere(db: Db, projectId: string) {
  const { data } = await db.from("movie_recap_projects").select("script_status").eq("id", projectId).single();
  return Boolean(data) && data!.script_status !== "running";
}

/**
 * Parse the typed story, speak every beat and write the measured script.
 *
 * Writes its own status rather than throwing, so the caller just re-reads the
 * row — same contract as the render.
 */
export async function runMovieRecapScript(db: Db, project: MovieRecapProject) {
  const controller = new AbortController();
  activeScriptRuns.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-script-"));

  try {
    const blocks = parseTimestampedBlocks(project.transcriptStory ?? "", project.sourceDurationSeconds);
    if (!blocks.length) {
      throw new Error("Add the Burmese story, with its timestamps, at the Transcript step first.");
    }

    await setStage(db, project.id, "downloading_source");
    const sourcePath = path.join(workDir, "source.mp4");
    await run(FFMPEG, ["-y", "-i", project.sourceUrl!, "-c", "copy", sourcePath], signal);

    const crop = await detectContentCrop(sourcePath, project.sourceDurationSeconds, signal).catch(() => null);
    if (crop) {
      console.log(
        `[MovieRecapScript] project=${project.id} source carries letterbox — picture is ${crop.width}x${crop.height} at ${crop.x},${crop.y}`
      );
    }

    await setStage(db, project.id, "writing_script", 0, blocks.length);
    const narration: MovieRecapNarrationSegment[] = [];
    for (const [blockIndex, block] of blocks.entries()) {
      if (await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      narration.push({
        shots: [{ sourceStartS: block.startS, sourceEndS: block.endS }],
        text: block.text,
        originalText: block.text,
        blockIndex,
        blockStartS: block.startS,
        blockEndS: block.endS,
      });
      await setStage(db, project.id, "writing_script", blockIndex + 1, blocks.length);
    }

    // Narration is the master timeline. Speak each beat once, keep the
    // content-addressed clips, then save a combined narration.wav and its beat
    // boundaries. Picture selection is not moved to make the words fit.
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    await setStage(db, project.id, "synthesizing_narration", 0, narration.length);
    let cacheHits = 0;
    const narrationClips = [];
    for (const [i, beat] of narration.entries()) {
      if (await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      const clip = await narrationClip({ projectId: project.id, voice, text: beat.text, slot: i, workDir, signal });
      narrationClips.push(clip);
      if (clip.cached) cacheHits++;
      beat.audioS = round2(clip.durationSeconds);
      await setStage(db, project.id, "synthesizing_narration", i + 1, narration.length);
    }
    const rates = narrationTimelineRates(narrationClips, project.sourceDurationSeconds);
    const master = await ensureNarrationMaster({
      projectId: project.id,
      voice,
      texts: narration.map((beat) => beat.text),
      workDir,
      signal,
      clips: narrationClips,
      playbackRate: rates.narrationRate,
    });
    narration.forEach((beat, index) => {
      beat.audioS = round2(master.timings[index].durationS);
      beat.narrationRate = rates.narrationRate;
      beat.videoSpeed = rates.videoSpeed;
    });

    console.log(
      `[MovieRecapScript] project=${project.id} ${blocks.length} timestamp block(s) -> ` +
        `${narration.length} beat(s); ${cacheHits} clip(s) from cache.`
    );

    const analysis: MovieRecapRenderAnalysis = { crop };
    const analysisKey = movieRecapObjectKey(project.id, "analysis", "analysis.json");
    await putObject(analysisKey, Buffer.from(JSON.stringify(analysis)), "application/json");

    await db
      .from("movie_recap_projects")
      .update({
        script_status: "ready",
        script_stage: null,
        script_progress_current: null,
        script_progress_total: null,
        script_error: null,
        render_script: narration satisfies MovieRecapNarrationSegment[],
        render_analysis_key: analysisKey,
      })
      .eq("id", project.id);
    return narration;
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof Error && error.name === "AbortError");
    await db
      .from("movie_recap_projects")
      .update({
        script_status: "failed",
        // The stage stays: it is the only record of WHERE it failed, and the bar
        // marks that step red. The counters go — "scene 12 of 40" means nothing
        // once the run is over.
        script_progress_current: null,
        script_progress_total: null,
        script_error: trimFailureMessage(cancelled ? "Cancelled." : error instanceof Error ? error.message : "The script run failed."),
      })
      .eq("id", project.id);
    return null;
  } finally {
    activeScriptRuns.delete(project.id);
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Speak and measure EVERY beat again, exactly as they stand.
 *
 * Between this and a resync is the whole distinction the script step rests on:
 * this reads the beats, a resync reads the transcript. Nothing here re-detects
 * scenes, re-splits the story or moves a shot — it only answers "does each line
 * still fit its footage", which is the question a stale measurement leaves open.
 *
 * Cheap in practice: a line whose words have not changed is a cache hit, so the
 * TTS calls are the ones saved without re-checking.
 */
export async function remeasureMovieRecapScript(db: Db, project: MovieRecapProject) {
  const controller = new AbortController();
  activeScriptRuns.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-remeasure-"));

  try {
    const script = project.renderScript ?? [];
    if (!script.length) throw new Error("There is no script to check.");
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    const measured: MovieRecapNarrationSegment[] = [];
    const clips = [];

    await setStage(db, project.id, "synthesizing_narration", 0, script.length);
    let cacheHits = 0;
    for (const [i, beat] of script.entries()) {
      if (await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      const clip = await narrationClip({ projectId: project.id, voice, text: beat.text, slot: i, workDir, signal });
      clips.push(clip);
      if (clip.cached) cacheHits++;
      measured.push({ ...beat, audioS: round2(clip.durationSeconds), audioStale: false });
      await setStage(db, project.id, "synthesizing_narration", i + 1, script.length);
    }

    const rates = narrationTimelineRates(clips, project.sourceDurationSeconds);
    const master = await ensureNarrationMaster({
      projectId: project.id,
      voice,
      texts: measured.map((beat) => beat.text),
      workDir,
      signal,
      clips,
      playbackRate: rates.narrationRate,
    });
    measured.forEach((beat, index) => {
      beat.audioS = round2(master.timings[index].durationS);
      beat.narrationRate = rates.narrationRate;
      beat.videoSpeed = rates.videoSpeed;
    });
    console.log(
      `[MovieRecapScript] project=${project.id} re-measured ${measured.length} beat(s); ${cacheHits} from cache.`
    );

    await db
      .from("movie_recap_projects")
      .update({
        script_status: "ready",
        script_stage: null,
        script_progress_current: null,
        script_progress_total: null,
        script_error: null,
        render_script: measured satisfies MovieRecapNarrationSegment[],
      })
      .eq("id", project.id);
    return measured;
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof Error && error.name === "AbortError");
    await db
      .from("movie_recap_projects")
      .update({
        script_status: "failed",
        script_progress_current: null,
        script_progress_total: null,
        script_error: trimFailureMessage(cancelled ? "Cancelled." : error instanceof Error ? error.message : "The check failed."),
      })
      .eq("id", project.id);
    return null;
  } finally {
    activeScriptRuns.delete(project.id);
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Write SEVERAL beats' lines back at once, unmeasured.
 *
 * The other half of the round trip: the overrunning beats go out as one block of
 * text, get shortened somewhere else, and come back together. One write rather
 * than one per beat, because a save reads and rewrites the whole script and a
 * loop of them races itself.
 *
 * Never re-speaks. The beats are marked stale and the summary says so — a
 * re-check afterwards pays for the lines that changed and reads the rest from
 * cache, which is cheaper than measuring each one as it lands.
 */
export async function saveMovieRecapBeats(
  db: Db,
  project: MovieRecapProject,
  edits: { index: number; text: string }[]
) {
  const script = project.renderScript ?? [];
  if (!script.length) throw new Error("There is no script to edit.");
  const byIndex = new Map(edits.map((edit) => [edit.index, edit.text.trim()]));
  const updated = script.map((beat, index) => {
    const text = byIndex.get(index);
    return text && text !== beat.text ? { ...beat, text, audioStale: true } : beat;
  });
  const changed = updated.reduce((total, beat, index) => total + (beat === script[index] ? 0 : 1), 0);
  if (!changed) return { script, changed: 0 };

  await db
    .from("movie_recap_projects")
    .update({ render_script: updated satisfies MovieRecapNarrationSegment[] })
    .eq("id", project.id);
  return { script: updated, changed };
}

/**
 * Write ONE beat's edited line back, optionally re-speaking it to measure it.
 *
 * Deliberately not a whole script run: the scenes, the split and every other
 * beat's audio are unchanged, and re-deriving them would throw away work the
 * user has already checked.
 *
 * `measure: false` is the cheap path — the words are stored and the beat is
 * marked stale, because sometimes an edit plainly cannot move the timing and a
 * TTS call for it is spend for nothing. The stale mark is what stops the old
 * number being read as the new line's.
 *
 */
export async function saveMovieRecapBeat(
  db: Db,
  project: MovieRecapProject,
  index: number,
  text: string,
  { measure }: { measure: boolean }
) {
  const script = project.renderScript ?? [];
  const beat = script[index];
  if (!beat) throw new Error("That beat is not in the saved script.");

  const workDir = measure ? await mkdtemp(path.join(tmpdir(), "movie-recap-beat-")) : null;
  try {
    let patch: Partial<MovieRecapNarrationSegment>;
    let rebuiltClip: Awaited<ReturnType<typeof narrationClip>> | null = null;
    if (workDir) {
      const voice = resolveMovieRecapVoice(project.voiceProfileId);
      rebuiltClip = await narrationClip({ projectId: project.id, voice, text, slot: `beat-${index}`, workDir });
      patch = { audioS: round2(rebuiltClip.durationSeconds), audioStale: false };
    } else {
      patch = { audioStale: true };
    }
    let updated = script.map((entry, i) => (i === index ? { ...entry, text, ...patch } : entry));
    if (measure && workDir) {
      const voice = resolveMovieRecapVoice(project.voiceProfileId);
      const clips: Awaited<ReturnType<typeof narrationClip>>[] = [];
      for (const [i, entry] of updated.entries()) {
        clips.push(
          i === index && rebuiltClip
            ? rebuiltClip
            : await narrationClip({ projectId: project.id, voice, text: entry.text, slot: `beat-master-${i}`, workDir })
        );
      }
      const rates = narrationTimelineRates(clips, project.sourceDurationSeconds);
      const master = await ensureNarrationMaster({
        projectId: project.id,
        voice,
        texts: updated.map((entry) => entry.text),
        workDir,
        clips,
        playbackRate: rates.narrationRate,
      });
      updated = updated.map((entry, i) => ({
        ...entry,
        audioS: round2(master.timings[i].durationS),
        narrationRate: rates.narrationRate,
        videoSpeed: rates.videoSpeed,
        ...(i === index ? { audioStale: false } : {}),
      }));
    }
    await db
      .from("movie_recap_projects")
      .update({ render_script: updated satisfies MovieRecapNarrationSegment[] })
      .eq("id", project.id);
    return updated;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}
