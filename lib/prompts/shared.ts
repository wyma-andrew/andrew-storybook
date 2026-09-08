// Style is passed to the model as context only — never as a literal tag to
// echo back. The app injects the actual style tag client-side at copy time,
// so a stored prompt stays reusable if the story's style is later changed.
export function styleContextBlock(styleContext?: string | null) {
  if (!styleContext) return "";
  return (
    `\n\nVisual Style Context: "${styleContext}"\n` +
    "(Note: Do NOT include explicit style keywords, camera technical terms, or rendering engine names in the generated text. " +
    "Use this style context ONLY to guide the mood, atmosphere, and descriptive detail choices — the literal style tag is injected separately by the app.)"
  );
}

// A location's realPrompt is fixed ground-truth geometry, reused across many
// separately-generated shots — free descriptive prose lets the storyboard
// step silently reinvent furniture position/facing-direction shot to shot
// (e.g. a sofa stated to face the kitchen doorway ends up facing away in a
// later shot). Forcing this structured format at extraction time, then
// forcing shots to restate the relevant subset (see
// locationSpatialConsistencyBlock below), is what actually holds it steady —
// not the model "remembering" a paragraph from earlier context.
export function locationSpatialLayoutBlock() {
  return (
    "\n\nLOCATION SPATIAL LAYOUT: every location's realPrompt must use this structured format, not free descriptive prose:\n" +
    "LOCATION: <name>\n\n" +
    "FIXED LAYOUT:\n" +
    "- <one bullet per fixed object/anchor point, each given a wall/compass direction or a position relative to another anchor, e.g. 'Main entrance: south wall', 'Sofa: center-west', 'Kitchen doorway: north wall'>\n\n" +
    "SPATIAL RULES:\n" +
    "- <one bullet per hard constraint on facing direction and relative position, e.g. 'Sofa faces north, toward the kitchen doorway.', 'Window remains on the sofa's right side.', 'Do not mirror or rotate the room layout between shots.'>\n\n" +
    "Still describe the EMPTY environment only (structure, materials, props) — never mention characters, people, animals, or anyone's action/pose/expression, even if the script's scene has them present. No camera, lighting, or style wording."
  );
}

// Companion to locationSpatialLayoutBlock, injected into the storyboard
// prompt — forces each shot to respect the location's spatial facts rather
// than trusting the model to carry them forward implicitly from the
// location's realPrompt given in Known Assets.
//
// Earlier this block asked each shot to restate the layout "using the SAME
// anchor points and directions", and shot prompts came out ending in a string
// of compass assertions ("the cot remains aligned north-south, the washbasin
// remains southeast, the entrance remains on the south wall"). Measured in
// practice, that made results WORSE once the location's reference image is
// attached: compass directions are not observable in an image, so reciting
// them makes the model re-derive the room instead of matching the reference,
// and every off-frame object named is one it tries to fit into the frame,
// widening the shot and shifting the layout. The compass layout is for
// choosing the viewpoint; the prompt describes what that viewpoint sees.
export function locationSpatialConsistencyBlock() {
  return (
    "\n\nLOCATION SPATIAL CONSISTENCY: the location's attached reference image is the visual truth for its architecture, materials, and prop placement. Its FIXED LAYOUT and SPATIAL RULES (given in its realPrompt, in Known Assets below) are a map for YOU — how the room is arranged, so you can place the camera and the characters in it — not text to copy into the image prompt. Compass directions are invisible in an image.\n" +
    "- Use the layout to DECIDE where the camera stands and what falls in frame. Then write the shot's `prompt` view-relatively: what is behind the character, what sits at frame left and frame right, what is in the foreground.\n" +
    "- Name ONLY what is actually visible in this shot's framing. Never list fixed objects that are out of frame — every object named is one the image model will try to fit in, which widens the framing and pulls the layout out of shape.\n" +
    "- Never write compass wording or continuity assertions into `prompt` — no 'aligned north-south', no 'the washbasin remains southeast', no 'the entrance remains on the south wall'. Continuity is recorded in startState/endState, which is where that wording belongs.\n" +
    "- Keep the layout itself unmirrored and unrotated across shots: a character standing west of the cot stays on the same side of it from shot to shot, so their screen position and facing must follow the layout even though the prompt never names the compass direction."
  );
}

