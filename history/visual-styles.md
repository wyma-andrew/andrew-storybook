# Visual styles

Covers: `lib/constants/visual-styles.ts`, `lib/visual-styles.ts`, `lib/api/map.ts`
(`mapStory`), the style pickers in `app/stories/new`,
`components/StoryControlsMenu.tsx`, and the read-only list in `app/settings`.

## Standing decisions

- Styles live in code, not the DB. No self-serve editor, no "+ New style" UI —
  a project owner edits `VISUAL_STYLES` directly. `/settings` renders them
  read-only.
- Every English text ends with `Characters ignore the camera. Uncropped full
  frame, textless, no letterboxing.` (`SINGLE_FRAME_TAIL`). The copy targets are
  single frames; without it renders come back letterboxed or captioned.
- An unresolvable `visual_style_id` falls back to `VISUAL_STYLES[0]`, so
  3D Animation must stay first in the array. Reordering silently restyles every
  story whose style was never set.

## 2026-10-09 — Added "Sacred Historical Drama"

`id: "sacred-historical-drama"`, swatch `#c98a3c`. Ultra photorealistic
live-action historical-film look for Buddha-era stories: real human figures,
realistic skin and woven robe texture, sacred tranquil atmosphere.

This is the first photoreal Buddha-era style. The 2026-09-10 decision that made
Mythic Fantasy's Buddha variant non-photorealistic still stands for that style;
this one is photoreal on purpose. If its characters read as contemporary
people, tighten the period wording here rather than editing the other styles.

Distilled from a Buddha sermon reference prompt. Left out on purpose: the
Buddha's face, age, skin tone, earlobes, curls, teaching gesture, the Sarnath
grove, and golden morning light — those are the character asset, the shot, the
location, and the scene's `[Lighting]` line, and in the style they would turn
every character into the Buddha. "Cinematic depth of field" also dropped (per
shot, see 2026-09-11). From the negative prompt only style-level items were kept;
face items (aged, wrinkles, "Burmese-looking") and crowns/jewelry were dropped
because kings and laypeople appear in these stories. Same text for all three
regions.

## 2026-10-04 — Added "Cozy Hand-drawn Anime"

`id: "cozy-hand-drawn-anime"`, swatch `#9bb07a`. First style for the cozy
POV / cooking-ASMR format: classic 2D hand-drawn look, painted backgrounds,
earthy palette, tactile food and utensil detail.

The reference prompt it came from also named a wooden cottage, a rainy morning,
first-person POV, and visible hands. Those were deliberately left out: the place
is a location asset, the hour/weather is the scene's `[Lighting]` line, and the
POV is a shot decision. Baked into the style they would contradict every scene
that is not a rainy kitchen. Light wording is quality-only, per the 2026-09-11
Buddha Era 3D entry.

Same text for all three regions — nothing region-specific to adapt; cultural
content comes from the region adaptation blocks.

## 2026-09-11 — Buddha Era 3D no longer dictates scale

The base text's "Keep environments modest, functional, organic, and lived-in"
was reaching the model as a scale instruction, not a finish one: style context
is injected into the asset-generation system prompt, so a historically large
place (Jetavana) was written up as compact single-storey buildings of modest
scale. The line is now "Keep environments organic, hand-built, and lived-in
rather than ornate or fantastical, with detailing and finish restrained. The
size, building count, and grandeur of a place follow the story and the place
itself, not a default of smallness."

The style's identity is unchanged — hand-crafted period materials, restrained
sacred atmosphere, no divine beams/halos/particles (2026-09-10 entry below all
stand). What was removed is only the implication that restraint means small.
`styleContextBlock` carries the matching general rule; see
`history/regions.md` 2026-09-11.

## 2026-09-10 — Added "Buddha Era 3D"

`id: "buddha-era-3d"`, swatch `#a8895f`. Premium stylized 3D animated
feature-film look applied to an ancient South Asian Buddha-era setting: soft
natural lighting, hand-crafted period materials (wood, clay, stone, reed,
woven fabric, packed earth), restrained sacred atmosphere. Explicitly rejects
divine light beams, halos, magical particles, and other overtly mystical
fantasy dressing that Mythic Fantasy Painting's Buddha variant allows.

Same base text used for all three regions (english/myanmar/buddha), same
pattern as Mythic Fantasy Painting's english/myanmar duplication — supplied
wording is already Buddha-era in subject, nothing region-specific to adapt
yet. `SINGLE_FRAME_TAIL` only added to the english tail; myanmar and buddha
tails are empty since the base's own "Avoid..." clause already carries the
anti-realism/anti-fantasy guidance other styles put in `tail`.

## 2026-09-09 — Added "Mythic Fantasy Painting"

`id: "mythic-fantasy-painting"`, swatch `#d3a34a`. Hyper-realistic digital
fantasy painting; chiaroscuro gold/blue, volumetric rays, Southeast Asian
Buddhist iconography with modern concept art. Appears automatically in all three
pickers.

## 2026-09-11 — Buddha Era 3D no longer states the hour or the depth of field

Two clauses left `BUDDHA_ERA_3D_BASE`, both because the pipeline now owns them
elsewhere and a style asserting them contradicts it:

- `"Use soft warm sunlight..."` became `"Render light softly and naturally..."`,
  and `"cinematic but soft natural lighting"` / `"warm balanced colors"` became
  `"balanced natural colors"`. The style now describes light QUALITY only. The
  scene's actual light is `scenes.lighting`, composed at copy time — a style
  naming warm sunlight fights every night, storm, or lamp-lit scene.
