import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireUser } from "@/lib/api/auth-guard";
import { mapVisualStyle } from "@/lib/api/map";
import { listVisualStyles } from "@/lib/visual-styles";

// Every user sees the same locked built-ins (file-defined) plus their own
// editable/removable styles, usable across all of their stories.
export async function GET() {
  const db = await supabaseRoute();
  const styles = await listVisualStyles(db);
  return NextResponse.json(styles.map(mapVisualStyle));
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("visual_styles")
    .insert({
      owner_id: user.id,
      name: body.name,
      description: body.description ?? null,
      swatch: body.swatch ?? "#8a8a8a",
    })
    .select("id, name, description, swatch")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVisualStyle({ ...data, locked: false }));
}
