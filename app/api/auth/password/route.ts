import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function PATCH(req: NextRequest) {
  const { password } = await req.json();
  const supabase = await supabaseRoute();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(null);
}
