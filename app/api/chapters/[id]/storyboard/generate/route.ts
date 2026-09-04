import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapScene } from "@/lib/api/map";
import { tiptapToText } from "@/lib/tiptap-text";
import { generateStoryboard } from "@/lib/openai";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: chapter, error: chErr } = await db
    .from("chapters")
    .select("id, story_id, script")
    .eq("id", id)
    .single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) {
    return NextResponse.json({ error: "Script is empty — write something first." }, { status: 400 });
  }

  const [{ data: assets, error: aErr }, { data: story, error: stErr }] = await Promise.all([
    db.from("chapter_assets").select("kind, name, meta, real_prompt").eq("chapter_id", id),
    db.from("stories").select("visual_styles!stories_visual_style_fk(description)").eq("id", chapter.story_id).single(),
  ]);
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const styleContext = (story?.visual_styles as { description?: string } | null)?.description ?? null;

  const assetContext = (assets ?? [])
    .map((a) => `${a.kind === "character" ? "Character" : "Location"} — ${a.name} (${a.meta}): ${a.real_prompt}`)
    .join("\n");

  const scenes = await generateStoryboard(scriptText, assetContext, styleContext);

  const { data: oldScenes } = await db.from("scenes").select("id").eq("chapter_id", id);
  if (oldScenes?.length) {
    await db.from("scenes").delete().eq("chapter_id", id); // cascades to shots
  }

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const { data: sceneRow, error: sErr } = await db
      .from("scenes")
      .insert({ chapter_id: id, index: i + 1, title: s.title, slug: s.slug })
      .select("id")
      .single();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const shotRows = s.shots.map((sh, j) => ({
      scene_id: sceneRow.id,
      index: j + 1,
      label: sh.label,
      duration_s: Math.min(Math.max(sh.durationS, 1), 10), // hard cap: most AI video tools can't export past 10s
      aspect: sh.aspect,
      camera: sh.camera,
      prompt: sh.prompt,
      end_frame_prompt: sh.endFramePrompt,
      video_prompt: sh.videoPrompt,
      frame_mode: sh.frameMode,
      assets_used: sh.assetsUsed,
    }));
    if (shotRows.length) {
      const { error: shErr } = await db.from("shots").insert(shotRows);
      if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 });
    }
  }

  await db.from("chapters").update({ status: "storyboard", updated_at: new Date().toISOString() }).eq("id", id);

  const { data: finalScenes, error: fErr } = await db
    .from("scenes")
    .select("*, shots(*)")
    .eq("chapter_id", id)
    .order("index");
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  return NextResponse.json(finalScenes.map(mapScene));
}