// Myanmar-region prompt variants (extract-assets, regenerate-asset, storyboard)
// all inject this same block — keep it here as one shared source so it can
// never silently drop from a per-item call site (e.g. regenerating a single
// character/location, or a single shot).
// Output-language layer. The script can be written in any language, and the
// model was following the script's language into the fields it writes — a
// Burmese script produced Burmese realPrompts and shot prompts. Image and video
// models are trained overwhelmingly on English text, so a non-English prompt
// degrades the render. The dialogue is the one thing that must stay in the
// script's own language: it is what the character actually says on screen.
export function outputLanguageBlock() {
  return (
    "\n\nOUTPUT LANGUAGE: write EVERY field you generate in English, whatever language the script is written in. " +
    "This includes realPrompt, meta, label, beat, camera, startState/endState, scene title, and the motion description in videoPrompt. " +
    "Image and video generators are trained on English prompts — a prompt written in the script's language renders worse, so translate the script's meaning into English rather than copying its wording.\n" +
    "Two exceptions, both verbatim from the script in its ORIGINAL language, never translated:\n" +
    "- Any DIALOG line quoted inside a videoPrompt — it is the line the character speaks on screen. Keep the language tag that marks which language it is.\n" +
    "- Text quoted straight from the script rather than written by you: the scene `slug` (the [SCENE] heading as written) and a character's or location's `name` (the script's own cue/name spelling, so it keeps matching the script and the user's asset list). Everything you write ABOUT that name is still English."
  );
}

export function myanmarAdaptationBlock() {
  return (
    "\n\nMYANMAR VISUAL ADAPTATION\n" +
    "This story is set in Myanmar. Preserve the selected visual style while culturally adapting all generated assets to believable Myanmar life. " +
    "Do not treat \"Myanmar\" as one fixed visual template — first infer the visual context from the script, including: rural, town, suburban, or urban setting; " +
    "socioeconomic level; traditional, contemporary, or mixed lifestyle; occupation; age and generation; geographic/environmental context when supported; time period. " +
    "Use these inferred conditions to determine appropriate character appearance, clothing and footwear, architecture, construction materials, room layouts, furniture, " +
    "household objects, cooking equipment, appliances, vehicles, roads and infrastructure, and vegetation/surrounding environment.\n" +
    "Myanmar characters should naturally read as people from Myanmar within the selected animation style — do not create generic Western-looking characters and merely add Myanmar clothing. " +
    "Myanmar locations should naturally read as believable places in Myanmar, not generic Western or generic Southeast Asian environments.\n" +
    "Do not automatically represent Myanmar as poor, rural, traditional, old-fashioned, or undeveloped. Likewise, do not automatically modernize Myanmar environments into Western-style homes or cities — " +
    "let the script determine socioeconomic level and lifestyle. For example: a modest rural farming family should have practical, affordable, lived-in housing, clothing, furniture, tools, and household objects " +
    "appropriate to their circumstances; a middle-income urban family may have contemporary Myanmar clothing, modern appliances, concrete housing or apartments, and appropriate urban furnishings; an affluent family " +
    "may have higher-quality architecture, technology, vehicles, clothing, and interiors while still remaining culturally believable for Myanmar.\n" +
    "Do not add stereotypical cultural symbols simply to make the image look Myanmar. Longyi, thanaka, bamboo objects, clay pots, pagodas, rice fields, traditional houses, and similar elements should appear only " +
    "when appropriate to the specific character, location, activity, period, and socioeconomic context.\n" +
    "Cultural adaptation must modify the CONTENT of the image, not replace the selected visual style. The final result should feel like this specific Myanmar story designed inside the project's established " +
    "visual style/universe. Preserve culturally authentic visual identity through stylization rather than replacing it with generic animated design."
  );
}

