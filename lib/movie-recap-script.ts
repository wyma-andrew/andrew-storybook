import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { splitMovieRecapBeat } from "./openai";
import { describeScenes, detectScenes, extractKeyframes } from "./movie-recap-scenes";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { detectContentCrop } from "./movie-recap-crop";
import { groupBlocks, parseTimestampedBlocks } from "./movie-recap-manual-script";
import { dominantRun, layoutBlockRibbon, scenesInBlock, splitSceneIntoShots } from "./movie-recap-scene-plan";
import { type SourceWindow } from "./movie-recap-shots";
import { resolveSceneTexts, splitIntoSentences } from "./movie-recap-scene-text";
import { ensureNarrationMaster, narrationClip, narrationPlaybackRateForDuration } from "./movie-recap-narration";
import { beatFootageS, trimFailureMessage } from "./movie-recap";
import { movieRecapObjectKey, putObject } from "./r2";
import { resolveMovieRecapVoice } from "./tts/voices";
import {
  MOVIE_RECAP_EDIT,
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_PLAYBACK_SPEED,
  movieRecapPacing,
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
// It exists because the answer to "is this line too long for its shot" is a
// synthesized clip and a stopwatch, and there is no reason to spend an hour of
// ffmpeg before showing it. Reading the source, dividing the story across its
// scenes and speaking every beat takes a couple of minutes; the user then reads
// the overruns, shortens a line and re-checks that one beat. The
// render that follows is ffmpeg alone — every clip it needs is already in the
// cache. See history/movie-recap.md, 2026-09-19.

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
 * Read the source, divide the typed story across its scenes, speak every beat
 * and write the measured script onto the project row.
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
    const pacing = movieRecapPacing(project.aspectRatio);
    // The narration is the Burmese the user typed at the Transcript step, and
    // each block's footage is the source between its own two timestamps — the
    // uploaded video IS the one those stamps were read off, so nothing has to be
    // matched to anything.
    //
    // What the block does NOT decide is where the picture cuts. That is the
    // film's own business, so detection runs, one keyframe per scene is
    // described, and the block's passage is divided across its scenes: a beat is
    // a SCENE, not a whole block.
    //
    // Still parked, still not deleted: generateMovieRecapNarration,
    // readSourceTranscript and dialogueForScene.
    const blocks = parseTimestampedBlocks(project.transcriptStory ?? "", project.sourceDurationSeconds);
    if (!blocks.length) {
      throw new Error("Add the Burmese story, with its timestamps, at the Transcript step first.");
    }

    await setStage(db, project.id, "downloading_source");
    const sourcePath = path.join(workDir, "source.mp4");
    await run(FFMPEG, ["-y", "-i", project.sourceUrl!, "-c", "copy", sourcePath], signal);

    await setStage(db, project.id, "detecting_scenes");
    const detected = await detectScenes(sourcePath, workDir, signal);
    // Films are routinely delivered as 2.39:1 inside a 16:9 file, and those bars
    // are pixels the framing step cannot tell from picture — see
    // lib/movie-recap-crop.ts. Fails soft: a source with no bars, and a
    // detection that goes wrong, both come back null and change nothing.
    const crop = await detectContentCrop(sourcePath, project.sourceDurationSeconds, signal).catch(() => null);
    if (crop) {
      console.log(
        `[MovieRecapScript] project=${project.id} source carries letterbox — picture is ${crop.width}x${crop.height} at ${crop.x},${crop.y}`
      );
    }

    // Which ribbon group each block falls in. The group is what the ribbon lays
    // narration over; the block is still what the words were written against.
    const groupOf = new Map<number, { index: number; startS: number; endS: number }>();
    for (const [index, group] of groupBlocks(blocks).entries()) {
      for (const block of group.blocks) groupOf.set(block, { index, startS: group.startS, endS: group.endS });
    }

    const blockScenes = blocks.map((block) => ({
      block,
      scenes: scenesInBlock(block.startS, block.endS, detected.cuts),
    }));
    const flatScenes = blockScenes.flatMap(({ scenes }) => scenes);

    // ONLY the scenes under a block that will actually be split. The vision pass
    // exists to answer "which sentence belongs on which picture", so a block
    // with one sentence has no question to ask — and a transcript pulled off a
    // video's narration track is one sentence per stamp, which made this a
    // keyframe and a vision call for every scene in the film for nothing.
    let sceneBase = 0;
    const splitScenes: { globalIndex: number; scene: SourceWindow }[] = [];
    for (const { block, scenes } of blockScenes) {
      if (scenes.length > 1 && splitIntoSentences(block.text).length > 1) {
        for (const [offset, scene] of scenes.entries()) splitScenes.push({ globalIndex: sceneBase + offset, scene });
      }
      sceneBase += scenes.length;
    }

    // ONE frame per beat, taken from the longest unbroken stretch inside it. The
    // question this pass answers is "what is this beat about", so the passage can
    // be divided onto the right pictures — not "what happens inside it", which is
    // what several frames were for when a model was writing the narration. A beat
    // that merged short cuts together spans more than one picture, and
    // `dominantRun` is what stops the frame landing on a two-second cutaway.
    await setStage(db, project.id, "extracting_keyframes", 0, splitScenes.length);
    const keyframes = await extractKeyframes(
      FFMPEG,
      sourcePath,
      splitScenes.map(({ scene }) => {
        const run = dominantRun(scene, detected.cuts);
        return { start: run.sourceStartS, end: run.sourceEndS };
      }),
      workDir,
      1,
      signal,
      (done, total) => setStage(db, project.id, "extracting_keyframes", done, total)
    );
    await setStage(db, project.id, "describing_scenes", 0, splitScenes.length);
    // Keyed by position in `splitScenes`, put back on the film's own scene
    // numbering so the split pass below can look a scene up by its index.
    const describedSubset = await describeScenes(keyframes, signal, (done, total) =>
      setStage(db, project.id, "describing_scenes", done, total)
    );
    const described = new Map<number, { visual: string; keyframeFraction: number }>();
    for (const [position, { globalIndex }] of splitScenes.entries()) {
      const entry = describedSubset.get(position);
      if (entry) described.set(globalIndex, entry);
    }

    await setStage(db, project.id, "writing_script", 0, blocks.length);
    const narration: MovieRecapNarrationSegment[] = [];
    let sceneCursor = 0;
    let modelSplits = 0;
    for (const [blockIndex, { block, scenes }] of blockScenes.entries()) {
      if (await cancelledElsewhere(db, project.id)) throw new Error("Cancelled.");
      const indexes = scenes.map((_, offset) => sceneCursor + offset);
      sceneCursor += scenes.length;
      const secondsList = scenes.map((scene) => scene.sourceEndS - scene.sourceStartS);

      // The split pass is a convenience, not a dependency: a model that is down,
      // slow or wrong costs a better break point, never the run. The mechanical
      // split inside resolveSceneTexts is the floor.
      //
      // A one-sentence block is not asked at all. resolveSceneTexts cannot break
      // inside a sentence, so whatever the model answers it gets the same
      // result — and a transcript pulled off a video's narration track is one
      // sentence per stamp, which made this a call per line for nothing.
      let parts: { sceneIndex: number; text: string }[] | null = null;
      if (scenes.length > 1 && splitIntoSentences(block.text).length > 1) {
        try {
          parts = await splitMovieRecapBeat(
            scenes.map((scene, offset) => ({
              index: offset,
              seconds: round2(secondsList[offset]),
              visual: described.get(indexes[offset])?.visual ?? "",
            })),
            block.text,
            signal
          );
        } catch (error) {
          if (signal.aborted) throw error;
          console.warn(`[MovieRecapScript] project=${project.id} block=${blockIndex + 1} split pass failed, using the mechanical split.`);
        }
      }
      const { texts, usedModel } = resolveSceneTexts(block.text, secondsList, parts);
      if (usedModel) modelSplits++;

      for (const [offset, scene] of scenes.entries()) {
        const text = texts[offset]?.trim() ?? "";
        // A scene the passage had nothing to say about carries no beat of its
        // own. Its seconds are not lost: the ribbon below spreads the block's
        // footage across the beats it does have, so they are played by whichever
        // beat needs them.
        if (!text) continue;
        const group = groupOf.get(blockIndex);
        narration.push({
          shots: splitSceneIntoShots(scene, pacing, detected.cuts),
          text,
          originalText: text,
          blockIndex,
          blockStartS: block.startS,
          blockEndS: block.endS,
          groupIndex: group?.index,
          groupStartS: group?.startS,
          groupEndS: group?.endS,
        });
      }
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
      `[MovieRecapScript] project=${project.id} ${blocks.length} block(s) -> ${flatScenes.length} scene(s) ` +
        `(${splitScenes.length} described) -> ` +
        `${narration.length} beat(s); ${modelSplits} split by the model; ${cacheHits} clip(s) from cache.`
    );

    const selected = narration.flatMap((beat) => beat.shots);
    const spares = flatScenes.filter((scene) =>
      !selected.some((shot) =>
        Math.min(scene.sourceEndS, shot.sourceEndS) - Math.max(scene.sourceStartS, shot.sourceStartS) > MOVIE_RECAP_EDIT.minSourceS
      )
    );
    const analysis: MovieRecapRenderAnalysis = { spares, cuts: detected.cuts.map(round2), motion: null, crop };
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
 * Give every beat the footage its line actually needs, group by group.
 *
 * Run after the beats have been measured, and again whenever a measurement
 * changes — the windows depend on the lengths, so a re-spoken line moves the
 * pictures around it. Mutates in place; beats with no span recorded (an older
 * script) are left exactly as they are.
 */
export function layoutNarrationRibbon(
  narration: MovieRecapNarrationSegment[],
  pacing: ReturnType<typeof movieRecapPacing>,
  cuts: number[]
) {
  // Grouped by RIBBON GROUP, falling back to the block for a script built before
  // groups existed — that is what those scripts were laid out with, and relaying
  // them on a wider span would move footage the user already approved.
  const spanOf = (beat: MovieRecapNarrationSegment) =>
    beat.groupIndex !== undefined && beat.groupStartS !== undefined && beat.groupEndS !== undefined
      ? { index: beat.groupIndex, startS: beat.groupStartS, endS: beat.groupEndS }
      : beat.blockIndex !== undefined && beat.blockStartS !== undefined && beat.blockEndS !== undefined
        ? { index: beat.blockIndex, startS: beat.blockStartS, endS: beat.blockEndS }
        : null;

  const byGroup = new Map<number, { startS: number; endS: number; beats: MovieRecapNarrationSegment[] }>();
  for (const beat of narration) {
    const span = spanOf(beat);
    if (!span) continue;
    const open = byGroup.get(span.index);
    if (open) open.beats.push(beat);
    else byGroup.set(span.index, { startS: span.startS, endS: span.endS, beats: [beat] });
  }

  for (const { startS, endS, beats } of byGroup.values()) {
    const { windows } = layoutBlockRibbon({
      blockStartS: startS,
      blockEndS: endS,
      // An unmeasured beat falls back to the footage it already has, so one
      // un-re-checked line cannot collapse the whole block's layout.
      audioS: beats.map((beat) => beat.audioS ?? beatFootageS(beat)),
      anchorS: beats.map((beat) => beat.blockStartS ?? startS),
      cuts,
    });
    for (const [i, beat] of beats.entries()) {
      beat.shots = splitSceneIntoShots(windows[i], pacing, cuts);
    }
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
