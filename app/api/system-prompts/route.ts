import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mapSystemPrompt } from "@/lib/api/map";

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("system_prompts").select("*").order("kind");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapSystemPrompt));
}