- `"gentle depth of field"` was dropped: depth of field is per shot now
  (`shots.shot_scale`), and it is the one look property that must differ between
  an establishing wide and an extreme close-up.

The style's identity is unchanged. See `history/shot-prompt-composition.md`.
Other styles' lighting wording (e.g. 3D Animation's "volumetric lighting") was
left alone — only this style was reviewed.

## 2026-09-11 — Style no longer leads shot copies (superseded ordering)

The `[Style]` prefix used to lead every copied prompt. For shot start-frame and
video copies it now follows the shot text instead — see
`history/shot-prompt-composition.md` for the new order and for the measured
photoreal-drift reasoning the old order came from, which is retained there as
the thing to re-check if drift returns. Asset copies still lead with `[Style]`.

## 2026-09-10 — Refined the Mythic Fantasy Painting prompt

The English and Myanmar variants now use the same refined, serene cinematic-realism
wording. The final copied prompt is prefixed with `[Style]`. The replacement favors controlled dramatic
lighting, soft chiaroscuro, natural texture, and a sacred Southeast Asian
Buddhist-inspired atmosphere over the earlier epic-scale, particle-effect-heavy
description.

The supplied ending `textless, full-frame` was consolidated into the existing
`SINGLE_FRAME_TAIL` instead of duplicated. This preserves the standing camera,
uncropped-frame, text, and letterboxing safeguards while otherwise using the
approved replacement wording.

## 2026-09-10 — Buddha mode has explicit style text

Adding the `buddha` region also adds a `buddha` `StyleText` to every visual
style. The initial entries deliberately duplicate the closest suitable style
wording, but they are stored independently rather than falling back at runtime.
Historical content belongs to the shared Buddha-era adaptation block; these
entries continue to control rendering style only.

After a generated Buddha reference read as a contemporary Southeast Asian monk,
the Buddha variant of Mythic Fantasy Painting changed its cultural phrase from
`Southeast Asian Buddhist-inspired` to `ancient South Asian Buddha-era`. The
other regional variants keep their own wording.

The literal `[Style]` marker is owned by `withStyle` / `withAssetContext`, not
stored inside any `StyleText`. Removing it from the Mythic bases prevents copied
prompts from beginning `[Style] [Style]` while preserving one marker in every
final copy.

## 2026-09-10 — Buddha Mythic Fantasy is explicitly non-photorealistic

The Buddha-region variant of Mythic Fantasy Painting now asks for a premium
stylized concept-art illustration with believable anatomy and material detail,
while explicitly rejecting live-action realism and photographic appearance.
This replaces the earlier hyper-realistic/cinematic-realism wording that pulled
generated characters toward photographs of contemporary people.

Only the Buddha variant changed because the approved replacement explicitly
names an ancient South Asian Buddha-era aesthetic. English and Myanmar retain
their independently defined regional text. The supplied single-frame ending is
still composed through `SINGLE_FRAME_TAIL` rather than duplicated in the base.

## 2026-09-09 — One text per region, on every style

**Decision: `VisualStylePreset.text` is `Record<Region, StyleText>` — every
style carries a text for every region, always. No fallback between regions.
Duplicating identical wording across regions is accepted and preferred.**

`StyleText` is `{ base, referenceClause, tail }`. `referenceClause` is dropped
when `referenceImageAttached: false` — a copy whose only attachment is a
schematic rather than a render of the finished subject. Attached to a floor-plan
copy the clause reads as "match the look of the schematic", which is how
labelled top-down plan artwork came back instead of a rendered room. A style
with no such clause stores `""`.

Why no fallback: `resolveStyleContext` used to branch on region alone —
`region === "myanmar"` returned a single module-level `MYANMAR_STYLE_DESCRIPTION`
and discarded the picked style entirely. That was written when 3D Animation was
the only style, so "the Myanmar region" and "3D Animation's Myanmar text" were
the same thing. The moment a second style existed, Mythic Fantasy Painting
inherited 3D's Myanmar wording — including *"Never transition toward
photorealism or live-action humans"*, the exact opposite of a hyper-realistic
painting style. `Record<Region, StyleText>` makes a missing region a type error,
so the failure cannot recur.

Rejected: an optional `myanmar?` field falling back to the English text. It
reintroduces a rule about when the fallback applies, which is the class of bug
being removed. **Do not reintroduce cross-region fallback.**

`resolveStyleContext(region, visualStyleId, opts)` takes the **style id**, not a
description string — a caller holding one flattened description cannot know
which region wrote it. Consequences, all deliberate:

- The four generation routes (analyze, sync, storyboard generate, chapter-asset
  regenerate) no longer call `resolveVisualStyle`; they pass
  `story.visual_style_id` straight through.
- `Story.visualStyleDescription` is gone from the API payload; clients pass
  `story.visualStyleId`. `ResolvedVisualStyle` is id/name/swatch — labels only.
- `/settings` renders both region texts per style, since that page is where the
  difference between them gets checked.

Verified byte-identical to the previous behavior for every existing
combination: English 3D (with and without reference), Myanmar 3D (with and
without reference), and an unset style id.

Mythic Fantasy Painting's Myanmar text is a duplicate of its English text — the
style is already Southeast Asian in subject, so there was nothing to adapt yet.
Editing it is a data change in that block alone.
