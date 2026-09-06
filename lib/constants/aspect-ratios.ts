// Per-story default aspect ratio (stories.aspect_ratio). A chapter may
// override it (chapters.aspect_ratio, nullable — null means "use the
// story's default"). Whichever ratio resolves is fixed for every shot in
// that chapter; the storyboard AI does not vary it per shot.

export interface AspectRatioOption {
  value: string;
  label: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { value: "16:9", label: "16:9 — Widescreen" },
  { value: "9:16", label: "9:16 — Vertical" },
];

export const DEFAULT_ASPECT_RATIO = "16:9";
