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
// prompt — forces each shot to restate the relevant spatial facts rather
// than trusting the model to carry them forward implicitly from the
// location's realPrompt given in Known Assets.
export function locationSpatialConsistencyBlock() {
  return (
    "\n\nLOCATION SPATIAL CONSISTENCY: a location's FIXED LAYOUT and SPATIAL RULES (given in its realPrompt, in Known Assets below) are fixed ground truth for every shot set there. " +
    "For every shot whose assetsUsed includes a location, restate — directly inside that shot's own `prompt`/`endFramePrompt` text — the specific spatial facts relevant to that shot's framing (which direction a character faces relative to a named fixed object/doorway, what's on their left/right), using the SAME anchor points and directions given in that location's SPATIAL RULES. " +
    "Never invent, mirror, rotate, or rearrange a location's stated layout across shots, even for a different camera angle or a wide vs. close framing."
  );
}

// Myanmar-region prompt variants (extract-assets, regenerate-asset, storyboard)
// all inject this same block — keep it here as one shared source so it can
// never silently drop from a per-item call site (e.g. regenerating a single
// character/location, or a single shot).
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
