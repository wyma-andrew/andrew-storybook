import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/api/auth-guard";
import { readOwnProfile } from "@/lib/api/features";
import { FEATURE_HREFS, FEATURE_KEYS } from "@/lib/constants/features";
import { getSessionUser } from "@/lib/supabase/route";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const profile = await readOwnProfile(user.id);
  const firstFeature = FEATURE_KEYS.find((feature) => profile.features[feature]);
  if (firstFeature) redirect(FEATURE_HREFS[firstFeature]);
  if (profile.isAdmin || isAdminEmail(user.email ?? "")) redirect("/admin");
  redirect("/no-access");
}
