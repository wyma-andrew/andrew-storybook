import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/route";
import { readOwnFeatures, readOwnProfile } from "@/lib/api/features";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/constants/features";

// Break-glass only. Admin is `profiles.is_admin`, granted from /admin; this
// list stays so that clearing the last admin — or restoring a database without
// one — cannot lock everyone out of the page that grants it.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.includes((email ?? "").toLowerCase());
}

export async function isAdminUser(userId: string, email: string | null | undefined) {
  if (isAdminEmail(email)) return true;
  return (await readOwnProfile(userId)).isAdmin;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { user: null, unauthorized: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { user, unauthorized: null };
}

export async function requireAdmin() {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return { user: null, unauthorized };
  if (!(await isAdminUser(user!.id, user!.email))) {
    return { user: null, unauthorized: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { user, unauthorized: null };
}

// For the story and recap tables the RLS policies are the boundary; this only
// turns what would be an empty result or an opaque insert failure into a 403
// that says why. Routes with no table behind them (voice preview, the voice
// worker proxy) have no RLS, so there this IS the boundary.
// An array means any one of the features is enough.
export async function requireFeature(feature: FeatureKey | readonly FeatureKey[]) {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return { user: null, unauthorized };

  const wanted = typeof feature === "string" ? [feature] : feature;
  const features = await readOwnFeatures(user!.id);
  if (!wanted.some((key) => features[key])) {
    return {
      user: null,
      unauthorized: NextResponse.json({ error: `${wanted.map((key) => FEATURE_LABELS[key]).join(" or ")} is not enabled for this account.` }, { status: 403 }),
    };
  }
  return { user, unauthorized: null };
}
