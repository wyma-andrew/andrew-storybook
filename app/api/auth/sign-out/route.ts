import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST() {
  const supabase = await supabaseRoute();
  await supabase.auth.signOut();
  return NextResponse.json(null);
}
