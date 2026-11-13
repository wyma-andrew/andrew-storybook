import { NextRequest } from "next/server";
import { listRecapReels } from "@/lib/movie-recap-social";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  const { id, episodeId } = await params;
  return listRecapReels(id, episodeId);
}
