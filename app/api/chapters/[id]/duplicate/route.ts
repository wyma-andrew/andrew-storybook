import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapter } from "@/lib/api/map";

// Clones a chapter end-to-end: script, chapter_assets, scenes, and each
// scene's shots — whatever stage the original is at (script/assets/
// storyboard/done) carries over as-is. RLS (via story ownership) is what
// actually gates every read/write here, not app-level checks.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: original, error: origErr } = await db.from("chapters").select("*").eq("id", id).single();
  if (origErr) return NextResponse.json({ error: origErr.message }, { status: 404 });

  const { data: existing, error: cntErr } = await db
    .from("chapters")
    .select("index")
    .eq("story_id", original.story_id)
    .order("index", { ascending: false })
    .limit(1);
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });
  const nextIndex = (existing[0]?.index ?? 0) + 1;

  const { data: newChapter, error: insErr } = await db
    .from("chapters")
    .insert({
      story_id: original.story_id,
      index: nextIndex,
      title: `${original.title} (Copy)`,
      script: original.script,
      status: original.status,
    })
    .select("*")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { data: assets, error: assetsErr } = await db.from("chapter_assets").select("*").eq("chapter_id", id);
  if (assetsErr) return NextResponse.json({ error: assetsErr.message }, { status: 500 });
  if (assets.length > 0) {
    const { error } = await db.from("chapter_assets").insert(
      assets.map((a) => ({
        chapter_id: newChapter.id,
        kind: a.kind,
        bible_entry_id: a.bible_entry_id,
        name: a.name,
        meta: a.meta,
        real_prompt: a.real_prompt,
        match_status: a.match_status,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [{ data: scenes, error: scenesErr }, { data: voiceOvers, error: voiceOversErr }] = await Promise.all([
    db.from("scenes").select("*, shots(*)").eq("chapter_id", id).order("index"),
    db.from("voice_over_segments").select("*").eq("chapter_id", id).order("source_index"),
  ]);
  if (scenesErr) return NextResponse.json({ error: scenesErr.message }, { status: 500 });
  if (voiceOversErr) return NextResponse.json({ error: voiceOversErr.message }, { status: 500 });

  const shotIdMap = new Map<string, string>();
  for (const scene of scenes) {
    const { data: newScene, error: sceneInsErr } = await db
      .from("scenes")
      .insert({ chapter_id: newChapter.id, index: scene.index, title: scene.title, slug: scene.slug })
      .select("id")
      .single();
    if (sceneInsErr) return NextResponse.json({ error: sceneInsErr.message }, { status: 500 });

    const shots = (scene.shots as Record<string, unknown>[]) ?? [];
    if (shots.length > 0) {
      const { data: insertedShots, error: shotsInsErr } = await db.from("shots").insert(
        shots.map((s) => ({
          scene_id: newScene.id,
          index: s.index,
          label: s.label,
          duration_s: s.duration_s,
          aspect: s.aspect,
          camera: s.camera,
          prompt: s.prompt,
          video_prompt: s.video_prompt,
          assets_used: s.assets_used,
          beat: s.beat,
          start_state: s.start_state,
          end_state: s.end_state,
        }))
      ).select("id, index");
      if (shotsInsErr) return NextResponse.json({ error: shotsInsErr.message }, { status: 500 });
      for (const originalShot of shots) {
        const inserted = insertedShots.find((shot) => shot.index === originalShot.index);
        if (inserted) shotIdMap.set(originalShot.id as string, inserted.id);
      }
    }
  }

  if (voiceOvers.length) {
    const rows = voiceOvers.map((segment) => ({
      chapter_id: newChapter.id,
      source_index: segment.source_index,
      text: segment.text,
      text_override: segment.text_override,
      start_shot_id: shotIdMap.get(segment.start_shot_id),
      end_shot_id: shotIdMap.get(segment.end_shot_id),
    }));
    if (rows.some((row) => !row.start_shot_id || !row.end_shot_id)) {
      return NextResponse.json({ error: "Could not remap a Voice Over range while duplicating." }, { status: 500 });
    }
    const { error } = await db.from("voice_over_segments").insert(
      rows
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapChapter(newChapter));
}
