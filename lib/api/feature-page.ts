import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/route";
import { readOwnFeatures } from "@/lib/api/features";
import type { FeatureKey } from "@/lib/constants/features";

// Page-level gate for a feature's route group. This is convenience, not the
// boundary — the stories and recap tables are gated by RLS and every route
// handler answers 403 on its own. Without it a user without access would reach
// a working page that renders nothing but errors.
export async function requireFeaturePage(feature: FeatureKey) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const features = await readOwnFeatures(user.id);
  if (!features[feature]) redirect(`/no-access?feature=${feature}`);
}
