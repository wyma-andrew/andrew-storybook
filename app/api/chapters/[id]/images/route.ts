import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterImage } from "@/lib/api/map";
import { naturalCompare } from "@/lib/r2";

// The chapter's uploaded renders, ordered by file name — "1.2.png" before
// "1.10.png", which a plain sort gets wrong. Sorted here rather than in SQL:
// Postgres has no natural-order collation available by default, and a chapter's
// gallery is small enough that ordering it in JS costs nothing.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  // The embedded asset/shot rows are what decide "used": a link survives only
  // while its target does (both FKs are ON DELETE SET NULL), so a null embed is
  // an unused image, not a missing join.
  const { data, error } = await db
    .from("chapter_images")
    .select("*, chapter_assets(name), shots(index, scenes(index))")
    .eq("chapter_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? [])
    .slice()
    .sort(
      (a, b) =>
        naturalCompare(a.file_name as string, b.file_name as string) ||
        // Same name twice means a corrected render was uploaded over an older
        // one. Both rows are kept, newest last, so the fresher file reads as
        // the fresher one instead of landing in an arbitrary spot.
        String(a.created_at).localeCompare(String(b.created_at))
    )
    .map(mapChapterImage);

  return NextResponse.json(rows);
}

// Commits rows for objects the browser has ALREADY PUT to R2. Split from the
// presign step on purpose: an upload that fails or is cancelled mid-flight
// leaves an orphaned object rather than a row pointing at nothing, and the
// gallery only ever lists bytes that actually landed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const body = await req.json().catch(() => null);

  const items = Array.isArray(body?.images) ? body.images : [];
  if (!items.length) return NextResponse.json({ error: "No images to record." }, { status: 400 });

  // RLS covers the insert, but the chapter is read first so a bad id fails as a
  // 404 rather than as a policy violation the user cannot act on.
  const { error: chErr } = await db.from("chapters").select("id").eq("id", id).single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  // The link is taken from the request once, not per image: an upload happens on
  // one asset card or one shot card, so every file in the batch attaches to the
  // same thing. Uploading from the gallery sends neither and the images start
  // unused, which is the honest state — nothing generated them.
  const chapterAssetId = typeof body?.chapterAssetId === "string" ? body.chapterAssetId : null;
  const shotId = typeof body?.shotId === "string" ? body.shotId : null;
  if (chapterAssetId && shotId) {
    return NextResponse.json({ error: "An image attaches to an asset or a shot, not both." }, { status: 400 });
  }

  const rows = items.map((item: Record<string, unknown>) => ({
    chapter_id: id,
    file_name: String(item.fileName ?? "").slice(0, 300),
    object_key: String(item.objectKey ?? ""),
    url: String(item.url ?? ""),
    content_type: String(item.contentType ?? "application/octet-stream"),
    size_bytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
    chapter_asset_id: chapterAssetId,
    shot_id: shotId,
  }));
  if (rows.some((r: (typeof rows)[number]) => !r.file_name || !r.object_key || !r.url)) {
    return NextResponse.json({ error: "Each image needs fileName, objectKey and url." }, { status: 400 });
  }

  const { data, error } = await db.from("chapter_images").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapChapterImage));
}
