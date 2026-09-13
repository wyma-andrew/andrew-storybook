import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { deleteObject, r2Configured } from "@/lib/r2";
import { mapChapterImage } from "@/lib/api/map";

// Renames the DISPLAY name only — the R2 object keeps its key. Renaming the
// object would mean copy-then-delete (S3 has no rename) and would break the
// stored public URL for anything already pointing at it. Nothing needs the key
// to match the name: the key is plumbing, the name is what the gallery shows and
// SORTS by, which is the actual reason to rename one (fixing "1.10.png" so it
// lands where you want it).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const body = await req.json().catch(() => null);

  const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
  if (!fileName) return NextResponse.json({ error: "A file name is required." }, { status: 400 });
  if (fileName.length > 300) return NextResponse.json({ error: "That file name is too long." }, { status: 400 });

  const { data, error } = await db
    .from("chapter_images")
    .update({ file_name: fileName })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json(mapChapterImage(data));
}

// Removes the row and then the R2 object. Row first: RLS is what proves the
// caller owns this image, so the object is only touched once the delete it
// authorizes has actually happened.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data, error } = await db.from("chapter_images").delete().eq("id", id).select("object_key").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  if (r2Configured()) {
    try {
      await deleteObject(data.object_key as string);
    } catch {
      // The row is gone and the gallery is correct. A surviving object is
      // invisible and costs storage; failing the request here would tell the
      // user nothing they could act on.
    }
  }

  return NextResponse.json(null);
}
