import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapScene } from "@/lib/api/map";
import { tiptapToText, tiptapVoiceOvers } from "@/lib/tiptap-text";
import { assignVoiceOvers, regenerateSceneShots } from "@/lib/openai";
import { isRegion, DEFAULT_REGION } from "@/lib/constants/regions";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import { resolveVoiceOverAssignments } from "@/lib/voice-over";
import { resolveMotionMode } from "@/lib/motion";
import { resolveShotScale } from "@/lib/constants/shot-scales";
import { resolveStoryFormat } from "@/lib/constants/story-formats";
import { formatSiteMap, parseSiteMap } from "@/lib/site-map";
import { resolveCoverageMode } from "@/lib/constants/coverage-modes";

type StoredShot = {
  id: string;
  index: number;
  duration_s: number | null;
  beat: string | null;
  start_state: string | null;
  end_state: string | null;
};
type StoredScene = { id: string; index: number; title: string | null; slug: string | null; shots: StoredShot[] };

// Re-shoots one scene without touching the rest of the storyboard. Narration is
// remapped across the whole chapter afterwards, because Voice Over ranges are
// chapter-ordered and may start or end inside the scene being replaced.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sceneId } = await params;
  const db = await supabaseRoute();
  // Body is optional — an older client, or a plain retry, regenerates at the
  // default mode ("same coverage").
  const body = await req.json().catch(() => null);
  const coverageMode = resolveCoverageMode((body as { coverageMode?: unknown } | null)?.coverageMode);

  const { data: scene, error: sceneErr } = await db
    .from("scenes")
    .select("id, chapter_id, index, title, slug, lighting")
    .eq("id", sceneId)
    .single();
  if (sceneErr) return NextResponse.json({ error: sceneErr.message }, { status: 404 });
  const chapterId = scene.chapter_id as string;

  const { data: chapter, error: chErr } = await db
    .from("chapters")
    .select("id, story_id, script, aspect_ratio, site_map")
    .eq("id", chapterId)
    .single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) {
    return NextResponse.json({ error: "Script is empty — write something first." }, { status: 400 });
  }

  const [{ data: assets, error: aErr }, { data: story, error: stErr }, { data: sceneRows, error: allErr }] =
    await Promise.all([
      db.from("chapter_assets").select("kind, name, meta, real_prompt").eq("chapter_id", chapterId),
      db
        .from("stories")
        .select("visual_style_id, aspect_ratio, region, motion_style_id, format")
        .eq("id", chapter.story_id)
        .single(),
      db
        .from("scenes")
        .select("id, index, title, slug, shots(id, index, duration_s, beat, start_state, end_state)")
        .eq("chapter_id", chapterId)
        .order("index"),
    ]);
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });

  const storedScenes: StoredScene[] = (sceneRows ?? []).map((row) => ({
    id: row.id as string,
    index: row.index as number,
    title: (row.title as string) ?? null,
    slug: (row.slug as string) ?? null,
    shots: (((row.shots as StoredShot[]) ?? []) as StoredShot[]).slice().sort((a, b) => a.index - b.index),
  }));
  const targetPosition = storedScenes.findIndex((s) => s.id === sceneId);
  if (targetPosition === -1) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  const region = isRegion(story?.region) ? story.region : DEFAULT_REGION;
  const styleContext = resolveStyleContext(region, story?.visual_style_id);
  const assetContext = (assets ?? [])
    .map(
      (a) =>
        `${a.kind === "character" ? "Character" : a.kind === "location" ? "Location" : "Prop"} — ${a.name} (${a.meta}): ${a.real_prompt}`
    )
    .join("\n");
  const aspectRatio = chapter.aspect_ratio ?? story?.aspect_ratio;
  const motionStyleId = (story?.motion_style_id as string | null) ?? null;
  const format = resolveStoryFormat(story?.format);

  // Chapter geography comes from the full storyboard pass that produced these
  // scenes; this pass never re-derives it from one scene's slice of the script.
  const storedSiteMap = parseSiteMap(chapter.site_map);

  const previousScene = storedScenes[targetPosition - 1];
  const nextScene = storedScenes[targetPosition + 1];
  const shots = await regenerateSceneShots(
    scriptText,
    assetContext,
    {
      index: scene.index as number,
      title: (scene.title as string) ?? null,
      slug: (scene.slug as string) ?? null,
      previousEndState: previousScene?.shots.at(-1)?.end_state ?? null,
      nextStartState: nextScene?.shots[0]?.start_state ?? null,
      siteMap: storedSiteMap ? formatSiteMap(storedSiteMap) : null,
      lighting: (scene.lighting as string) ?? null,
      previousShotCount: storedScenes[targetPosition].shots.length || null,
      coverageMode,
    },
    styleContext,
    aspectRatio,
    region,
    motionStyleId,
    format
  );
  if (!shots.length) {
    return NextResponse.json({ error: "The model returned no shots for this scene." }, { status: 502 });
  }

  // Narration is remapped over the chapter's projected shot list — the stored
  // scenes with this one's shots swapped for the new ones. Validate before any
  // delete, so a bad mapping cannot destroy the existing storyboard.
  const voiceOverSources = tiptapVoiceOvers(chapter.script).map((text, index) => ({
    sourceIndex: index + 1,
    text,
  }));
  const projected = storedScenes.map((s, i) =>
    i === targetPosition
      ? { shots: shots.map((sh) => ({ durationS: sh.durationS, beat: sh.beat })) }
      : { shots: s.shots.map((sh) => ({ durationS: sh.duration_s ?? 1, beat: sh.beat })) }
  );
  const shotCoordinates = projected.flatMap((s, sceneOffset) =>
    s.shots.map((sh, shotOffset) => ({
      sceneIndex: sceneOffset + 1,
      shotIndex: shotOffset + 1,
      durationS: Math.min(Math.max(sh.durationS, 1), 10),
    }))
  );

  let voiceOverAssignments: ReturnType<typeof resolveVoiceOverAssignments> = [];
  if (voiceOverSources.length) {
    try {
      const generatedAssignments = await assignVoiceOvers(voiceOverSources, projected);
      voiceOverAssignments = resolveVoiceOverAssignments(voiceOverSources, generatedAssignments, shotCoordinates);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not map Voice Over narration to shots." },
        { status: 502 }
      );
    }
  }

  // Deleting this scene's shots cascades away every narration segment anchored
  // in it, so the chapter's segments are rewritten wholesale from the new
  // mapping — local narration text overrides are discarded, as on a full
  // storyboard regeneration.
  const { error: delShotsErr } = await db.from("shots").delete().eq("scene_id", sceneId);
  if (delShotsErr) return NextResponse.json({ error: delShotsErr.message }, { status: 500 });
  const { error: delVoErr } = await db.from("voice_over_segments").delete().eq("chapter_id", chapterId);
  if (delVoErr) return NextResponse.json({ error: delVoErr.message }, { status: 500 });

  const shotRows = shots.map((sh, j) => ({
    scene_id: sceneId,
    index: j + 1,
    label: sh.label,
    beat: sh.beat,
    duration_s: Math.min(Math.max(sh.durationS, 1), 10), // same hard cap as full generation
    aspect: sh.aspect,
    camera: sh.camera,
    shot_scale: resolveShotScale(sh.shotScale),
    motion_mode: resolveMotionMode(sh.motionMode, sh.videoPrompt, motionStyleId),
    prompt: sh.prompt,
    video_prompt: sh.videoPrompt,
    sound_prompt: sh.soundPrompt || null,
    assets_used: sh.assetsUsed,
    start_state: sh.startState,
    end_state: sh.endState,
  }));
  const { error: insErr } = await db.from("shots").insert(shotRows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { data: finalScenes, error: fErr } = await db
    .from("scenes")
    .select("*, shots(*)")
    .eq("chapter_id", chapterId)
    .order("index");
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  const mapped = finalScenes.map(mapScene);

  if (voiceOverAssignments.length) {
    const shotIds = new Map<string, string>();
    mapped.forEach((s, sceneOffset) =>
      s.shots.forEach((sh, shotOffset) => shotIds.set(`${sceneOffset + 1}.${shotOffset + 1}`, sh.id))
    );
    const sourceText = new Map(voiceOverSources.map((source) => [source.sourceIndex, source.text]));
    const rows = voiceOverAssignments.map((assignment) => ({
      chapter_id: chapterId,
      source_index: assignment.sourceIndex,
      text: sourceText.get(assignment.sourceIndex)!,
      start_shot_id: shotIds.get(`${assignment.startSceneIndex}.${assignment.startShotIndex}`)!,
      end_shot_id: shotIds.get(`${assignment.endSceneIndex}.${assignment.endShotIndex}`)!,
    }));
    const { error } = await db.from("voice_over_segments").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db.from("chapters").update({ updated_at: new Date().toISOString() }).eq("id", chapterId);
  return NextResponse.json(mapped);
}
