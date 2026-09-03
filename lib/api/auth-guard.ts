import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/route";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { user: null, unauthorized: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { user, unauthorized: null };
}

export async function requireAdmin() {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return { user: null, unauthorized };
  if (!ADMIN_EMAILS.includes((user!.email ?? "").toLowerCase())) {
    return { user: null, unauthorized: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { user, unauthorized: null };
}
