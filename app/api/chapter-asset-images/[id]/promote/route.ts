import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapReferenceImage } from "@/lib/api/map";

// Promotes one chapter-scoped reference image into the story's shared Asset
// Bible (bible_entry_images), same manual-approval gate as promoting an
// asset's prompt (chapter-assets/:id/promote) — nothing auto-shares across
// chapters. Requires the underlying asset to already be matched/promoted
// (bible_entry_id set); an image can't be promoted onto a bible entry that
// doesn't exist yet.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: image, error: iErr } = await db.from("chapter_asset_images").select("*").eq("id", id).single();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 404 });

  const { data: asset, error: aErr } = await db
    .from("chapter_assets")
    .select("bible_entry_id")
    .eq("id", image.chapter_asset_id)
    .single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!asset.bible_entry_id) {
    return NextResponse.json({ error: "Add this asset to the bible first, then promote its images." }, { status: 400 });
  }

  if (image.is_canonical) {
    await db.from("bible_entry_images").update({ is_canonical: false }).eq("bible_entry_id", asset.bible_entry_id);
  }

  const { data, error } = await db
    .from("bible_entry_images")
    .insert({
      bible_entry_id: asset.bible_entry_id,
      angle_label: image.angle_label,
      image_url: image.image_url,
      is_canonical: image.is_canonical,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapReferenceImage(data));
}
