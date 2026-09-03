import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/route";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const email = user.email ?? "";
  return NextResponse.json({ id: user.id, email, isAdmin: ADMIN_EMAILS.includes(email.toLowerCase()) });
}
