import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapReferenceImage } from "@/lib/api/map";

// Adds a locked reference image to a chapter-scoped location asset.
// Scoped to kind="location" — this feature exists to solve location spatial
// consistency, characters aren't in scope. angleLabel is required; imageUrl
// is optional (a row can exist as a planned/labelled angle before a link is
// pasted in).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const body = await req.json();

  const angleLabel = typeof body.angleLabel === "string" ? body.angleLabel.trim() : "";
  if (!angleLabel) return NextResponse.json({ error: "angleLabel is required." }, { status: 400 });

  const { data: asset, error: aErr } = await db.from("chapter_assets").select("id, kind").eq("id", id).single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 404 });
  if (asset.kind !== "location") {
    return NextResponse.json({ error: "Reference images are only supported on location assets." }, { status: 400 });
  }

  const isCanonical = body.isCanonical === true;
  if (isCanonical) {
    await db.from("chapter_asset_images").update({ is_canonical: false }).eq("chapter_asset_id", id);
  }

  const { data, error } = await db
    .from("chapter_asset_images")
    .insert({
      chapter_asset_id: id,
      angle_label: angleLabel,
      image_url: body.imageUrl ?? null,
      is_canonical: isCanonical,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapReferenceImage(data));
}
