import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapScene } from "@/lib/api/map";
import { tiptapToText, tiptapVoiceOvers } from "@/lib/tiptap-text";
import { assignVoiceOvers, generateStoryboard } from "@/lib/openai";
import { isRegion, DEFAULT_REGION } from "@/lib/constants/regions";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import { resolveVoiceOverAssignments } from "@/lib/voice-over";
import { resolveMotionMode } from "@/lib/motion";
import { resolveShotScale } from "@/lib/constants/shot-scales";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: chapter, error: chErr } = await db
    .from("chapters")
    .select("id, story_id, script, aspect_ratio")
    .eq("id", id)
    .single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) {
    return NextResponse.json({ error: "Script is empty — write something first." }, { status: 400 });
  }

  const [{ data: assets, error: aErr }, { data: story, error: stErr }] = await Promise.all([
    db.from("chapter_assets").select("kind, name, meta, real_prompt").eq("chapter_id", id),
    db.from("stories").select("visual_style_id, aspect_ratio, region, motion_style_id").eq("id", chapter.story_id).single(),
  ]);
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const region = isRegion(story?.region) ? story.region : DEFAULT_REGION;
  const styleContext = resolveStyleContext(region, story?.visual_style_id);

  const assetContext = (assets ?? [])
    .map((a) => `${a.kind === "character" ? "Character" : a.kind === "location" ? "Location" : "Prop"} — ${a.name} (${a.meta}): ${a.real_prompt}`)
    .join("\n");

  const aspectRatio = chapter.aspect_ratio ?? story?.aspect_ratio;
  const motionStyleId = (story?.motion_style_id as string | null) ?? null;
  const { siteMap, scenes } = await generateStoryboard(
    scriptText,
    assetContext,
    styleContext,
    aspectRatio,
    region,
    motionStyleId
  );
  const voiceOverSources = tiptapVoiceOvers(chapter.script).map((text, index) => ({
    sourceIndex: index + 1,
    text,
  }));
  const shotCoordinates = scenes.flatMap((scene, sceneOffset) =>
    scene.shots.map((shot, shotOffset) => ({
      sceneIndex: sceneOffset + 1,
      shotIndex: shotOffset + 1,
      durationS: Math.min(Math.max(shot.durationS, 1), 10),
    }))
  );

  // Complete and validate the second AI pass before deleting the existing
  // storyboard. A bad narration mapping must not destroy usable prior work.
  let voiceOverAssignments: ReturnType<typeof resolveVoiceOverAssignments> = [];
  if (voiceOverSources.length) {
    try {
      const generatedAssignments = await assignVoiceOvers(voiceOverSources, scenes);
      voiceOverAssignments = resolveVoiceOverAssignments(
        voiceOverSources,
        generatedAssignments,
        shotCoordinates
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not map Voice Over narration to shots." },
        { status: 502 }
      );
    }
  }

  const { data: oldScenes, error: oldScenesError } = await db.from("scenes").select("id").eq("chapter_id", id);
  if (oldScenesError) return NextResponse.json({ error: oldScenesError.message }, { status: 500 });
  if (oldScenes?.length) {
    const { error } = await db.from("scenes").delete().eq("chapter_id", id); // cascades to shots + Voice Over
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shotIds = new Map<string, string>();
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const { data: sceneRow, error: sErr } = await db
      .from("scenes")
      .insert({ chapter_id: id, index: i + 1, title: s.title, slug: s.slug, lighting: s.lighting || null })
      .select("id")
      .single();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const shotRows = s.shots.map((sh, j) => ({
      scene_id: sceneRow.id,
      index: j + 1,
      label: sh.label,
      beat: sh.beat,
      duration_s: Math.min(Math.max(sh.durationS, 1), 10), // hard cap: most AI video tools can't export past 10s
      aspect: sh.aspect,
      camera: sh.camera,
      shot_scale: resolveShotScale(sh.shotScale),
      motion_mode: resolveMotionMode(sh.motionMode, sh.videoPrompt, motionStyleId),
      prompt: sh.prompt,
      video_prompt: sh.videoPrompt,
      assets_used: sh.assetsUsed,
      start_state: sh.startState,
      end_state: sh.endState,
    }));
    if (shotRows.length) {
      const { data: insertedShots, error: shErr } = await db.from("shots").insert(shotRows).select("id, index");
      if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 });
      for (const shot of insertedShots) shotIds.set(`${i + 1}.${shot.index}`, shot.id);
    }
  }

  if (voiceOverAssignments.length) {
    const sourceText = new Map(voiceOverSources.map((source) => [source.sourceIndex, source.text]));
    const rows = voiceOverAssignments.map((assignment) => ({
      chapter_id: id,
      source_index: assignment.sourceIndex,
      text: sourceText.get(assignment.sourceIndex)!,
      start_shot_id: shotIds.get(`${assignment.startSceneIndex}.${assignment.startShotIndex}`)!,
      end_shot_id: shotIds.get(`${assignment.endSceneIndex}.${assignment.endShotIndex}`)!,
    }));
    const { error } = await db.from("voice_over_segments").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The site map is stored even when it comes back empty-ish, so a chapter's
  // geography always reflects its latest generation rather than a stale one
  // from a script edit ago. Single-scene regeneration reads it back.
  await db
    .from("chapters")
    .update({ status: "storyboard", site_map: siteMap, updated_at: new Date().toISOString() })
    .eq("id", id);

  const { data: finalScenes, error: fErr } = await db
    .from("scenes")
    .select("*, shots(*)")
    .eq("chapter_id", id)
    .order("index");
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  return NextResponse.json(finalScenes.map(mapScene));
}
