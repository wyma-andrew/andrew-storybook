import { NextRequest } from "next/server";
import { scheduleRecapReel } from "@/lib/movie-recap-social";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  const { id, episodeId } = await params;
  return scheduleRecapReel(req, id, episodeId);
}
