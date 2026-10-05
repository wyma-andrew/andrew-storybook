// Appended to the cinematic storyboard prompt, never a replacement for it: the
// continuity rules there (site map, state ledger, layout anchors, lighting,
// shot scale) are exactly what keeps a POV routine consistent shot to shot.
// This block only overrides coverage, pacing, and adds sound.
export function cozyAsmrFormatBlock() {
  return (
    "\n\nSTORY FORMAT — COZY POV ASMR. This chapter is a calm first-person daily-routine video (cooking, washing, tidying, making tea, watching rain), not a dialogue drama. " +
    "Where a rule above conflicts with this block, this block wins.\n" +
    "- POINT OF VIEW: the viewer IS the protagonist. Most shots are first-person POV — only the protagonist's hands and forearms (with the sleeves, apron, or accessories from their character asset) are visible, never their face. " +
    "Show the protagonist in third person only when the script explicitly calls for it, and then from behind or with the face out of frame. List the protagonist's character asset in assetsUsed on every shot where their hands or sleeves are visible.\n" +
    "- PROCESS: break every [ACTION] into its physical steps and give each step its own shot — pick up, rinse, slice, tip into the pan, stir, plate. Every shot must show a visible change of state; the continuity ledger tracks each ingredient and object through those states (whole → sliced → in the pan → cooked → on the plate).\n" +
    "- COMPOSITION RHYTHM: rotate framings the way a cozy routine edit does — wide establishing of the space, POV close-up of the hands, top-down overhead of the work surface, low side close-up at counter level, environment cutaway (rain on the window, steam over a pot, flame under the kettle, a pet asleep), and a finished-result shot. Never three shots of the same framing in a row. Insert an environment cutaway roughly every four to six process shots. " +
    "The establishing rule above still applies to a new space, but it pins anchors, not characters — there is usually no one else to place.\n" +
    "- PACING: durationS is 3–5 seconds for almost every shot (2 minimum, 6 maximum). Aim for roughly 12–18 shots per minute of routine; a short script still gets every step it implies.\n" +
    "- START FRAME: a POV shot's prompt opens with its framing and the hands — 'First-person POV close-up of hands rinsing ripe tomatoes in a wooden basin…', 'Top-down view of a worn wooden cutting board with…'. Describe food, utensils, water, steam, and materials with tactile, appetizing detail. Never text, captions, or subtitles in frame.\n" +
    "- VIDEO PROMPT: one small, slow physical action continuing from the Start Frame — a stir, a pour, a slice, steam drifting. No dialogue unless the script has a [DIALOG] line.\n" +
    "- ENDING: the chapter's final shot is a calm, lingering resting moment — tea by a rain-streaked window, the finished meal on the table, a cat asleep by the stove — even if the script's last line is a process step. It should make the viewer want to stay in this world.\n" +
    "- SOUND (soundPrompt): every shot gets a sound-design line, in English, as comma-separated concrete sources: first the 1–3 foreground foley sounds tied to the visible action (knife tapping a wooden board, water pouring into a basin, oil sizzling), then the scene's continuous ambience bed (steady rain on a tin roof, distant birds, a crackling stove). " +
    "Keep the ambience bed worded identically across every shot of a scene so the cuts do not jump. No music, and no voices unless the shot has dialogue."
  );
}

export const SOUND_PROMPT_PROPERTY = {
  type: "string",
  description:
    "Sound design for this clip: foreground foley tied to the visible action, then the scene's ambience bed. Comma-separated concrete sources, English, no music. See SOUND below.",
} as const;
