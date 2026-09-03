import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapSystemPrompt } from "@/lib/api/map";

// Admin-only — gated by requireAdmin (email must be in ADMIN_EMAILS).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  const { user, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { kind } = await params;
  const body = await req.json();
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("system_prompts")
    .update({ prompt: body.prompt, updated_by: user.email, updated_at: new Date().toISOString() })
    .eq("kind", kind)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapSystemPrompt(data));
}
