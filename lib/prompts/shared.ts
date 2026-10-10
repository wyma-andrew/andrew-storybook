import type { Region } from "../constants/regions";
import { resolveMotionStyle } from "../constants/motion-styles";

// Style is passed to the model as context only — never as a literal tag to
// echo back. The app injects the actual style tag client-side at copy time,
// so a stored prompt stays reusable if the story's style is later changed.
export function styleContextBlock(styleContext?: string | null) {
  if (!styleContext) return "";
  return (
    `\n\nVisual Style Context: "${styleContext}"\n` +
    "(Note: Do NOT include explicit style keywords, camera technical terms, or rendering engine names in the generated text. " +
    "Use this style context ONLY to guide the mood, atmosphere, and descriptive detail choices — the literal style tag is injected separately by the app. " +
    // A style text describing a restrained look ("keep environments modest,
    // functional") was being read as a scale instruction, so a historically
    // large place came back compact. Style governs look; scale has other sources.
    "Style context governs LOOK ONLY — mood, lighting feel, materials, finish, and level of detail. It never decides a place's physical scale, footprint, number of buildings, or social status, and never a character's status: those come from the script and from the cultural/historical adaptation rules below. If the style wording suggests modesty or restraint, apply it to finish and ornament, never to size.)"
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
//
// STRUCTURE SHELL is the location's equivalent of a character's IDENTITY
// LOCK: the built facts that are true from every camera position. It exists
// because a place shown from two sides (a house's front and its back) was
// being extracted as two unrelated locations, each generating its own roof
// pitch, wall material and scale — nothing shared meant nothing to agree on.
// One place is one location with a VIEWS list, and the shell is what every
// view's generation copies verbatim (see SYSTEM_PROMPTS.locationAltAngle).
//
// VIEWS bullets carry frame-left/frame-right, not just compass directions.
// Measured: a rear view came back mirrored — granary on the wrong side —
// while the prompt said "Rear view from north" and SPATIAL RULES said "do not
// mirror". Neither helps, for the reason already established for shot prompts
// in locationSpatialConsistencyBlock: a compass direction is not observable in
// an image, so it cannot be matched or violated. Frame sides are. The compass
// stays as the source the sides are derived FROM, and both are written down so
// a wrong derivation is visible in the text rather than only in the render.
export function locationSpatialLayoutBlock() {
  return (
    "\n\nLOCATION SPATIAL LAYOUT: every location's realPrompt must use this structured format, not free descriptive prose:\n" +
    "LOCATION: <name>\n\n" +
    "STRUCTURE SHELL:\n" +
    "- <3-6 short bullets of invariant BUILT facts, true from every vantage point and never changing between images: storey count and height, footprint and overall scale, foundation type (slab/stilts/plinth), roof form + pitch + material + colour, wall material + finish + colour, condition and weathering. For a pure interior, give the room shell instead: ceiling height and form, wall finish and colour, floor material, window/door frame material. Never vague wording like 'wooden house' or 'old walls'>\n\n" +
    "FIXED LAYOUT:\n" +
    "- <one bullet per fixed object/anchor point, each given a wall/compass direction or a position relative to another anchor, e.g. 'Main entrance: south wall', 'Sofa: center-west', 'Kitchen doorway: north wall'. A relative position names the side: 'on the path directly west of the tomato bed', never a bare 'beside the vegetable beds' or 'near the door' — a vague bullet leaves the side to whoever draws the shot, and each shot then picks its own>\n\n" +
    "VIEWS:\n" +
    "- <include this section ONLY when the script shows this place from more than one side or vantage (a house seen from the front and from the rear, a yard and the veranda facing it). One bullet per view, keyed to a FIXED LAYOUT direction and naming ONLY what is visible from that vantage. Each bullet must ALSO place what it names in FRAME-RELATIVE terms — what sits at frame left, what sits at frame right, what fills the frame — because a compass direction cannot be seen in an image and is therefore no defence against the view coming back mirrored. Work each one out from the FIXED LAYOUT: standing north of a place and looking south puts east at frame left and west at frame right; standing south and looking north puts west at frame left and east at frame right. State the view straight-on unless the script needs otherwise. e.g. 'Front view from south, camera looking north, house straight-on: entrance stair and main door center frame, veranda across the front, shrine shelf at frame right (east), forecourt in the foreground.', 'Rear view from north, camera looking south, back wall straight-on: rice granary at frame left (northeast), firewood rack and water jar stand at frame right (west and northwest), rear yard in the foreground.'. CROSS-CHECK every bullet before writing it: two views that look in OPPOSITE compass directions must put the same object on OPPOSITE frame sides. An object east of the place is at frame left in a view looking south and at frame right in a view looking north. If your two bullets put one object on the same frame side in both, one of them is derived backwards — redo it. At most 3 views — they are rendered as side-by-side panels of one reference image, so a fourth leaves each too small to be usable; keep the views the script actually shoots from and drop the rest. Omit the whole section when a single view covers the place>\n\n" +
    "SPATIAL RULES:\n" +
    "- <one bullet per hard constraint on facing direction and relative position, e.g. 'Sofa faces north, toward the kitchen doorway.', 'Window remains on the sofa's right side.', 'Do not mirror or rotate the room layout between shots.'. When VIEWS is present, add one bullet restating each view's frame-left/frame-right assignment as a rule, since that is the form the image model can actually be held to>\n\n" +
    "SPACE KIND: set spaceKind to 'interior' when the location is an enclosed space seen from within (a room, a shop floor, a vehicle interior), and to 'exterior' when it is an outdoor place or a building seen from outside (a yard, a street, a house compound). The app picks a different reference-image preset and a different plan drawing from this field, so it must agree with what STRUCTURE SHELL describes. The inside and the outside of the same building are two locations, each with its own spaceKind.\n" +
    "PLACES PEOPLE MOVE ALONG: when the location is a path, road, trail, riverbank, street, or corridor — anything characters travel along rather than stand in — the first FIXED LAYOUT bullet names its two ends after what each leads to, with their directions. Every fixture along it is then placed by which end it is nearer and which side of the path it is on. Those end names are what shots and continuity use to say which way someone is going and who is ahead.\n" +
    "Different sides or faces of ONE physical place are VIEWS of a single location, never separate locations — a house's front and its back yard share one STRUCTURE SHELL and one FIXED LAYOUT, and splitting them into two location entries is exactly what makes the two images disagree. Split into separate locations only when the spaces are genuinely separate: an interior room versus the exterior, or one room versus another.\n" +
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
// THE REFERENCE STATION describes the camera lines of locationExterior /
// locationInterior in lib/constants/system-prompts.ts. Change one, change both.
export function locationSpatialConsistencyBlock() {
  return (
    "\n\nLOCATION SPATIAL CONSISTENCY: the location's attached reference image is the visual truth for its architecture, materials, and prop placement. Its FIXED LAYOUT and SPATIAL RULES (given in its realPrompt, in Known Assets below) are a map for YOU — how the room is arranged, so you can place the camera and the characters in it — not text to copy into the image prompt. Compass directions are invisible in an image.\n" +
    "- THE REFERENCE STATION. Every location's reference image was rendered from one known station: an exterior from eye height inside the grounds, facing the main structure's front face, far enough back to see it whole; an interior from eye height just inside the main entrance, looking across the room. When a shot's camera stands at that same station — most establishing and wide shots of a place — open with the framing, then write 'from the same viewpoint as the attached location reference', then describe ONLY what this shot adds or changes: the characters, their action and position (by the fixture they are at and its frame side, e.g. 'Mya bending toward the tomato bed at frame left'), weather, doors or lamps, and container fill state. Do NOT re-list the fixtures, the path, or the frame sides of the whole space in that case: the reference already fixes them, and re-describing the composition makes the image model rebuild the view from your words — a new camera height, a new angle, beds pushed apart to fit your sentence — instead of keeping the reference's. The station, frame-side, and background rules below apply only when the camera stands somewhere else.\n" +
    "- STATION PLATES: a shot is generated with the empty plate image of its site-map station attached as its location reference (assetsUsed.station). The 'reference' station's plate is the location reference image itself; every other station has its own plate rendered from that station's `view`. So every shot is written AT its station: stand where that station's view stands, look where it looks, and treat its plate exactly as THE REFERENCE STATION rule above treats the reference image — 'from the same viewpoint as the attached location reference', then only what the shot adds. Framing may tighten from the station (a medium or close shot from the same position), but the camera never leaves it; when a beat needs another direction, put the shot at a station that looks that way, and when the characters have moved on along a path, put it at the station at their new position, not back at the one beside a landmark they have left behind. The station is decided by the direction the CAMERA LOOKS: an over-the-shoulder or reverse from behind a character looks the way that character faces, so it belongs to the station looking that way. In a face-off along a path the two characters face opposite ends, so their two over-the-shoulders are two stations — never both 'reference'. Frame sides come from the station's `view`, never from the reference image when the station is not 'reference'.\n" +
    "- Use the layout to DECIDE where the camera stands and what falls in frame. Then write the shot's `prompt` view-relatively: what is behind the character, what sits at frame left and frame right, what is in the foreground.\n" +
    "- STATE THE CAMERA STATION. Directly after the opening framing and subject, say where the camera stands and which way it looks, named against things the picture shows — 'from the doorway end of the hall, looking toward the far end wall', 'from beside the loom, looking back across the room at the entrance'. Never a compass bearing. A frame-left / frame-right claim is only true from a stated station, and with no station the image model picks its own, then moves the furniture to satisfy the frame sides you asked for. Name the direction the camera looks against a FIXED structure (the cottage and its porch, the far end wall, the gate) — never against a movable prop (a basket, a stool, a pot), which fixes no direction because it can sit anywhere.\n" +
    "- ON CLOSE AND MEDIUM SHOTS, NAME THE BACKGROUND. When a large fixed structure of the location falls behind the subject from the stated station, name that one structure with its frame side and keep it soft — 'the cottage's small covered porch soft and out of focus behind her at frame right'. A close shot with an unnamed background is filled by the image model with a building of its own design, which is what makes the same place look different from shot to shot. Name only the one structure that is actually behind the subject, never a list.\n" +
    "- DERIVE FRAME SIDES FROM THAT STATION, then check them. For every fixed object and character you place at frame left, frame right, or centre, confirm that is where it falls from the station you just stated, given the layout. If a fixture is dead centre from that station, say centre — do not push it to a side. When the beat needs it on a side, move the CAMERA to a station where it is on that side and state that station instead.\n" +
    "- NAME A FIXTURE WITH ITS ANCHOR, AS SOMETHING ALREADY STANDING THERE — 'the low wooden platform against the far end wall', 'the water pot beside it'. A fixture named bare ('on the teaching platform', 'by the shrine') reads as an object to add: the image model builds a second one at the frame side you asked for and leaves the original where the reference put it.\n" +
    "- Name ONLY what is actually visible in this shot's framing. Never list fixed objects that are out of frame — every object named is one the image model will try to fit in, which widens the framing and pulls the layout out of shape.\n" +
    "- State the room's contents affirmatively when the framing shows much of the space: 'the hall holds the mat rows, the platform against the far wall, and the water pot beside it' — a positive list of what IS there holds the room better than any instruction not to add furniture.\n" +
    "- Never write compass wording or continuity assertions into `prompt`. No 'aligned north-south', no 'the washbasin remains southeast', no 'the entrance remains on the south wall' — and equally no 'keeps the established spatial relationship', 'matching the reference layout', 'consistent with the previous shot', 'the mat and platform stay as before'. An image model cannot act on a claim about another image; the clause only spends attention and leaves the object it names unplaced. The single exception is the exact phrase 'from the same viewpoint as the attached location reference' under THE REFERENCE STATION above — that names the attached picture's camera, not a claim about a previous shot. State where things ARE in this frame, or leave them out. Continuity is recorded in startState/endState, which is where that wording belongs.\n" +
    "- Keep the layout itself unmirrored and unrotated across shots: a character standing west of the cot stays on the same side of it from shot to shot, so their screen position and facing must follow the layout even though the prompt never names the compass direction."
  );
}

// Myanmar-region prompt variants (extract-assets, regenerate-asset, storyboard)
// all inject this same block through regionAdaptationBlock below.
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

// Historical Buddha-era mode is deliberately narrower than a generic
// "Buddhist" aesthetic. It guides content toward the Buddha's lifetime in the
// northern Indian subcontinent and blocks later pan-Asian visual conventions;
// the selected visual style still controls how that content is rendered.
export function buddhaAdaptationBlock() {
  return (
    "\n\nBUDDHA-ERA VISUAL ADAPTATION\n" +
    "This story is set in the historical world of Gautama Buddha in the northern Indian subcontinent, centered on the middle Gangetic regions associated with places such as Magadha, Kosala, Vajji, and the Sakya homeland. Preserve the selected visual style while grounding all generated content in that ancient South Asian setting. " +
    "Infer the specific location, community, social position, occupation, and stage of the Buddha's life from the script. When the script is not specific, prefer restrained, plausible material culture rather than a decorative mixture of later Buddhist traditions.\n" +
    "Characters should read as ancient South Asian people appropriate to their community and circumstances. Distinguish householders, rulers, merchants, farmers, craftspeople, ascetics, and monastics through plausible grooming, unstitched or simply constructed garments, textiles, ornaments, footwear, and carried objects. Monastic clothing should be simple wrapped robes in restrained earth, ochre, or saffron tones unless the script says otherwise.\n" +
    "RECOGNIZABLE BUDDHA IDENTITY: when a character is Gautama Buddha, the Buddha, the Blessed One, or the equivalent title in the script's language, keep CHARACTER as the exact script name and add `KNOWN IDENTITY: Siddhartha Gautama (Gautama Buddha)` immediately beneath it. This canonical identity is prompt context only; never rename the extracted asset. Make him unmistakably recognizable rather than an ordinary monk. Unless the script explicitly depicts Prince Siddhartha before renunciation, his IDENTITY LOCK must specify a serene symmetrical South Asian face, idealized dignified mature-adult appearance without inventing a precise age, an ushnisha-shaped cranial prominence covered in compact dark snail-shell curls, a subtle urna centered between the brows, elongated earlobes, calm downcast or gently focused eyes, and graceful balanced proportions. His WARDROBE LOCK must specify a refined but unadorned saffron, ochre, or warm earth monastic robe with elegant folds and no jewelry or crown. Do not describe him with a receding hairline, balding scalp, ordinary close-cropped hair, or a contemporary monk appearance. A restrained circular halo or soft radiance is allowed when compatible with the selected style, but it must remain subtle rather than becoming a fiery or ornamental spectacle. Do not give the Buddha's ushnisha, urna, canonical curls, or halo to disciples or ordinary monks. If the script explicitly shows Prince Siddhartha before renunciation, follow that stage instead and retain his appropriate princely hair, clothing, and ornaments. When the script shows both stages, they are two LOOKS of one character: the princely hair, clothing, and ornaments go in the prince look, the canonical marks and robe in the Buddha look, and IDENTITY LOCK keeps only what both share.\n" +
    "KNOWN PLACE SCALE: when the script names a canonically identifiable site of the Buddha's world — Jetavana at Savatthi, Veluvana at Rajagaha, a named great hall, a royal palace, or a capital city — recognized under ANY script language, spelling, or transliteration (Burmese ဇေတဝန်, Pali/Sanskrit Jetavana or Jetavanarama, \"Anathapindika's monastery\", and the equivalents in other languages all name the same place) — its scale, patronage, and construction quality must follow what that place is recorded to be, not the restraint default. A monastery donated by a wealthy patron such as Anathapindika is a large walled monastic complex: many separate dwelling halls and huts spread across cleared, planted grounds, a spacious assembly hall, gateways, prepared or paved walking paths, wells and water tanks, and mature grove trees — never a single village hut or one small compound. Do not level such a place down to generic rural modesty, and do not write 'modest scale' or 'keep the compound modest' into its STRUCTURE SHELL or SPATIAL RULES. The restraint default still governs unnamed, ordinary, and rural places. Grander here means larger footprint, more buildings, better carpentry and masonry, and more orderly planning — using the same period-plausible materials (dressed timber, mud and fired brick, thatch or tile over timber framing, stone paving and plinths). It never means later-era Asian temple aesthetics, gilding or golden ornament, multi-tiered pagoda roofs, upturned eaves, stupas, or towering devotional statues.\n" +
    "CANONICAL SITE DETAIL: restraint applies to ornament and later-era styling, NEVER to historical specificity. For a named identifiable site, use what the early Buddhist tradition actually records about THAT place and name its recorded features, instead of writing a generic ancient-Indian equivalent. Give the canonical Pali term with a short plain gloss on first use, then use it as the feature's name: 'Gandhakuti (the Fragrant Hut, the Buddha's own dwelling)', 'cankama (a straight, prepared walking-meditation path)', 'mandalamala / upatthanasala (the open pavilion where the community gathers)', 'jantaghara (the hot bathhouse)', 'vihara' for a residential hall, 'kuti' for a single dwelling hut. The Gandhakuti is the Buddha's personal dwelling and stays a single modest hut — it is NOT the assembly building, and must not be enlarged into a great hall. For Jetavana at Savatthi specifically: the grove Anathapindika bought from Prince Jeta, who kept the entrance for himself and built the gateway; its recorded features include the Gandhakuti, the Kosambakuti, Karerikuti and Salalaghara dwellings, the Kareri mandalamala pavilion, refectory and storerooms, the jantaghara, wells and lotus ponds, cankama walking paths, and the Ananda Bodhi tree planted at the entrance. Do NOT invent canonical names for a site the tradition does not record them for, and never coin a Pali-sounding label to make a place sound authentic — where the record is silent or you are unsure, describe the feature plainly in English instead.\n" +
    "CANONICAL HISTORICAL DETAIL: the same specificity applies beyond places. Before writing any character, prop, or scene, recall what the early Buddhist tradition (the Pali Canon and its commentaries) records about the named people, objects, and episodes in the script, and use those facts instead of generic period filler. For a named figure — Sariputta, Moggallana, Ananda, Kassapa, Anathapindika, Visakha, Bimbisara, Pasenadi, Yasodhara, Mahapajapati Gotami, Angulimala, Devadatta, and others, under any script language or spelling — ground their caste and community, occupation, wealth, lay or monastic status, and life stage at that point in the story in the record, and let that drive grooming, garments, ornaments, and carried objects. For a recorded object (the alms bowl, robes and the monastic requisites, a royal parasol, Anathapindika's gold coins laid across Jetavana) use its recorded form and use. For a recorded episode (the first sermon at Isipatana, the conversion of Angulimala, the gift of Jetavana) use its recorded setting, who was present, and its season or hour when the tradition states one. The script stays the authority on what happens: recalled history fills in how things looked, never adds, removes, or reorders events. The same guard as above applies — never invent a name, relationship, epithet, or Pali term the tradition does not record; where you are unsure, describe plainly instead.\n" +
    "Locations and props should use plausible period materials and forms: timber, earth, mud brick, fired brick where appropriate, thatch, woven fiber, stone, clay, wood, and metalwork suited to the object's status and use. Let the script distinguish villages, forests and groves, roads, courts, cities, dwellings, gathering halls, and monastic places. Do not turn every location into a temple or add stupas, pagodas, giant devotional statues, elaborate later monasteries, or modern infrastructure unless the script explicitly calls for them.\n" +
    "Exclude anachronistic clothing, buildings, vehicles, plastics, electric lighting, printed signage, and modern devotional objects. Avoid blending Indian, Tibetan, Chinese, Japanese, Thai, or Myanmar conventions into a generic fantasy Buddhism. Apart from the Buddha's canonical identity marks above, sacred symbols such as the Bodhi tree, Dharma wheel, lotus, empty throne, footprints, or parasol should appear only when the scene or story context supports them. " +
    "Historical adaptation changes the CONTENT of the image, not the selected visual style. Keep the result respectful, lived-in, specific to the script, and visually coherent rather than uniformly royal, golden, supernatural, or ceremonial."
  );
}

export function regionAdaptationBlock(region: Region) {
  if (region === "myanmar") return myanmarAdaptationBlock();
  if (region === "buddha") return buddhaAdaptationBlock();
  return "";
}

// Extraction used to key off surface words: a [SCENE] heading or a noun in an
// action line became an asset, so one heading word (FOREST) collapsed several
// spots into one location and a passing mention became a prop. See
// history/asset-extraction.md, 2026-10-10.
export function storyComprehensionBlock() {
  return (
    "\n\nREAD THE STORY, NOT THE KEYWORDS: decide assets from what the story shows happening, never from words that merely appear in it.\n" +
    "- A scene heading says where a scene is set, but it is not proof of a separate place. Decide each scene's physical place from its action lines, dialog, and events. Two scenes are one location when the story puts them in the same physical spot — the same landmarks, the same layout, characters returning there — even under different headings or wording. One heading word (FOREST, VILLAGE, ROAD, HOUSE) covers several locations when the action stages scenes in clearly different spots, such as a hideout deep in the forest and the road through it where travelers pass.\n" +
    "- Build every asset from ALL the scenes it appears in: merge what each scene shows about it — features, condition, contents, how it is used — instead of describing it from its first mention or from its name alone.\n" +
    "- A person, place, or object that is only mentioned in dialog or recalled, and that no scene action or Voice Over narration actually shows, is not an asset.\n" +
    "- A prop is an object the story gives a role — handled, given, used, fought over, or recurring with meaning — not every object noun in an action line."
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
    "CHARACTER: <exact name from the script>\n" +
    "KNOWN IDENTITY: <established real or canonical name in English, only when the character is an unambiguously identifiable historical, religious, or public figure; omit this entire line for fictional, ambiguous, or unknown characters. This is image-generation context only and must never replace or translate CHARACTER or the extracted asset name>\n\n" +
    "IDENTITY LOCK:\n" +
    "- <5-8 short bullets of invariant physical traits that must never change between shots: apparent age, build and height, skin tone, face shape, eye shape and color, hairline and hairstyle, distinguishing marks (scar, freckles, glasses)>\n\n" +
    "WARDROBE LOCK:\n" +
    "- <structural garment wording — cut, fabric, color, closures, footwear, accessories. e.g. 'Cropped blue denim jacket, silver buttons', 'White crew-neck shirt', 'Black straight-leg trousers', 'Red canvas shoes'. Never vague wording like 'casual outfit' or 'simple clothes'>\n\n" +
    "VARIABLE:\n" +
    "- <only what legitimately changes shot to shot: expression, pose, gaze direction>\n\n" +
    "Keep every IDENTITY LOCK and WARDROBE LOCK bullet short and self-contained — this text generates the character's reference sheet, which is then attached to every shot the character appears in, so each bullet must read correctly out of context. No camera, lighting, or style wording."
  );
}

// One character, one reference sheet broke down for anyone whose appearance
// changes: the extraction wrote "Before conversion: … / After conversion: …"
// into a single WARDROBE LOCK, and every shot got the same sheet. See
// history/character-looks.md.
export function characterLooksBlock() {
  return (
    "\n\nCHARACTER LOOKS: a character whose appearance changes LASTINGLY across the story — a time skip, renunciation or ordination, a fall into outlaw or wild life, imprisonment, a disguise held across scenes, a lasting injury, visible aging — gets one LOOK per stage, so each stage gets its own reference sheet. Find the stages from the character's arc across the scenes. A temporary state inside a scene (wet, bloodied, dusty, crying, a torn sleeve) is not a look; it stays a shot-level detail. A character with one appearance throughout gets looks: [] and the format above unchanged.\n" +
    "When looks is non-empty:\n" +
    "- realPrompt keeps CHARACTER, KNOWN IDENTITY, IDENTITY LOCK, and VARIABLE, and OMITS WARDROBE LOCK. IDENTITY LOCK then holds only what is true at every stage — face shape, bone structure, eye shape and color, nose, skin tone, height, and build. Hair, facial hair, skin condition, weight, scars, and apparent age move into the looks whenever they change between stages. Never write 'before'/'after' or stage-by-stage alternatives inside realPrompt.\n" +
    "- 2 to 4 looks, in story order. The first is the base: the other looks' sheets are drawn from it. Every scene the character appears in belongs to exactly one look.\n" +
    "- key: a short lowercase ascii slug, unique within the character. label: 1-3 English words naming the stage. scenes: the '<scene number> <heading>' entries of that stage.\n" +
    "- prompt uses exactly this format:\n" +
    "LOOK: <label>\n\n" +
    "APPEARANCE LOCK:\n" +
    "- <hair, facial hair, skin condition, weight, marks, and apparent age at this stage>\n\n" +
    "WARDROBE LOCK:\n" +
    "- <structural garment wording for this stage, same rules as WARDROBE LOCK above>\n\n" +
    "Keep every bullet short and self-contained: each look's prompt is read together with IDENTITY LOCK to generate that stage's sheet."
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
    "\n\nREFERENCE IMAGES ARE THE VISUAL TRUTH: every shot's image is generated with the reference images of the characters, locations, and props listed in that shot's assetsUsed attached to it. Those images define character design, face, build, wardrobe, the location's architecture, materials, prop placement, and each prop's exact identity. The shot's `prompt` does NOT re-describe any of that.\n" +
    "- Write `prompt` as the DELTA for this shot — what is true of THIS moment and nothing else: who is in frame, what they are doing (action, pose, gesture), their expression and gaze direction, where they stand within the space in view-relative terms, and the framing/composition.\n" +
    "- Name each character by the exact name used in Known Assets and leave their appearance to their attached reference. Do NOT copy IDENTITY LOCK or WARDROBE LOCK bullets into `prompt`, and do not paraphrase them either — describing in words what the attached image already shows is what pulls the render off its reference.\n" +
    "- The one exception is a VISIBLE CHANGE from the reference that this shot's script calls for — a bandaged limb, a removed jacket, soaked clothes, dirt, an injury. That is a delta, so state it explicitly and briefly. Everything unchanged stays unsaid.\n" +
    "- Never invent a physical or wardrobe detail that is not in the character's locks and not called for by the script. If a shot seems to need one, omit it — it belongs in the asset's locks, which regenerate the reference sheet, not in one shot's text."
  );
}

// Background crowd fill has no asset, no reference image, no name-based
// tracking — it is deliberately outside the assetsUsed system (see
// history/asset-extraction.md, props are extracted only when distinct and
// recurring; the same reasoning applies here even harder, since anonymous
// crowd is by definition not a distinct recurring identity). This block only
// tells the model to describe plausible ambient people directly in `prompt`
// prose when the scene implies a populated place and the script doesn't say
// who else is around — it must never invent a named character, put crowd
// wording in assetsUsed, or contradict something the script does specify.
export function ambientPopulationBlock() {
  return (
    "\n\nAMBIENT BACKGROUND POPULATION: if a shot's location is a place that would plausibly be populated (a street, market, village square, temple grounds, festival) and the script does not say who else is present, infer brief, plausible background activity from the scene type — e.g. villagers walking, vendors arranging goods, a woman carrying a basket — and fold it into `prompt` as ordinary background detail. " +
    "This is scene dressing, not a character: never name it, never add it to assetsUsed, and never let it compete with the named characters and action the shot is actually about. Keep it to one short clause. " +
    "Do not add background population to an interior, a private, or an otherwise sparse/empty location, and never contradict a script line that states who is or isn't present."
  );
}

// Screen-direction layer (the 180-degree rule). Observed failure: a scene's
// establishing shot pinned the location's anchors but never pinned where the
// CHARACTERS sit left-to-right, so the first closer shot invented an order and
// later shots were free to contradict it.
//
// The model already reasons about camera position — it writes "over-the-shoulder
// shot from behind X toward Y" into `camera` — but `camera` never reaches the
// image model, so the shot `prompt` was left asserting "X at frame left" with
// no stated cause. This block moves that reasoning into `prompt`, where it can
// actually constrain the render.
//
// Note what a reverse angle does: staying on the same side of the action axis
// PRESERVES each character's screen side (in an over-the-shoulder pair, A stays
// screen-left and B screen-right in both directions). A swap is what crossing
// the axis does, and it has to be a deliberate, stated choice — treating a
// reverse as an automatic swap is exactly the disorientation this prevents.
export function screenDirectionBlock() {
  return (
    "\n\nSCREEN DIRECTION (180-degree rule): screen sides are fixed by the FIRST shot that shows a given set of characters together, and every later shot in that scene keeps them.\n" +
    "- That first shot must pin the characters' left-to-right order on screen against a visible anchor — not just the location's fixed objects, but the people: which character is at frame left, which at frame right, and, when two of them stand together, which of the two is nearer frame left.\n" +
    "- State each character's gaze camera-relative: 'looking camera-left toward <name>', not merely 'looking toward <name>'. Two characters facing each other look in OPPOSITE camera directions — one camera-left, one camera-right.\n" +
    "- WATCHER AND WATCHED (one character observing another, or an action): the gaze direction is decided by the TARGET'S frame side, never by what the target is doing. A target at frame left is looked at camera-LEFT; a target at frame right is looked at camera-RIGHT. CROSS-CHECK every gaze clause you write against the frame side you already gave its target in the same sentence — 'X at frame left sweeping, Y at frame right looking camera-right toward the sweeping' points Y away from X and is the single most common error here.\n" +
    "- Two characters share a camera direction ONLY when both are looking at the same third thing off that side of frame. When one is looking at the other, they never share it.\n" +
    "- A character absorbed in their own action looks at that action — 'head down toward the broom', 'eyes on her hands' — not at a camera direction. Giving the actor a camera-relative gaze is what pulls their head up and out of the work.\n" +
    "- Every shot's `prompt` must say where the camera stands relative to the characters ('from behind <name>, over its shoulder, toward <name>'), because that is what makes a screen side true rather than asserted. The `camera` field never reaches the image model, so this belongs in `prompt` even when `camera` says something similar.\n" +
    "- A reverse angle does NOT permit a left/right swap. Remaining on the same side of the action axis preserves screen direction — that is the point of the reverse: in an over-the-shoulder pair, the character who was screen-left stays screen-left in the reverse, only the shoulder in the foreground changes. Swap sides ONLY when the shot explicitly states that the camera crosses the axis, and name the resulting change in that shot's `prompt`.\n" +
    "- MOVEMENT ALONG A PATH: on a place people travel along, the travel direction is fixed by the path's named ends, not by the frame. Decide which end each walker is heading toward from where the story has them come from and go to — a character who set out from a place in an earlier scene enters the path at the end that leads there — then derive their screen direction FROM THE SHOT'S STATION: from a station looking toward the end they walk to, they move away from camera; from one looking back, they come toward it; from the side, they cross the frame toward the side that end is on in that station's view. When one character overtakes or blocks another and they stop face to face, a NEW axis starts at that moment: the first shot of the confrontation fixes who is at frame left, and every shot after keeps it.\n" +
    "- A scene can hold more than one axis: the establishing shot fixes one (say two characters together on one side, a third opposite them), and a later exchange between two of those characters forms a new one. Fix each new pairing's order the first time those characters appear together, and never let a new axis contradict a side the scene's establishing shot already pinned."
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
    "- On a place people move along, position also says which side of a landmark along it the character is, by the named ends and, for anyone walking, which end they are heading toward. When one character overtakes, cuts in front of, or turns back past another, the endState records the new order along the path; the next shot must start from it.\n" +
    "- The ledger is a cross-check on the prompt, never text to paste into it. A startState fact reaches `prompt` only when it is a delta from the attached references — an object held or placed, a wardrobe change, where the character stands — and then in view-relative wording (behind, frame left/right, foreground), never as compass wording. What the references already show is not restated. A visible container's fill state is always a delta and always goes into `prompt` — 'an empty woven basket', 'a pot half full of water', 'a basket holding three tomatoes' — because an image model fills a basket, bowl, or pot by default and the shot then shows the result before the action.\n" +
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
    "- AN ACTION LINE ABOUT SPEAKING IS NOT A BEAT OF ITS OWN. When an [ACTION] paragraph's verb IS the act of speaking — calls out, shouts, announces, pleads, whispers, replies, hawks his wares — and the next tags are that same character's [CHARACTER]/[DIALOG], the paragraph and the line are ONE moment described twice, which is how screenplays are written. Emit ONE shot that carries the line, with the action paragraph's manner and the [PARENTHETICAL] as that shot's behaviour. Never a shot of the speaking action followed by a shot of the words: the first one is a mouth moving with nothing to say, and a video model given a talking mouth and no line invents speech in its own default language.\n" +
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

// Motion-style layer, appended after MOTION DISCIPLINE. It narrows that block
// rather than replacing it — Sacred Cinematic is a stricter subset of the same
// rules, not a different set.
//
// The model classifies each shot into one motion mode and writes NOTHING about
// motion behaviour: the camera move, the intensity ceiling, and the negative
// list all come from lib/constants/motion-styles.ts at copy time. Letting the
// model write both the mode and its own motion wording is what "free-form
// motion" already is, and it is what makes every clip look equally animated.
export function motionStyleBlock(motionStyleId?: string | null) {
  const style = resolveMotionStyle(motionStyleId);
  return (
    `\n\nMOTION MODE (motionMode): this story's motion style is '${style.name}'. Tag every shot with exactly one motion mode. ` +
    "The app composes the shot's motion instructions from a fixed template for that mode — do NOT describe camera movement, motion intensity, or restraint wording in the videoPrompt yourself.\n" +
    "- `micro` — nothing physical happens. A held look, a listening beat, a figure seated or standing still.\n" +
    "- `dialogue` — the shot covers a [CHARACTER]/[DIALOG] pair and someone speaks on camera.\n" +
    "- `normal` — clear physical action: walking, travelling, entering or leaving, handing something over, a crowd moving.\n" +
    "- `emotional` — a realization or emotional turn carried by the face, with no body relocation.\n" +
    `- ${style.selectionRule}\n` +
    "- The mode must agree with the videoPrompt: tag `dialogue` if and only if the videoPrompt quotes a spoken line."
  );
}

// Chapter-geography layer. Every other spatial block works INSIDE one location:
// a location's FIXED LAYOUT arranges one room, SCREEN DIRECTION fixes sides
// within one scene. Nothing described how the locations relate to each other,
// so two facts kept getting re-derived per scene and contradicting themselves:
// which script headings are the same physical place (a place revisited under a
// slightly different heading got a second establishing shot), and which way a
// character travels when a cut moves them from one place to a connected one.
//
// The map is emitted BEFORE the scenes — it is the first property of the
// storyboard schema — so it is settled once for the chapter and then obeyed,
// rather than inferred again inside every scene. It is stored on the chapter
// so a single-scene regeneration receives it as input (see lib/site-map.ts):
// that pass sees the whole script but re-shoots one scene, which is exactly
// the case where chapter-wide geography is otherwise lost.
export function siteMapBlock() {
  return (
    "\n\nCHAPTER SITE MAP (`siteMap`): produce this FIRST, before any scene, then shoot the chapter against it.\n" +
    "- `places`: one entry per distinct PHYSICAL PLACE the script visits — not one per [SCENE] heading. Group every heading that plays in the same place into a single entry: a place shot from two sides is one place (its location asset's VIEWS cover the sides), and the same place at a different time of day or on a later day is still that place. `location` is the EXACT name of the matching Known Assets location; leave it empty only when the script visits a place that has no location asset. `sceneSlugs` lists that place's [SCENE] headings verbatim, in script order. `note` is one short line on what happens there — never a description of how it looks, which its location asset already carries.\n" +
    "- `connections`: one entry per move a character actually makes between two places in the script (stepping off a veranda into its yard, walking a road from a village to a market). `via` names the anchor the move passes through, taken from the FROM place's FIXED LAYOUT ('main door, south wall', 'front stair'). `screenDirection` states the travel direction as screen sides across the cut — e.g. 'exits frame right from the veranda, enters the yard from frame left'. Empty arrays are correct for a chapter that never leaves one place; never invent a move the script does not make.\n" +
    "- `stations`: the camera positions this chapter's shots of the place use. Each non-reference station costs the user one extra plate image, so add one ONLY when the shots need a view the reference cannot show, and reuse an existing station whenever a shot can be taken from it. A new station is needed for a new DIRECTION — the reverse looking back along a path, the far side of a landmark, a raised view from on top of something — and, on a place people move along, for a new POSITION along it: when characters walk on well past a landmark, the shots that follow them stand farther along the path, where that landmark is small in the distance or out of sight, not back beside it. The first station is always key 'reference': the location reference image's own camera position, written as THE REFERENCE STATION describes it. At most 5 per place. `view` is one or two sentences: where the camera stands and which way it looks, named against fixed features from the location's FIXED LAYOUT (a path's named ends, a landmark, the main structure) — never a compass bearing alone — then what sits at frame left, centre, frame right, and in the background from there, with how near or far each landmark is. Derive the sides from the layout and cross-check: a station looking the opposite way from 'reference' puts every landmark on the OPPOSITE frame side. A place with no location asset gets no stations.\n" +
    "- ESTABLISHING COVERAGE FOLLOWS THE MAP, NOT THE HEADINGS: the Establishing Master Shot rule fires on the first shot of each PLACE in the map. A later scene returning to a place the map already lists gets no second establishing shot unless that place's state has visibly changed (damage, a different time of day, a room now emptied) — open it with coverage that continues the established layout instead.\n" +
    "- TRAVEL ACROSS A CUT: when a character leaves one place and the next shot picks them up in a connected place, both shots must follow that connection's `screenDirection` — someone exiting frame right arrives entering from frame left. A cut that flips their travel direction reads as them turning around. This extends SCREEN DIRECTION across places; inside a scene that block still governs.\n" +
    "- The map is reasoning for you and for later passes. Never copy `siteMap` wording into a shot's `prompt`: place names, connection wording and compass anchors are not things an image model can render."
  );
}

// Lighting layer. Prompted by a suggested five-part prompt structure (subject,
// environment, style, lighting, camera) — lighting was the one slot nothing in
// this pipeline filled. A location's realPrompt is forbidden to mention it (it
// generates a neutral reference sheet), a shot's prompt is forbidden to write
// a lighting rig, and the visual style describes a global look rather than a
// scene's hour. So the light was left entirely to the image model, and two
// shots of one scene could come back at different times of day.
//
// Scene-level, not per shot: an hour and a light source are properties of the
// scene, and shots that disagree about them do not cut together. The text is
// composed into the copied prompt by lib/prompt-copy.ts rather than written
// into a shot's prompt, so it can be re-edited without regenerating shots.
export function lightingBlock() {
  return (
    "\n\nSCENE LIGHTING (`lighting`): one short line per scene describing the light, written as scene CONTENT, never as a lighting rig.\n" +
    "- Cover three things and nothing else: the hour and light condition the [SCENE] heading implies (DAY/NIGHT, dawn, dusk, overcast, rain), where the light physically comes from — named by the ANCHOR it passes, taken from that location's FIXED LAYOUT ('low sun through the open doorway', 'a single oil lamp on the shelf behind her') — and the mood that produces ('warm and calm', 'cold and flat').\n" +
    "- NEVER write a compass direction into this line. 'Sunlight from the south', 'light from the east window' — a compass bearing is invisible in an image, so it constrains nothing and is the wording that sends the model re-deriving the room instead of matching the attached reference. Use the layout's compass only to WORK OUT which anchor the light passes, then name the anchor and, where it matters, the frame side it falls across ('from beyond the gate in the foreground, falling across the yard toward the veranda').\n" +
    "- FORBIDDEN: rig and post wording. No key/fill/rim light, no three-point, softbox, practicals, colour temperature in kelvin, no lens, exposure, grade, or render-engine words. If it names film equipment rather than something a person standing in the room would see, it does not belong here.\n" +
    "- Every shot in the scene shares this light. A shot's `prompt` states lighting only as a DELTA the script calls for — a character stepping into the doorway's light, a lamp being lit, a door opened onto brightness — and never restates the scene's light.\n" +
    "- Consecutive scenes in the same place at the same time of day must not contradict each other on the hour; a time jump has to be visible in the script.\n" +
    "- Keep it to one line. It is prefixed and composed into the copied prompt by the app, so write no label of your own."
  );
}

// Companion to lib/constants/shot-scales.ts. The model only classifies; the
// optics wording is a constant composed at copy time, for the same reason
// motion mode works that way — wording the AI writes per shot cannot be edited
// globally, and depth-of-field language repeated freehand across a chapter
// drifts. Kept separate from the visual style because it is the one look
// property that must differ shot to shot: an establishing wide needs the space
// legible, an extreme close-up needs the background gone.
export function shotScaleBlock() {
  return (
    "\n\nSHOT SCALE (`shotScale`): tag every shot with exactly one framing scale. The app composes a fixed depth-of-field and background line from it — never write depth of field, focus, bokeh, or background-blur wording into `prompt` yourself.\n" +
    "- `wide` — establishing or full-space coverage: the place and the relative positions in it are the subject.\n" +
    "- `medium` — a character in their space, roughly waist-up to full figure: the action is the subject, the place still readable behind it.\n" +
    "- `close` — a face, hands, or a single figure filling the frame.\n" +
    "- `extreme-close` — an object, a detail, a texture: surface and micro-detail are the subject.\n" +
    "- It must agree with the framing the shot's `prompt` opens with, and with the aspect-ratio rules above: 9:16 rarely justifies `wide`, and an Establishing Master Shot is `wide` in 16:9 or the widest ratio-appropriate scale in 9:16.\n" +
    // A wide prompt with no distance let the image model drop the attached
    // character sheet into the foreground at sheet size. See
    // history/shot-prompt-composition.md, 2026-10-10.
    "- On `wide` shots, give every named character's distance from the camera in metres and how much of the frame they take, in the same sentence that places them — 'small in the frame, about 20 metres from camera, at frame right by the entrance'. Use the distance the beat actually needs: a character arriving at a place in a wide shot is far and small, not in the foreground. Never leave a wide shot's characters without a distance."
  );
}

// Script-fidelity layer. Observed: a Burmese action line whose whole point was
// the MANNER of the action — ခိုးကြည့် (to peek, to watch on the sly) — came
// back as "stands watching" in the English prompt. The action survived the
// translation and the adverb did not, which is precisely the half that carries
// the beat: a child copying her grandmother in the open is not the same shot,
// and not the same joke, as one doing it from behind cover.
//
// This is not a language-specific problem (English scripts lose "reluctantly",
// "quietly", "without looking up" the same way), but translation makes it much
// more likely, because manner is where a literal rendering of a verb drops
// detail first.
export function scriptFidelityBlock() {
  return (
    "\n\nMANNER IS NOT OPTIONAL: when a script line says HOW something is done, that manner is the beat — carry it into `prompt` as visible behaviour, not just the bare action.\n" +
    "- Translate manner into something an image can show: secretly/on the sly = half-hidden behind a post or a doorway, body turned away, head peering around it; reluctantly = feet planted, shoulders back, only the head turned; imitating = the same posture and grip as the person being copied, a beat behind them.\n" +
    "- 'Stands watching' is what a dropped adverb looks like. If the script's verb carried a manner and your prompt reads as a neutral stance, you lost it — put it back.\n" +
    "- This applies hardest when the script is not in English: render the manner, never only the literal verb.\n" +
    "- Never invent a manner the script does not state. This is about not losing what is there."
  );
}
