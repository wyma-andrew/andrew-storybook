import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { featuresFromProfile } from "@/lib/api/features";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/constants/features";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/api/types";

export const runtime = "nodejs";

// The admin routes are the one place in the app that touches other users' rows,
// so they use the service-role client and are gated by requireAdmin() in
// application code rather than by RLS — see history/admin-users.md.

function featureColumns(features: Partial<Record<FeatureKey, boolean>> | undefined) {
  const columns: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    if (typeof features?.[key] === "boolean") columns[`can_use_${key}`] = features[key]!;
  }
  return columns;
}

export async function GET() {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const db = supabaseAdmin();
  const { data: profiles, error } = await db.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: authUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const lastSignIn = new Map(authUsers?.users.map((u) => [u.id, u.last_sign_in_at ?? null]));

  const users: AdminUser[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    lastSignInAt: lastSignIn.get(profile.id) ?? null,
    isAdmin: profile.is_admin === true,
    features: featuresFromProfile(profile),
  }));
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email.includes("@")) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const db = supabaseAdmin();
  // Confirmed on creation: there is no sign-up flow and no confirmation email
  // to click, so an unconfirmed account could never sign in.
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const columns = { ...featureColumns(body?.features), ...(body?.isAdmin === true ? { is_admin: true } : {}) };
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .update({ ...columns, updated_at: new Date().toISOString() })
    .eq("id", created.user.id)
    .select("*")
    .single();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const user: AdminUser = {
    id: created.user.id,
    email: profile.email,
    createdAt: profile.created_at,
    lastSignInAt: null,
    isAdmin: profile.is_admin === true,
    features: featuresFromProfile(profile),
  };
  return NextResponse.json(user, { status: 201 });
}
