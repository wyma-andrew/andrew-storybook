// How a single-scene regeneration should size its new shot list.
//
// A regeneration never sees the take it replaces (the route sends the
// neighbouring scenes' ledger states, not this scene's shots), so shot count is
// re-derived from scratch every time. Every count rule in the storyboard system
// prompt is a FLOOR — one shot per Voice Over block, split long dialogue, an
// establishing shot, camera variety — and the only downward pressure (SHOT
// ECONOMY) judges shot against shot, never a total. Net effect: a re-shoot
// drifts upward, and the user who regenerated to fix one bad shot gets a longer
// scene. These modes give the pass a target instead.
export const COVERAGE_MODES = ["same", "tighter", "more", "free"] as const;
export type CoverageMode = (typeof COVERAGE_MODES)[number];

export const DEFAULT_COVERAGE_MODE: CoverageMode = "same";

export function isCoverageMode(value: unknown): value is CoverageMode {
  return typeof value === "string" && (COVERAGE_MODES as readonly string[]).includes(value);
}

export function resolveCoverageMode(value: unknown): CoverageMode {
  return isCoverageMode(value) ? value : DEFAULT_COVERAGE_MODE;
}

export const COVERAGE_MODE_LABELS: Record<CoverageMode, string> = {
  same: "Same coverage",
  tighter: "Tighter coverage",
  more: "More coverage",
  free: "Let AI decide",
};

// `count` is the previous take's shot count. Null when the scene has no stored
// shots — then there is nothing to anchor to and every mode reads as "free".
export function coverageModeInstruction(mode: CoverageMode, count: number | null): string {
  if (count === null || mode === "free") {
    return "SHOT COUNT: judge how many shots this scene needs from the script and the shot rules above. Do not pad the scene to look thorough — a shot that cannot name what it shows that the previous one did not should not exist.";
  }
  const shots = `${count} shot${count === 1 ? "" : "s"}`;
  if (mode === "tighter") {
    return (
      `SHOT COUNT: the take you are replacing covered this scene in ${shots}, and the user asked for TIGHTER coverage. Come in BELOW ${count} — merge the shots that were splitting one beat by angle rather than by change, and hold two-line exchanges in one shot. ` +
      "Never drop a script beat to hit the number: every [DIALOG] line and every [ACTION] must still be covered, and each [VOICE_OVER] block still needs its own distinct shot."
    );
  }
  if (mode === "more") {
    return (
      `SHOT COUNT: the take you are replacing covered this scene in ${shots}, and the user asked for MORE coverage. Go ABOVE ${count} — but earn each added shot the way SHOT ECONOMY requires: split where something physically CHANGES, or where a reverse angle genuinely shows something new. ` +
      "Adding a re-labelled version of a moment already covered is not more coverage."
    );
  }
  return (
    `SHOT COUNT: the take you are replacing covered this scene in ${shots}, and the user asked to KEEP that coverage. Land on ${count}, or within one shot of it. ` +
    "You are re-shooting the same beats, not re-deciding how much the scene deserves — the reason for this regeneration is the CONTENT of the shots, not their number. " +
    `Depart from ${count} only when a shot rule above forces it (a [VOICE_OVER] block with no shot of its own, a dialogue line too long for one clip), and then by the smallest margin that satisfies the rule.`
  );
}
