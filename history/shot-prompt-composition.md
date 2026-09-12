# Copied-prompt composition: order, style position, scene lighting

Covers: `lib/prompt-copy.ts`, `lib/constants/shot-scales.ts`, `lib/prompts/shared.ts` (`lightingBlock`),
`lib/prompts/storyboard.ts` (`scenes[].lighting`,
`SceneRegenerationTarget.lighting`), `lib/api/types.ts` / `lib/api/map.ts`
(`Scene.lighting`), `app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`,
migrations `20260911101500_scene_lighting.sql` and `20260911113000_shot_scale.sql`.

## 2026-09-11 — Shot copies follow subject → environment → style → lighting

Prompted by a suggested five-part prompt structure (subject/character,
environment, visual style, lighting/atmosphere, camera/render). Audited slot by
slot against what this pipeline already does:

- **Subject and environment** are already the shot prompt's whole job, minus
  appearance and room layout — the reference images carry those
  (`identityAnchorBlock`, `locationSpatialConsistencyBlock`). Re-adding them is
  recorded-rejected there and stays rejected.
- **Camera / render** stays excluded. `camera` is metadata for the user that
  never reaches the image model — `shotDistinctnessBlock` depends on exactly
  that — and render/engine keywords are banned in `styleContextBlock`. Wanting
  "cinematic, depth of field" is a request for a different visual style
  constant, not a per-shot field.
- **Lighting** was the one slot nothing filled. See below.
- **Style position** moved. See below.

**Decision: style no longer leads a shot copy.** `withStyle` and
`withFrameDescription` now emit the shot text first, then `[Style]`, then
`[Lighting]`; `withFrameDescription` keeps the videoPrompt immediately after the
frame description it animates, and the motion paragraph still trails everything.

**This supersedes the earlier "style leads" decision, and the reasoning behind
that one is kept because it was measured, not theoretical:** a style tag
*trailing* a long, hyper-specific prompt was being drowned out by dense real
material nouns, and Myanmar-adapted content drifted toward photorealism. The new
order is not that failure case — style sits directly after the shot text rather
than at the very end — but it moves in the same direction. **If photoreal drift
returns on Myanmar or Buddha-era renders, this ordering is the first thing to
suspect**, and reverting it is a two-line change in `lib/prompt-copy.ts`.
`lib/prompt-copy.test.ts` pins the order so a revert is deliberate.

**Asset copies were deliberately NOT reordered.** `withAssetContext` still leads
with `[Style]`, then the `SYSTEM_PROMPTS` preset, then the entity's
`realPrompt`. That preset is reference-sheet framing and neutral-lighting
boilerplate which only reads correctly together with the style it renders in,
and a reference sheet has no scene to be lit by.

## 2026-09-11 — Lighting is a scene property, composed at copy time

