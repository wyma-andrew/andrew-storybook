import { NextRequest } from "next/server";
import { listRecapReels } from "@/lib/movie-recap-social";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listRecapReels(id, null);
}
