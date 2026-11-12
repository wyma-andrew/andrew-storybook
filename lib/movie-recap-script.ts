import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectContentCrop } from "./movie-recap-crop";
import { downloadMovieRecapSource } from "./movie-recap-source-download";
import { parseTimestampedBlocks } from "./movie-recap-manual-script";
import { mapConcurrent } from "./map-concurrent";
import {
  ensureNarrationMaster,
  narrationClip,
  narrationMasterObjectKeys,
  replaceNarrationMasterBeat,
} from "./movie-recap-narration";
import { trimFailureMessage } from "./movie-recap";
import { deleteObject, movieRecapObjectKey, putObject } from "./r2";
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

function narrationTimelineRates() {
  return {
    videoSpeed: MOVIE_RECAP_PLAYBACK_SPEED,
    narrationRate: MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  };
}

function savedRawDuration(beat: MovieRecapNarrationSegment) {
  if (beat.rawAudioS && beat.rawAudioS > 0) return beat.rawAudioS;
  if (beat.audioS && beat.audioS > 0 && beat.narrationRate && beat.narrationRate > 0) {
    return beat.audioS * beat.narrationRate;
  }
  return undefined;
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
// `revoice` keeps the beats as they are — text, edits, footage — and only speaks
// them again with the project's current voice. For a voice change; Resync is the
// path that rebuilds beats from the story.
export async function runMovieRecapScript(db: Db, project: MovieRecapProject, { revoice = false }: { revoice?: boolean } = {}) {
  const controller = new AbortController();
  activeScriptRuns.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-script-"));

  try {
    let narration: MovieRecapNarrationSegment[];
    let analysisKey = project.renderAnalysisKey;
    if (revoice) {
      if (!project.renderScript?.length) throw new Error("There is no script to re-voice yet. Build it first.");
      narration = project.renderScript.map((beat) => ({ ...beat, audioStale: undefined }));
    } else {
      const blocks = parseTimestampedBlocks(project.transcriptStory ?? "", project.sourceDurationSeconds);
      if (!blocks.length) {
        throw new Error("Add the Burmese story, with its timestamps, at the Transcript step first.");
      }

      await setStage(db, project.id, "downloading_source");
      const sourcePath = path.join(workDir, "source.mp4");
      await downloadMovieRecapSource(project, sourcePath, {
        signal,
        report: (done, total) => setStage(db, project.id, "downloading_source", done, total),
      });

      const crop = await detectContentCrop(sourcePath, project.sourceDurationSeconds, signal).catch(() => null);
      if (crop) {
        console.log(
          `[MovieRecapScript] project=${project.id} source carries letterbox — picture is ${crop.width}x${crop.height} at ${crop.x},${crop.y}`
        );
      }

      await setStage(db, project.id, "writing_script", 0, blocks.length);
      if (signal.aborted || await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      narration = blocks.map((block, blockIndex) => ({
        shots: [{ sourceStartS: block.startS, sourceEndS: block.endS }],
        text: block.text,
        originalText: block.text,
        blockIndex,
        blockStartS: block.startS,
        blockEndS: block.endS,
      }));
      if (signal.aborted || await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      await setStage(db, project.id, "writing_script", blocks.length, blocks.length);
      const analysis: MovieRecapRenderAnalysis = { crop };
      analysisKey = movieRecapObjectKey(project.id, "analysis", "analysis.json");
      await putObject(analysisKey, Buffer.from(JSON.stringify(analysis)), "application/json");
    }

    // Narration is the master timeline. Speak each beat once, keep the
    // content-addressed clips, then save a combined narration.wav and its beat
    // boundaries. Picture selection is not moved to make the words fit.
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    await setStage(db, project.id, "synthesizing_narration", 0, narration.length);
    let cacheHits = 0;
    const narrationClips = [];
    for (const [i, beat] of narration.entries()) {
      if (signal.aborted || await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      const clip = await narrationClip({ projectId: project.id, voice, text: beat.text, slot: i, workDir, signal });
      narrationClips.push(clip);
      if (clip.cached) cacheHits++;
      beat.rawAudioS = clip.durationSeconds;
      await setStage(db, project.id, "synthesizing_narration", i + 1, narration.length);
    }
    const rates = narrationTimelineRates();
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
      `[MovieRecapScript] project=${project.id} ${revoice ? "re-voiced" : "built"} ` +
        `${narration.length} beat(s); ${cacheHits} clip(s) from cache.`
    );

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
    let updated = script.map((entry, i) => (i === index ? { ...entry, text, audioStale: !measure } : entry));
    let supersededMaster: { audioKey: string; timingKey: string } | null = null;
    if (measure && workDir) {
      const voice = resolveMovieRecapVoice(project.voiceProfileId);
      const replacementClip = await narrationClip({
        projectId: project.id,
        voice,
        text,
        slot: `beat-${index}`,
        workDir,
      });
      const rates = narrationTimelineRates();
      const replacedMaster = await replaceNarrationMasterBeat({
        projectId: project.id,
        voice,
        previousTexts: script.map((entry) => entry.text),
        nextTexts: updated.map((entry) => entry.text),
        beatIndex: index,
        replacementClip,
        workDir,
        previousPlaybackRate: beat.narrationRate,
        playbackRate: rates.narrationRate,
      });
      let master: Awaited<ReturnType<typeof ensureNarrationMaster>> | null = replacedMaster;
      let rawDurations = updated.map(savedRawDuration);
      rawDurations[index] = replacementClip.durationSeconds;

      if (!master) {
        const clips = await mapConcurrent(updated, 6, (entry, i) => i === index
          ? Promise.resolve(replacementClip)
          : narrationClip({
              projectId: project.id,
              voice,
              text: entry.text,
              slot: `beat-master-${i}`,
              workDir,
              knownDurationSeconds: rawDurations[i],
            }));
        rawDurations = clips.map((clip) => clip.durationSeconds);
        master = await ensureNarrationMaster({
          projectId: project.id,
          voice,
          texts: updated.map((entry) => entry.text),
          workDir,
          clips,
          playbackRate: rates.narrationRate,
        });
      }
      supersededMaster = replacedMaster?.previousKeys ?? narrationMasterObjectKeys(
        project.id,
        voice,
        script.map((entry) => entry.text),
        beat.narrationRate ?? rates.narrationRate
      );
      updated = updated.map((entry, i) => ({
        ...entry,
        rawAudioS: rawDurations[i],
        audioS: round2(master.timings[i].durationS),
        narrationRate: rates.narrationRate,
        videoSpeed: rates.videoSpeed,
        ...(i === index ? { audioStale: false } : {}),
      }));
    }
    const { error } = await db
      .from("movie_recap_projects")
      .update({ render_script: updated satisfies MovieRecapNarrationSegment[] })
      .eq("id", project.id);
    if (error) throw new Error(error.message);

    if (supersededMaster) {
      const voice = resolveMovieRecapVoice(project.voiceProfileId);
      const currentMaster = narrationMasterObjectKeys(
        project.id,
        voice,
        updated.map((entry) => entry.text),
        MOVIE_RECAP_NARRATION_PLAYBACK_RATE
      );
      const obsoleteKeys = [supersededMaster.timingKey];
      if (supersededMaster.audioKey !== project.renderAudioObjectKey) obsoleteKeys.push(supersededMaster.audioKey);
      await Promise.allSettled(
        obsoleteKeys
          .filter((key) => key !== currentMaster.audioKey && key !== currentMaster.timingKey)
          .map(deleteObject)
      );
    }
    return updated;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}
