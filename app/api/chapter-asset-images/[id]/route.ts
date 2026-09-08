import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapReferenceImage } from "@/lib/api/map";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();

  const { data: existing, error: eErr } = await db
    .from("chapter_asset_images")
    .select("chapter_asset_id")
    .eq("id", id)
    .single();
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 404 });

  if (body.isCanonical === true) {
    await db.from("chapter_asset_images").update({ is_canonical: false }).eq("chapter_asset_id", existing.chapter_asset_id);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.angleLabel !== undefined) patch.angle_label = body.angleLabel;
  if (body.imageUrl !== undefined) patch.image_url = body.imageUrl;
  if (body.isCanonical !== undefined) patch.is_canonical = body.isCanonical;

  const { data, error } = await db.from("chapter_asset_images").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapReferenceImage(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { error } = await db.from("chapter_asset_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
