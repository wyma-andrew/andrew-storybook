import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { buildStoryBundle } from "@/lib/story-transfer";

// Returns the story as a portable JSON bundle. Plain JSON, not a file
// download response: the browser reaches this through the Spoosh client like
// every other read, and the client turns the bundle into a downloaded file.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const result = await buildStoryBundle(db, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.bundle);
}
