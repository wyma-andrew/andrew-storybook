import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireUser } from "@/lib/api/auth-guard";
import { mapVisualStyle } from "@/lib/api/map";
import { findBuiltInVisualStyle } from "@/lib/visual-styles";

// Built-in (file-defined) styles are locked — not stored as rows, so there's
// nothing to update/delete; only the caller's own DB-backed styles are
// reachable here (RLS further scopes writes to owner_id = auth.uid()).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (findBuiltInVisualStyle(id)) {
    return NextResponse.json({ error: "Built-in styles can't be edited." }, { status: 400 });
  }

  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.swatch !== undefined) patch.swatch = body.swatch;

  const { data, error } = await db
    .from("visual_styles")
    .update(patch)
    .eq("id", id)
    .select("id, name, description, swatch")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVisualStyle({ ...data, locked: false }));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (findBuiltInVisualStyle(id)) {
    return NextResponse.json({ error: "Built-in styles can't be removed." }, { status: 400 });
  }

  const db = await supabaseRoute();
  const { error } = await db.from("visual_styles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
