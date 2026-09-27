import { NextRequest, NextResponse } from "next/server";
import { deleteObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; rangeId: string }> }) {
  const { id, rangeId } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_range_renders").select("*")
    .eq("id", rangeId).eq("project_id", id).single();
  if (error || !data) return NextResponse.json({ error: "Range render not found." }, { status: 404 });
  if (data.status === "running") return NextResponse.json({ error: "Cancel this render before deleting it." }, { status: 409 });
  if (data.output_object_key) {
    try {
      await deleteObject(data.output_object_key);
    } catch {
      return NextResponse.json({ error: "Could not delete the stored video." }, { status: 502 });
    }
  }
  const { error: deleteError } = await db.from("movie_recap_range_renders").delete().eq("id", rangeId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json(null);
}
