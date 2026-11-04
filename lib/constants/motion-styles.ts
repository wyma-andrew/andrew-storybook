// Story-wide motion style (stories.motion_style_id) + the per-shot motion mode
// (shots.motion_mode) it constrains.
//
// The split matters: a story-wide string applied verbatim to every shot freezes
// walking scenes; a per-shot mode with no story-wide gate is what free-form
// motion already is. The style says which modes are allowed and which one a
// shot falls back to; the mode says which of that style's predefined texts a
// shot gets.
//
// The text is NEVER written by the AI. The model classifies a shot into one of
// four modes and the app composes the motion paragraph from the table below at
// copy time (lib/prompt-copy.ts withFrameDescription) — so switching a story's
// motion style re-renders every video prompt with no regeneration, exactly like
// visual style.

export type MotionMode = "micro" | "dialogue" | "normal" | "emotional";

export const MOTION_MODES: MotionMode[] = ["micro", "dialogue", "normal", "emotional"];

export interface MotionModeOption {
  value: MotionMode;
  label: string;
  hint: string;
}

// Labels for the per-shot override picker on the storyboard page.
export const MOTION_MODE_OPTIONS: MotionModeOption[] = [
  { value: "micro", label: "Micro", hint: "Near-still — breathing, blinks, slow push-in" },
  { value: "dialogue", label: "Dialogue", hint: "Speaker gestures, listener reacts, camera locked" },
  { value: "normal", label: "Normal", hint: "Walking, travel, object handling" },
  { value: "emotional", label: "Emotional", hint: "Expression only, very slow push-in" },
];

export interface MotionStylePreset {
  id: string; // stable slug — referenced by stories.motion_style_id
  name: string;
  // Where a shot lands when the model's mode isn't allowed by this style, or
  // when there is no mode on the row at all (shots generated before this
  // feature existed).
  defaultMode: MotionMode;
  allowedModes: MotionMode[];
  // One predefined paragraph per mode. Every mode has an entry, always — no
  // fallback between modes, for the same reason visual styles have no fallback
  // between regions (see history/visual-styles.md): a fallback needs a rule
  // about when it applies, and that rule is the bug.
  text: Record<MotionMode, string>;
  // Prompt-side rules telling the model how to pick a mode for this style.
  selectionRule: string;
}

// Written into every mode's text: the clip animates the Start Frame, it never
// redesigns it. Duplicating this per mode is deliberate — the motion paragraph
// is copied on its own and has to carry the constraint wherever it lands.
const HOLD_DESIGN = "Character design, wardrobe, and environment layout remain unchanged for the entire clip.";

