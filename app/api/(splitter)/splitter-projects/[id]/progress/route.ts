import { NextRequest, NextResponse } from "next/server";
import { mapSplitterProgress, SPLITTER_PROGRESS_COLUMNS } from "@/lib/splitter";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("splitter_projects").select(SPLITTER_PROGRESS_COLUMNS).eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapSplitterProgress(data as unknown as Record<string, unknown>));
}
