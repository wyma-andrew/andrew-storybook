// The gated top-level features. The key is also the suffix of the profiles
// column (`can_use_<key>`) and the argument the `has_feature()` SQL function
// takes, so a new feature is one entry here plus one column and one branch in
// that function — see history/admin-users.md.
export const FEATURE_KEYS = ["stories", "movie_recap", "voice_lab"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  stories: "Stories",
  movie_recap: "Movie Recap",
  voice_lab: "Voice Lab",
};

export const FEATURE_HREFS: Record<FeatureKey, string> = {
  stories: "/stories",
  movie_recap: "/movie-recap",
  voice_lab: "/labs/voice",
};

export type UserFeatures = Record<FeatureKey, boolean>;

export const NO_FEATURES: UserFeatures = { stories: false, movie_recap: false, voice_lab: false };
