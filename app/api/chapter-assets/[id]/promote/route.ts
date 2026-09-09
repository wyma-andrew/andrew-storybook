import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";

// Promotes a chapter-local "new" asset into the story's Asset Bible,
// and links this chapter_asset row back to it (match_status -> matched).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: asset, error: aErr } = await db.from("chapter_assets").select("*").eq("id", id).single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 404 });

  const { data: chapter, error: cErr } = await db
    .from("chapters")
    .select("story_id")
    .eq("id", asset.chapter_id)
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const { data: entry, error: eErr } = await db
    .from("bible_entries")
    .insert({
      story_id: chapter.story_id,
      kind: asset.kind,
      name: asset.name,
      meta: asset.meta,
      space_kind: asset.space_kind ?? null,
      real_prompt: asset.real_prompt,
      locked: false,
    })
    .select("*")
    .single();
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const { data: updated, error: uErr } = await db
    .from("chapter_assets")
    .update({ bible_entry_id: entry.id, match_status: "matched" })
    .eq("id", id)
    .select("*")
    .single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json(mapChapterAsset(updated));
}
