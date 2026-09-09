import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapVoiceOverSegment } from "@/lib/api/map";
import { validateStoredVoiceOverRanges } from "@/lib/voice-over";

type Row = Record<string, unknown>;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();

  const { data: segment, error: segmentError } = await db
    .from("voice_over_segments")
    .select("*")
    .eq("id", id)
    .single();
  if (segmentError) return NextResponse.json({ error: segmentError.message }, { status: 404 });

  const startShotId = body.startShotId === undefined ? segment.start_shot_id : body.startShotId;
  const endShotId = body.endShotId === undefined ? segment.end_shot_id : body.endShotId;
  if (typeof startShotId !== "string" || typeof endShotId !== "string") {
    return NextResponse.json({ error: "startShotId and endShotId must be shot IDs." }, { status: 400 });
  }

  const [{ data: scenes, error: scenesError }, { data: segments, error: segmentsError }] = await Promise.all([
    db.from("scenes").select("index, shots(id, index)").eq("chapter_id", segment.chapter_id).order("index"),
    db.from("voice_over_segments").select("id, source_index, start_shot_id, end_shot_id").eq("chapter_id", segment.chapter_id),
  ]);
  if (scenesError) return NextResponse.json({ error: scenesError.message }, { status: 500 });
  if (segmentsError) return NextResponse.json({ error: segmentsError.message }, { status: 500 });

  const orderedShotIds = scenes.flatMap((scene) =>
    ((scene.shots as Row[]) ?? [])
      .sort((a, b) => (a.index as number) - (b.index as number))
      .map((shot) => shot.id as string)
  );
  const proposedRanges = segments.map((row) => ({
    sourceIndex: row.source_index,
    startShotId: row.id === id ? startShotId : row.start_shot_id,
    endShotId: row.id === id ? endShotId : row.end_shot_id,
  }));

  try {
    validateStoredVoiceOverRanges(proposedRanges, orderedShotIds);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Voice Over range." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {
    start_shot_id: startShotId,
    end_shot_id: endShotId,
    updated_at: new Date().toISOString(),
  };
  if (body.text !== undefined) {
    if (body.text === null) patch.text_override = null;
    else if (typeof body.text === "string" && body.text.trim()) patch.text_override = body.text.trim();
    else return NextResponse.json({ error: "Voice Over text cannot be empty." }, { status: 400 });
  }

  const { data, error } = await db
    .from("voice_over_segments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVoiceOverSegment(data));
}
