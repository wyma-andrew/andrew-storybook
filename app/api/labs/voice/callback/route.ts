import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { publicUrlFor } from "@/lib/r2";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const token = process.env.VOICE_LAB_WORKER_TOKEN?.trim();
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The worker has no user session, so this is the one voice-lab route that
// writes with the service role. It only ever updates a row still `processing`.
// See history/voice-lab.md.
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (typeof body?.itemId !== "string") return NextResponse.json({ error: "itemId is required." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: row } = await db.from("voice_lab_items").select("audio_key, status").eq("id", body.itemId).maybeSingle();
  if (!row || row.status !== "processing") return NextResponse.json({ ignored: true });

  const update =
    body.status === "done" && row.audio_key && typeof body.durationSeconds === "number"
      ? { status: "done", audio_url: publicUrlFor(row.audio_key), duration_seconds: body.durationSeconds, error: null }
      : { status: "failed", error: typeof body.error === "string" ? body.error.slice(0, 500) : "Voice generation failed." };
  const { error } = await db
    .from("voice_lab_items")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", body.itemId)
    .eq("status", "processing");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