**Decision: `scenes.lighting` holds one line per scene — the hour and light
condition from the `[SCENE]` heading, where the light physically comes from
(named against the location's FIXED LAYOUT anchors), and the mood. It is
generated with the scene and composed into copied prompts as `[Lighting]`.**

Nothing carried this before. A location's `realPrompt` is forbidden to mention
lighting (it generates a neutrally-lit reference sheet), a shot's `prompt` is
forbidden to write a lighting rig, and a visual style describes a global look,
not a scene's hour. The light was therefore whatever the image model guessed per
shot, so two shots of one scene could cut from noon to dusk.

The block distinguishes **scene content** from a **lighting rig**: "low sun
through the east doorway, long warm shadows" is what a person in the room sees
and is allowed; key/fill/rim, softbox, kelvin, lens, exposure, grade and
render-engine words are not. The existing ban in the shot `prompt` description
is on rigs, not on the hour — these do not conflict.

**Rejected:**

- *Per-shot lighting.* Shots inside one scene share an hour or they do not cut
  together; a per-shot field invites exactly the drift this fixes. A shot states
  light only as a delta the script calls for (stepping into the doorway's light,
  a lamp lit).
- *Baking the lighting line into each shot's stored `prompt`.* Same reason Style
  and the motion paragraph are not baked in: editing it would mean regenerating
  shots. Composition at copy time keeps it re-editable.
- *Deriving it in code from DAY/NIGHT in the heading.* The heading gives the
  hour but not the source, and the source is what has to agree with the
  location's layout anchors.

**Consequences:**

- Scenes storyboarded before this change have `lighting` null and copy exactly
  as they did before.
- A single-scene regeneration does not rewrite the scene row, so the scene keeps
  its lighting line; the regeneration prompt receives it and writes the new
  shots under it.
- The line is shown read-only under the scene header (`Sun` icon). It is not
  editable yet — open work, not an oversight.

## 2026-09-11 — Framing optics are per shot, composed from a constant

Prompted by a suggested set of per-shot-type prompt templates (wide /
medium / close-up), each carrying its own depth-of-field wording. Audited: the
templates' subject and context slots are what `shot.prompt` already is, and
their style paragraph was substantially our own `BUDDHA_ERA_3D_BASE` read back.
The one thing that could not be expressed in the existing pipeline was the
depth of field varying by shot type.

**Decision: `shots.shot_scale` (`wide | medium | close | extreme-close`) is
tagged by the model, and `lib/constants/shot-scales.ts` maps it to an optics
line composed into the copied prompt as `[Framing]`.** The AI never writes the
wording — same split as motion mode, and for the same reasons: the wording stays
editable in one file for every existing shot, and freehand depth-of-field
language repeated across a chapter drifts. The picker on each shot lets a scale
be corrected by hand, like the motion mode picker; it replaces the generated
value outright, with no `*_override`.

**Why not in the visual style.** Depth of field is the one look property that
must DISAGREE between shots: an establishing wide needs the space legible front
to back, an extreme close-up needs the background dissolved. A story-wide style
string applied to both flattens them into the same image. `gentle depth of
field` was accordingly removed from `BUDDHA_ERA_3D_BASE`.

Shot `prompt` now also opens with the framing and the subject in that order
("Wide establishing shot of the monastery courtyard…"), and `shotScale` must
agree with it.

**Rejected:**

- *Folding the suggested material/environment lists ("mud-brick huts", "handwoven
  fabric robes") into the style text.* Same failure as
  `history/visual-styles.md`'s 2026-09-11 scale entry: style wording lands in
  the asset-generation system prompt and is read as an instruction about the
  place. Materials belong in the location/character `realPrompt`, which already
  generates them from the region adaptation block.
- *Three separate prompt templates the model picks between.* The difference
  between them is entirely the optics line; one classification plus one constant
  covers it without three near-duplicate templates to keep in sync.
- *Writing the depth-of-field wording into `prompt`.* Then it is frozen per shot
  and cannot be tuned globally, which is the whole point of composing it.

**Consequences:**

- Shots generated before this change have `shot_scale` null and copy with no
  `[Framing]` line — deliberately, rather than inheriting a default's optics
  they were never written for. `resolveShotOptics` returns null for them.
- Final copy order is now: shot text → `[Style]` → `[Lighting]` → `[Framing]` →
  motion paragraph.

## 2026-09-12 — Gaze is decided by the target's frame side; manner must survive translation; no compass in the lighting line

Three fixes from one reviewed shot (a Burmese script: a grandmother sweeping
while a child peeks and copies her).

**Gaze direction.** The generated prompt read "အဖွား at frame-left sweeping,
တီတီ at frame-right watching … both looking camera-right toward the broom
work" — the broom is at frame left, so the gaze clause points away from its own
target, and two characters looking at each other were given the SAME camera
direction. `screenDirectionBlock` stated the rule only for a facing PAIR, which
left the watcher/watched case unruled. It now says the gaze direction is decided
by the target's frame side (target frame-left → look camera-left), requires a
cross-check of every gaze clause against the frame side already given to its
target in the same sentence, allows a shared camera direction only when both
characters look at the same third thing, and says the character performing an
action looks at their own action rather than in a camera direction.

**Manner.** The script's `ခိုးကြည့်` (to peek, to watch on the sly) came back as
"stands watching": the verb survived translation, the manner did not — and the
manner was the beat. New `scriptFidelityBlock` requires manner to reach `prompt`
as visible behaviour (half-hidden behind a post, peering around it), names
"stands watching" as the signature of a dropped adverb, and forbids inventing a
manner the script does not state.

**Compass in `[Lighting]`.** The line came back as "Morning sunlight comes from
the south beyond the bamboo gate". `lightingBlock` asked for the source to be
named against a FIXED LAYOUT anchor, which it did, but nothing forbade the
compass bearing riding along. That is the failure already recorded for shot
prompts in `locationSpatialConsistencyBlock` — a bearing is invisible in an
image, constrains nothing, and sends the model re-deriving the room instead of
matching the reference. The block now forbids compass wording in the lighting
line outright: use the layout's compass to work out WHICH anchor the light
passes, then name the anchor and the frame side it falls across.

**Checked and deliberately not changed:** the other visual styles. Only Buddha
Era 3D ever asserted an hour ("Use soft warm sunlight"), already trimmed. 3D
Animation's "volumetric lighting" / "soft cinematic lighting" and Mythic Fantasy
Painting's "warm golden highlights balanced with cool blue shadows" are light
QUALITY and palette identity, not a time of day, and do not conflict with a
scene's `[Lighting]` line.

**Left open:** Burmese asset names (`အဖွား`, a common noun rather than a proper
name) reach the image model as tokens it cannot read. They work only because the
character's reference image is attached. Renaming is rejected in
`history/asset-extraction.md` (name-based matching), so the candidate fix is an
English gloss in prompt text only — not decided.
