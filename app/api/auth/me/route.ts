import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/route";
import { isAdminEmail } from "@/lib/api/auth-guard";
import { readOwnProfile } from "@/lib/api/features";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const email = user.email ?? "";
  const profile = await readOwnProfile(user.id);
  return NextResponse.json({
    id: user.id,
    email,
    isAdmin: profile.isAdmin || isAdminEmail(email),
    features: profile.features,
  });
}
