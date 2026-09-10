import {
  isMotionMode,
  resolveMotionStyle,
  type MotionMode,
} from "./constants/motion-styles";

// The storyboard prompt makes every speaking shot quote its line as
// `in English Dialog: "..."` / `in Burmese Dialog: "..."` inside the
// videoPrompt. That marker is the one piece of ground truth about a shot's
// motion the app can check without a shot -> script-line mapping (the
// generator returns scenes, not line indices), so it is what the guard below
// trusts over the model's own label.
const DIALOG_MARKER = /\bDialog:\s*["“']/;

export function hasDialogLine(videoPrompt: string | null | undefined): boolean {
  return !!videoPrompt && DIALOG_MARKER.test(videoPrompt);
}

// Clamp the model's motion_mode to something the story's motion style actually
// allows, and correct the two mislabels that produce visibly wrong clips:
//
// - a shot that quotes a spoken line but was tagged still (a talking head with
//   a frozen mouth), and
// - a shot tagged `dialogue` with no line to speak (invented gesturing).
//
// Everything else is taken at face value — this is a guard, not a classifier.
export function resolveMotionMode(
  rawMode: unknown,
  videoPrompt: string | null | undefined,
  motionStyleId: string | null | undefined
): MotionMode {
  const style = resolveMotionStyle(motionStyleId);
  const speaking = hasDialogLine(videoPrompt);

  if (speaking) {
    return style.allowedModes.includes("dialogue") ? "dialogue" : style.defaultMode;
  }

  const mode = isMotionMode(rawMode) ? rawMode : style.defaultMode;
  if (mode === "dialogue") return style.defaultMode;
  return style.allowedModes.includes(mode) ? mode : style.defaultMode;
}
