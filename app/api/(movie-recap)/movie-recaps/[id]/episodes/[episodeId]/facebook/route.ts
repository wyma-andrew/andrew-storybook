import { NextRequest } from "next/server";
import { scheduleRecapReel } from "@/lib/movie-recap-social";

export const runtime = "nodejs";
// The upload runs in after(), inside this budget; see lib/movie-recap-social.ts.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  const { id, episodeId } = await params;
  return scheduleRecapReel(req, id, episodeId);
}
