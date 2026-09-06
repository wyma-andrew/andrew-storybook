// Per-story region (stories.region). "english" is the original, untouched
// flow. "myanmar" switches asset extraction, asset regeneration, and
// storyboard generation to a separate prompt variant that culturally
// adapts generated visuals (see lib/prompts/shared.ts myanmarAdaptationBlock).

export type Region = "english" | "myanmar";

export interface RegionOption {
  value: Region;
  label: string;
}

export const REGIONS: RegionOption[] = [
  { value: "english", label: "English" },
  { value: "myanmar", label: "Myanmar" },
];

export const DEFAULT_REGION: Region = "english";

export function isRegion(value: unknown): value is Region {
  return value === "english" || value === "myanmar";
}
