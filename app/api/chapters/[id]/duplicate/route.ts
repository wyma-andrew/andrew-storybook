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

  const { data: scenes, error: scenesErr } = await db
    .from("scenes")
    .select("*, shots(*)")
    .eq("chapter_id", id)
    .order("index");
  if (scenesErr) return NextResponse.json({ error: scenesErr.message }, { status: 500 });

  for (const scene of scenes) {
    const { data: newScene, error: sceneInsErr } = await db
      .from("scenes")
      .insert({ chapter_id: newChapter.id, index: scene.index, title: scene.title, slug: scene.slug })
      .select("id")
      .single();
    if (sceneInsErr) return NextResponse.json({ error: sceneInsErr.message }, { status: 500 });

    const shots = (scene.shots as Record<string, unknown>[]) ?? [];
    if (shots.length > 0) {
      const { error: shotsInsErr } = await db.from("shots").insert(
        shots.map((s) => ({
          scene_id: newScene.id,
          index: s.index,
          label: s.label,
          duration_s: s.duration_s,
          aspect: s.aspect,
          camera: s.camera,
          prompt: s.prompt,
          end_frame_prompt: s.end_frame_prompt,
          video_prompt: s.video_prompt,
          frame_mode: s.frame_mode,
          assets_used: s.assets_used,
        }))
      );
      if (shotsInsErr) return NextResponse.json({ error: shotsInsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(mapChapter(newChapter));
}
