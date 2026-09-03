import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const supabase = await supabaseRoute();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ email: data.user?.email ?? email, needsEmailConfirmation: !data.session });
}
