import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";
import { tiptapToText } from "@/lib/tiptap-text";
import { extractAssets } from "@/lib/openai";
import { findMatch, normalizeName } from "@/lib/api/match";
import { resolveVisualStyle } from "@/lib/visual-styles";

// Re-Sync with story: re-runs extraction against the current script.
// - Characters/locations not already on this chapter (by name) are INSERTED.
// - Existing rows still present in the script are left untouched (prompts never overwritten).
// - Existing rows whose name no longer appears in the script are flagged match_status
//   "stale" (not deleted) — user reviews and removes them manually. If a stale row's
//   name reappears on a later sync, it's revived back to "matched"/"new".
// Use "Re-analyze" instead for a full rebuild that overwrites everything.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: chapter, error: chErr } = await db
    .from("chapters")
    .select("id, story_id, script")
    .eq("id", id)
    .single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) {
    return NextResponse.json({ error: "Script is empty — write something first." }, { status: 400 });
  }

  const [{ data: bible, error: bErr }, { data: story, error: stErr }, { data: existing, error: exErr }] =
    await Promise.all([
      db.from("bible_entries").select("*").eq("story_id", chapter.story_id),
      db.from("stories").select("visual_style_id").eq("id", chapter.story_id).single(),
      db.from("chapter_assets").select("id, name, kind, match_status").eq("chapter_id", id),
    ]);
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const style = await resolveVisualStyle(story?.visual_style_id);

  const extracted = await extractAssets(scriptText, style?.description ?? null);
  const extractedAssets = [
    ...extracted.characters.map((a) => ({ ...a, kind: "character" as const })),
    ...extracted.locations.map((a) => ({ ...a, kind: "location" as const })),
  ];
  const extractedKeys = new Set(extractedAssets.map((a) => `${a.kind}:${normalizeName(a.name)}`));
  const existingKeys = new Set((existing ?? []).map((e) => `${e.kind}:${normalizeName(e.name)}`));

  const missing = extractedAssets.filter((a) => !existingKeys.has(`${a.kind}:${normalizeName(a.name)}`));
  const newlyStale = (existing ?? []).filter(
    (e) => e.match_status !== "stale" && !extractedKeys.has(`${e.kind}:${normalizeName(e.name)}`)
  );
  const revived = (existing ?? []).filter(
    (e) => e.match_status === "stale" && extractedKeys.has(`${e.kind}:${normalizeName(e.name)}`)
  );

  const rows = missing.map((a) => {
    const match = findMatch(bible.filter((b) => b.kind === a.kind), a.name);
    return {
      chapter_id: id,
      kind: a.kind,
      bible_entry_id: match?.id ?? null,
      name: a.name,
      meta: a.meta,
      real_prompt: match ? match.real_prompt : a.realPrompt,
      match_status: match ? "matched" : "new",
    };
  });

  const writes = await Promise.all([
    rows.length ? db.from("chapter_assets").insert(rows) : Promise.resolve({ error: null }),
    ...newlyStale.map((e) => db.from("chapter_assets").update({ match_status: "stale" }).eq("id", e.id)),
    ...revived.map((e) => {
      const match = findMatch(bible.filter((b) => b.kind === e.kind), e.name);
      return db
        .from("chapter_assets")
        .update({ match_status: match ? "matched" : "new", bible_entry_id: match?.id ?? null })
        .eq("id", e.id);
    }),
  ]);
  const writeErr = writes.find((w) => w.error)?.error;
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  const { data, error } = await db.from("chapter_assets").select("*").eq("chapter_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapChapterAsset));
}