// Companion to locationSpatialLayoutBlock, for characters. Same reasoning:
// a character's realPrompt is reused across many separately-generated shot
// images, and free prose ("brown hair, casual outfit") gives the storyboard
// step nothing stable to copy — it paraphrases, and the face/wardrobe drifts
// shot to shot. Splitting invariant traits (IDENTITY/WARDROBE LOCK) from the
// per-shot ones (VARIABLE) is what gives identityAnchorBlock below a bounded
// clause to restate verbatim instead of a paragraph to reinterpret.
export function characterIdentityBlock() {
  return (
    "\n\nCHARACTER IDENTITY LOCK: every character's realPrompt must use this structured format, not free descriptive prose:\n" +
    "CHARACTER: <name>\n\n" +
    "IDENTITY LOCK:\n" +
    "- <5-8 short bullets of invariant physical traits that must never change between shots: apparent age, build and height, skin tone, face shape, eye shape and color, hairline and hairstyle, distinguishing marks (scar, freckles, glasses)>\n\n" +
    "WARDROBE LOCK:\n" +
    "- <structural garment wording — cut, fabric, color, closures, footwear, accessories. e.g. 'Cropped blue denim jacket, silver buttons', 'White crew-neck shirt', 'Black straight-leg trousers', 'Red canvas shoes'. Never vague wording like 'casual outfit' or 'simple clothes'>\n\n" +
    "VARIABLE:\n" +
    "- <only what legitimately changes shot to shot: expression, pose, gaze direction>\n\n" +
    "Keep every IDENTITY LOCK and WARDROBE LOCK bullet short and self-contained — this text generates the character's reference sheet, which is then attached to every shot the character appears in, so each bullet must read correctly out of context. No camera, lighting, or style wording."
  );
}

// Companion to characterIdentityBlock, injected into the storyboard prompt.
//
// This block used to require copying a character's IDENTITY/WARDROBE LOCK
// bullets verbatim into every shot prompt. That was right while a shot image
// was generated from text alone. It is wrong now that the shot is generated
// with the character and location reference images attached (that is what
// assetsUsed is for): a paragraph re-describing a face competes with the
// picture of that face, and the render drifts away from the reference instead
// of matching it. The locks still matter — they are what the character's
// reference sheet is generated FROM. They just don't belong in the shot text.
export function identityAnchorBlock() {
  return (
    "\n\nREFERENCE IMAGES ARE THE VISUAL TRUTH: every shot's image is generated with the reference images of the characters and location listed in that shot's assetsUsed attached to it. Those images define character design, face, build, wardrobe, and the location's architecture, materials, and prop placement. The shot's `prompt` does NOT re-describe any of that.\n" +
    "- Write `prompt` as the DELTA for this shot — what is true of THIS moment and nothing else: who is in frame, what they are doing (action, pose, gesture), their expression and gaze direction, where they stand within the space in view-relative terms, and the framing/composition.\n" +
    "- Name each character by the exact name used in Known Assets and leave their appearance to their attached reference. Do NOT copy IDENTITY LOCK or WARDROBE LOCK bullets into `prompt`, and do not paraphrase them either — describing in words what the attached image already shows is what pulls the render off its reference.\n" +
    "- The one exception is a VISIBLE CHANGE from the reference that this shot's script calls for — a bandaged limb, a removed jacket, soaked clothes, dirt, an injury. That is a delta, so state it explicitly and briefly. Everything unchanged stays unsaid.\n" +
    "- Never invent a physical or wardrobe detail that is not in the character's locks and not called for by the script. If a shot seems to need one, omit it — it belongs in the asset's locks, which regenerate the reference sheet, not in one shot's text."
  );
}

// The article-style "state ledger": what is worn/held/placed at the end of a
// shot is ground truth for the start of the next one. Without this, each shot
// is generated in isolation and props teleport between them. Deliberately
// reuses the location's SPATIAL RULES anchor names rather than introducing a
// second position vocabulary.
export function stateLedgerBlock() {
  return (
    "\n\nSHOT STATE LEDGER: every shot carries a startState and an endState — a compact, factual continuity line (not prose) covering wardrobe state, objects held or carried and in which hand, where objects have been placed, and the character's position relative to a NAMED anchor from that location's FIXED LAYOUT. " +
    "e.g. 'jacket zipped, backpack on left shoulder, phone in right hand, standing south of the oak table'.\n" +
    "- A shot's startState MUST be identical to the previous shot's endState, unless the script's [ACTION] between them explicitly changes something. Only the changed facts differ; carry everything else across word for word.\n" +
    "- The first shot of a scene establishes the state. Later shots inherit it and mutate only what the script says changes.\n" +
    "- endState equals startState when the shot's action changes nothing physical (a reaction shot, a line of dialogue with no movement).\n" +
    "- Position wording must reuse the same anchor names and directions given in that location's SPATIAL RULES — never invent a new anchor.\n" +
    "- The ledger is a cross-check on the prompt, never text to paste into it. A startState fact reaches `prompt` only when it is a delta from the attached references — an object held or placed, a wardrobe change, where the character stands — and then in view-relative wording (behind, frame left/right, foreground), never as compass wording. What the references already show is not restated.\n" +
    "- When there are no characters or props in a shot (an empty establishing frame), state the environment's variable facts instead (e.g. 'door closed, lamp off') or 'no characters present'."
  );
}