export const MOTION_STYLES: MotionStylePreset[] = [
  {
    id: "natural",
    name: "Natural",
    defaultMode: "normal",
    allowedModes: ["micro", "dialogue", "normal", "emotional"],
    text: {
      normal:
        "MOTION:\nOne primary action, performed at a natural pace with grounded, believable body mechanics. " +
        "Camera holds static or makes at most one slow, simple move. " +
        "No second interaction, no exaggerated or elastic movement. " +
        HOLD_DESIGN,
      dialogue:
        "MOTION:\nNatural dialogue performance. The speaker uses small hand gestures and subtle head movement while speaking; " +
        "anyone listening stays mostly still with gentle eye and facial reactions. " +
        "Camera stays stable or drifts very slowly. No walking, no large gestures. " +
        HOLD_DESIGN,
      micro:
        "MOTION:\nMinimal motion. Subtle breathing, natural blinks, small head and eye movement only. " +
        "Nearby fabric and light environmental elements drift faintly. Camera performs one slow, steady push-in. " +
        "No walking, no gestures, no fast movement. " +
        HOLD_DESIGN,
      emotional:
        "MOTION:\nHold the character nearly still as the emotion settles. Subtle breathing, slight eye movement, " +
        "one small change of expression. Very slow push-in toward the face. Background movement stays soft and natural. " +
        "No body relocation, no gestures. " +
        HOLD_DESIGN,
    },
    selectionRule:
      "Default to `normal`. Use `dialogue` when the shot covers a [CHARACTER]/[DIALOG] pair, " +
      "`micro` when nothing physical happens (a held look, a listening beat), and `emotional` on a realization or turn.",
  },
  {
    id: "sacred-cinematic",
    name: "Sacred Cinematic",
    defaultMode: "micro",
    allowedModes: ["micro", "dialogue", "normal", "emotional"],
    text: {
      // The default for this style, and the reason it exists: sacred/narration
      // coverage that reads as calm and deliberate rather than AI-animated.
      micro:
        "MOTION:\nMicro-motion only. Figures stay essentially still — subtle natural breathing, occasional slow blinks, " +
        "minimal head and eye movement. Seated figures hold their posture. " +
        "Robes, cloth, and nearby light environmental elements drift faintly in a soft breeze. " +
        "Camera performs one very slow, steady push-in. " +
        "No walking, no hand gestures, no dramatic body movement, no exaggerated facial animation, no fast motion. " +
        HOLD_DESIGN,
      dialogue:
        "MOTION:\nRestrained dialogue performance. The speaker makes small, unhurried hand and head movements while speaking; " +
        "listeners remain mostly still with gentle eye and facial reactions. " +
        "Camera stays locked or drifts very slowly. " +
        "No walking, no broad gestures, no exaggerated expression. " +
        HOLD_DESIGN,
      normal:
        "MOTION:\nRestrained, natural cinematic movement. Preserve the primary physical action described in the shot with measured, controlled, anatomically believable motion. " +
        "Walking uses natural, unhurried steps appropriate to the character and situation. " +
        "Gestures remain subtle and purposeful, without exaggerated body movement or abrupt acceleration. " +
        "Keep the camera fixed by default. Allow only a single extremely slow, subtle camera movement when clearly necessary to follow the action. " +
        "Preserve character appearance, clothing, object positions, and environment geometry throughout the clip.",
      emotional:
        "MOTION:\nHold the character nearly still as the emotion settles. Subtle breathing, slight eye movement, " +
        "one small change of expression. Very slow push-in toward the face. " +
        "Background and light movement stay soft and restrained. Quiet, contemplative pacing. " +
        "No body relocation, no gestures. " +
        HOLD_DESIGN,
    },
    selectionRule:
      "Default to `micro` — this is a calm, sacred register and stillness is the correct answer whenever nothing physical happens. " +
      "Use `dialogue` only when the shot covers a [CHARACTER]/[DIALOG] pair, " +
      "`normal` only when the script states clear physical action (walking, travelling, entering, handing something over, a crowd moving), " +
      "and `emotional` only on an explicit realization or emotional turn. When unsure, choose `micro`.",
  },
  {
    id: "cozy-asmr",
    name: "Cozy ASMR",
    defaultMode: "normal",
    allowedModes: ["micro", "dialogue", "normal", "emotional"],
    text: {
      normal:
        "MOTION:\nReal-time speed — hands work at the brisk, practiced pace of someone doing this every day, not slow motion. " +
        "The action is continuous and carries through to a visible result: repeated knife strokes through the whole ingredient, several full stirs, a pour that fills the cup. " +
        "Hands move with believable weight and grip; fingers, utensils, and food keep their shape throughout. " +
        "Water, steam, flame, and ingredients respond naturally to the action. " +
        "Camera locked: no camera shake, no zoom, no pan. " +
        "No morphing, no extra hands or fingers, no objects appearing or disappearing. " +
        HOLD_DESIGN,
      micro:
        "MOTION:\nAmbient motion at real-time speed. Rain falls, steam rises, flames flicker, curtains and leaves move in the air, light shifts. " +
        "Nothing is picked up or moved by hand. " +
        "Camera locked, or one slow push-in. " +
        "No camera shake, no morphing, no slow motion. " +
        HOLD_DESIGN,
      dialogue:
        "MOTION:\nQuiet, natural speech at normal speed. The speaker makes small head and hand movements; " +
        "anyone listening stays nearly still with soft eye reactions. " +
        "Camera locked. No walking, no broad gestures, no morphing. " +
        HOLD_DESIGN,
      emotional:
        "MOTION:\nA quiet moment of rest at natural speed. Breathing, a blink, the hands settling or a cup lifted to drink. " +
        "Ambient elements — rain, steam, light — keep moving softly in the background. " +
        "Very slow push-in or locked camera. No body relocation, no morphing. " +
        HOLD_DESIGN,
    },
    selectionRule:
      "Default to `normal` — in this style it covers every hand or process shot: washing, cutting, cooking, pouring, plating, eating. " +
      "Use `micro` for establishing shots and environment cutaways with no hand action (rain on a window, steam over a pot, a sleeping cat). " +
      "Use `emotional` for the quiet resting moment that closes a sequence, and `dialogue` only if someone actually speaks on camera.",
  },
];

// Explicit, not MOTION_STYLES[0] — history/visual-styles.md records the
// array-position fallback as a live footgun ("reordering silently restyles
// every story whose style was never set"). No reason to copy it here.
export const DEFAULT_MOTION_STYLE_ID = "natural";

export function isMotionMode(value: unknown): value is MotionMode {
  return MOTION_MODES.includes(value as MotionMode);
}

export function resolveMotionStyle(motionStyleId?: string | null): MotionStylePreset {
  return (
    MOTION_STYLES.find((s) => s.id === motionStyleId) ??
    MOTION_STYLES.find((s) => s.id === DEFAULT_MOTION_STYLE_ID)!
  );
}

// The only place a shot's motion paragraph comes from. Null mode (a shot
// generated before motion modes existed) resolves to the style's default
// rather than returning nothing — an old storyboard still copies with motion.
export function resolveMotionText(motionStyleId: string | null | undefined, mode: MotionMode | null): string {
  const style = resolveMotionStyle(motionStyleId);
  const resolved = mode && style.allowedModes.includes(mode) ? mode : style.defaultMode;
  return style.text[resolved];
}
