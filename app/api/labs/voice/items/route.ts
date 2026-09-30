import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { supabaseRoute } from "@/lib/supabase/route";
import { deleteObject, getObjectBytes, publicUrlFor } from "@/lib/r2";
import { wavInfo } from "@/lib/tts/wav";
import {
  mapVoiceLabItem,
  splitVoiceLabScript,
  validateVoiceLabText,
  VOICE_LAB_MAX_ITEMS,
} from "@/lib/voice-lab";

export const runtime = "nodejs";

export async function GET() {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const db = await supabaseRoute();
  const { data, error } = await db.from("voice_lab_items").select("*").order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The worker's callback can be lost; its finished WAV is already in R2, so a
  // processing row whose object exists is done. See history/voice-lab.md.
  const items = await Promise.all(
    data.map(async (row) => {
      if (row.status !== "processing" || !row.audio_key) return row;
      const bytes = await getObjectBytes(row.audio_key);
      const info = bytes && wavInfo(bytes);
      if (!info) return row;
      const done = {
        status: "done",
        audio_url: publicUrlFor(row.audio_key),
        duration_seconds: Math.round(info.durationSeconds * 1000) / 1000,
        error: null,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await db.from("voice_lab_items").update(done).eq("id", row.id).eq("status", "processing");
      return updateError ? row : { ...row, ...done };
    }),
  );
  return NextResponse.json(items.map(mapVoiceLabItem));
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  if (typeof body?.script !== "string") return NextResponse.json({ error: "Enter a script to import." }, { status: 400 });
  const lines = splitVoiceLabScript(body.script);
  if (!lines.length) return NextResponse.json({ error: "Enter a script to import." }, { status: 400 });
  const lineError = lines.map(validateVoiceLabText).find(Boolean);
  if (lineError) return NextResponse.json({ error: lineError }, { status: 400 });

  const db = await supabaseRoute();
  const { data: last, error: lastError } = await db
    .from("voice_lab_items")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 500 });
  const count = await db.from("voice_lab_items").select("id", { count: "exact", head: true });
  if ((count.count ?? 0) + lines.length > VOICE_LAB_MAX_ITEMS) {
    return NextResponse.json({ error: `A list holds at most ${VOICE_LAB_MAX_ITEMS} lines.` }, { status: 400 });
  }

  const start = (last?.[0]?.position ?? 0) + 1;
  const { data, error } = await db
    .from("voice_lab_items")
    .insert(lines.map((text, index) => ({ owner_id: user!.id, position: start + index, text })))
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapVoiceLabItem));
}

export async function PATCH(req: NextRequest) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const order: unknown = body?.order;
  if (!Array.isArray(order) || order.some((id) => typeof id !== "string") || new Set(order).size !== order.length) {
    return NextResponse.json({ error: "order must be a list of unique item IDs." }, { status: 400 });
  }

  const db = await supabaseRoute();
  const results = await Promise.all(
    (order as string[]).map((id, index) => db.from("voice_lab_items").update({ position: index + 1 }).eq("id", id)),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json(null);
}

export async function DELETE() {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const db = await supabaseRoute();
  const { data, error } = await db.from("voice_lab_items").delete().not("id", "is", null).select("audio_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await Promise.allSettled(data.filter((row) => row.audio_key).map((row) => deleteObject(row.audio_key)));
  return NextResponse.json(null);
}
