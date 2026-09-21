import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Separate audio and footage downloads are no longer available." },
    { status: 410 }
  );
}