// Shot-economy layer. Measured on generated storyboards: dialogue scenes were
// producing runs of shots that shared one frozen continuity state and differed
// only by the `camera` string — four separate image + video generations of the
// same tableau. Camera wording alone does not survive into separately-generated
// images, so those shots read as near-duplicates. This block makes every shot
// name what it adds, and caps how many can add nothing physical.
export function shotDistinctnessBlock() {
  return (
    "\n\nSHOT ECONOMY (every shot must earn its own generation): each shot costs the user one image generation plus one video generation, so no two consecutive shots may be the same moment re-labelled.\n" +
    "- `beat` is mandatory and must name the script line(s) the shot covers AND what it shows that the previous shot did not. If the only honest answer is 'the same moment from another angle', do not emit the shot — fold it into the previous one.\n" +
    "- STATIC-TABLEAU BUDGET: a shot is static when its endState equals its startState AND its startState equals the previous shot's endState — nothing in the scene physically changed. At most TWO static shots may run back-to-back. The third consecutive shot in a scene must either carry a real state change (someone moves, picks something up, sets something down, enters or leaves frame, changes posture or facing) or the shots must be merged into one longer shot.\n" +
    "- A static shot is allowed at all only when it carries a distinct [DIALOG] line or a specific named reaction, and its own `prompt` text must show the difference visibly — a different subject, a different expression, a different framing distance, more or less of the environment. Changing only the `camera` field is NOT a difference: `camera` is metadata for the user, it does not reach the image model, so two shots whose `prompt` text describes the same subject in the same pose at the same distance will generate two near-identical images no matter what `camera` says.\n" +
    "- Prefer one shot holding a two-line exchange over two static shots of two talking heads, unless the reverse angle genuinely shows something new (the listener's reaction, a hidden object, a new part of the space).\n" +
    "- This never overrides MOTION DISCIPLINE: keep splitting shots that stack multiple physical actions, and keep splitting long dialogue. Split on change, not on angle."
  );
}

// Temporal-motion layer. AI video generators flicker and produce elastic
// limbs when a single clip is asked to cover several interactions at once,
// or when complex subject motion is combined with a complex camera move.
// Same direction as the videoPrompt IP-filter note in the storyboard prompt
// (restraint in action description), different reason.
export function motionDisciplineBlock() {
  return (
    "\n\nMOTION DISCIPLINE (videoPrompt): AI video generators flicker, warp hands, and produce elastic limbs when one clip is asked to do too much. Keep every videoPrompt disciplined:\n" +
    "- ONE primary action per shot. Never stack multiple interactions ('picks up the cup, turns, walks to the door, opens it') into a single videoPrompt — split them into separate shots, the same way long dialogue is split.\n" +
    "- Use physically clear, concrete verbs: reaches, grips, lifts, turns, sets down, releases, steps, leans. Avoid vague verbs like 'interacts with', 'moves about', 'engages', 'goes about'.\n" +
    "- Camera-motion budget: when the subject's motion is complex, hold the camera static or give it at most one slow, simple move. Never combine complex subject motion with a complex camera move in the same clip.\n" +
    "- State that the character's design, wardrobe, and the environment layout must remain unchanged for the whole clip — the motion prompt animates the Start Frame, it never redesigns it.\n" +
    "- Prefer a shorter durationS over cramming more action in; short, reliable clips edited together beat one long generation."
  );
}
