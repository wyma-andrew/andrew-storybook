import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapVisualStyle } from "@/lib/api/map";

// Admin-only. Only global (built-in) styles are editable here — story-owned
// custom styles are managed by their owner via the story-scoped routes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json();
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.swatch !== undefined) patch.swatch = body.swatch;

  const { data, error } = await db
    .from("visual_styles")
    .update(patch)
    .eq("id", id)
    .eq("scope", "global")
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVisualStyle(data));
}
