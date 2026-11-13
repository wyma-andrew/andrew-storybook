import { NextRequest } from "next/server";
import { scheduleRecapReel } from "@/lib/movie-recap-social";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return scheduleRecapReel(req, id, null);
}
