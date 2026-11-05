import { NextRequest, NextResponse } from "next/server";
import { mapRecapV2Progress, RECAP_V2_PROGRESS_COLUMNS } from "@/lib/recap-v2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("recap_v2_projects").select(RECAP_V2_PROGRESS_COLUMNS).eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapRecapV2Progress(data as unknown as Record<string, unknown>));
}
