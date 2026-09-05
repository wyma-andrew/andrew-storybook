import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";
import { tiptapToText } from "@/lib/tiptap-text";
import { extractAssets } from "@/lib/openai";
import { findMatch } from "@/lib/api/match";
import { resolveVisualStyle } from "@/lib/visual-styles";

// Re-runs extraction: reads the chapter script, pulls characters & locations,
// matches each by name against the story's existing Asset Bible, and
// replaces this chapter's chapter_assets rows.
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

  const [{ data: bible, error: bErr }, { data: story, error: stErr }] = await Promise.all([
    db.from("bible_entries").select("*").eq("story_id", chapter.story_id),
    db.from("stories").select("visual_style_id").eq("id", chapter.story_id).single(),
  ]);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const style = await resolveVisualStyle(db, story?.visual_style_id);
  const styleContext = style?.description ?? null;

  const extracted = await extractAssets(scriptText, styleContext);

  const rows = [
    ...extracted.characters.map((a) => ({ ...a, kind: "character" as const })),
    ...extracted.locations.map((a) => ({ ...a, kind: "location" as const })),
  ].map((a) => {
    const match = findMatch(bible.filter((b) => b.kind === a.kind), a.name);
    return {
      chapter_id: id,
      kind: a.kind,
      bible_entry_id: match?.id ?? null,
      name: a.name,
      meta: a.meta,
      real_prompt: match ? match.real_prompt : a.realPrompt,
      match_status: match ? "matched" : "new",
    };
  });

  await db.from("chapter_assets").delete().eq("chapter_id", id);
  const { data, error } = await db.from("chapter_assets").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("chapters").update({ status: "assets", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "script");

  return NextResponse.json(data.map(mapChapterAsset));
}
