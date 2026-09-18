import { FEATURE_KEYS, NO_FEATURES, type UserFeatures } from "@/lib/constants/features";
import { supabaseRoute } from "@/lib/supabase/route";

type ProfileRow = Record<string, unknown>;

export function featuresFromProfile(row: ProfileRow | null | undefined): UserFeatures {
  if (!row) return NO_FEATURES;
  return FEATURE_KEYS.reduce((features, key) => {
    features[key] = row[`can_use_${key}`] === true;
    return features;
  }, {} as UserFeatures);
}

// Reads the caller's own row — the profiles policy allows nothing else, so this
// cannot be pointed at another user by accident.
export async function readOwnProfile(userId: string) {
  const supabase = await supabaseRoute();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return { isAdmin: data?.is_admin === true, features: featuresFromProfile(data) };
}

export async function readOwnFeatures(userId: string): Promise<UserFeatures> {
  return (await readOwnProfile(userId)).features;
}
