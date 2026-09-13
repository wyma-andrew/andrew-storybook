import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { isImageContentType, nextFreeName, presignPut, publicUrlFor, r2Configured } from "@/lib/r2";

// Mints one short-lived PUT URL per file. The bytes go browser -> R2 directly
// and never touch this app, which is what removes any upload size limit: a Next
// route handler would have to buffer the whole body.
//
// The image-type check lives HERE, not only in the file picker. The presigned
// URL is the actual grant of write access, so it is the only place a restriction
// can be enforced — a picker's accept attribute is a convenience.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!r2Configured()) {
    return NextResponse.json({ error: "Image storage is not configured — set R2_* in .env." }, { status: 503 });
  }

  const db = await supabaseRoute();
  // Reading the chapter under RLS is the authorization check: a user who cannot
  // see this chapter never gets a URL that can write into its prefix.
  const { error: chErr } = await db.from("chapters").select("id").eq("id", id).single();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 404 });

  const body = await req.json().catch(() => null);
  const files = Array.isArray(body?.files) ? body.files : [];
  if (!files.length) return NextResponse.json({ error: "No files given." }, { status: 400 });

  const rejected = files.filter((f: Record<string, unknown>) => !isImageContentType(f?.contentType));
  if (rejected.length) {
    return NextResponse.json(
      { error: `Only image files can be uploaded — ${rejected.length} of ${files.length} were not images.` },
      { status: 400 }
    );
  }

  // Every key already used in this chapter. Names are the files' own, so a
  // second "1.2.png" has to become "1.2-2.png" rather than overwrite the first —
  // re-uploading a corrected render is normal, and both should survive until the
  // user deletes one. The set is mutated as the batch is walked, which is what
  // separates two same-named files inside a single folder upload: neither is in
  // the database yet.
  const { data: existing, error: exErr } = await db
    .from("chapter_images")
    .select("object_key")
    .eq("chapter_id", id);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const taken = new Set((existing ?? []).map((r) => r.object_key as string));

  const uploads = [];
  for (const f of files as Record<string, unknown>[]) {
    const contentType = String(f.contentType);
    const { displayName, objectKey } = nextFreeName(id, String(f.fileName ?? "file"), taken);
    uploads.push({
      // The deduplicated name, not the one sent up: the client commits this, so
      // the gallery and the bucket show the same "1.2-2.png".
      fileName: displayName,
      objectKey,
      contentType,
      url: publicUrlFor(objectKey),
      uploadUrl: await presignPut(objectKey, contentType),
    });
  }

  return NextResponse.json(uploads);
}
