// Per-story region (stories.region). "english" is the original, untouched
// flow. "myanmar" and "buddha" switch asset extraction, asset regeneration,
// and storyboard generation to dedicated cultural/historical prompt variants
// (see lib/prompts/shared.ts regionAdaptationBlock).

export type Region = "english" | "myanmar" | "buddha";

export interface RegionOption {
  value: Region;
  label: string;
}

export const REGIONS: RegionOption[] = [
  { value: "english", label: "English" },
  { value: "myanmar", label: "Myanmar" },
  { value: "buddha", label: "Buddha" },
];

export const DEFAULT_REGION: Region = "english";

export function isRegion(value: unknown): value is Region {
  return value === "english" || value === "myanmar" || value === "buddha";
}
