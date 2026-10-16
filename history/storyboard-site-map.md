# Chapter site map in storyboard generation

Covers: `lib/site-map.ts`, `lib/prompts/shared.ts` (`siteMapBlock`),
`lib/prompts/storyboard.ts` (`SITE_MAP_SCHEMA`, `SceneRegenerationTarget.siteMap`),
`lib/openai.ts` (`GeneratedStoryboard`), `app/api/chapters/[id]/storyboard/generate`,
`app/api/scenes/[id]/regenerate`, migration `20260911093000_chapter_site_map.sql`.

## 2026-10-11 — Connection direction is stated against places, not frame sides

**Supersedes** the 2026-09-11 form of `connections[].screenDirection` ("exits
frame right…, enters from frame left"). A generated wide shot read "from inside
town looking north… Buddha exits frame right toward the forest". That can't be
drawn: a camera looking the way he walks sees him walk away, not exit to a side.
A fixed frame side is only true from one camera position, and shots now stand
at different site-map stations (`history/camera-stations.md`).

`screenDirection` now names the move against the places themselves ("out
through the town entrance onto the forest trail"). TRAVEL ACROSS A CUT has each
shot derive its frame direction from its own station: away from camera, toward
it, or across the frame toward the destination's side. Continuity is kept as
"never walking back the way they came", not as a matched left/right pair. The
original reason for the rule is unchanged: a flipped direction reads as turning
around.

## 2026-09-11 — Shot generation is given chapter geography, not just per-location prompts

**Decision: the storyboard pass emits a chapter-level site map as the first
field of its structured output, shoots the chapter against it, and stores it on
`chapters.site_map`. Single-scene regeneration receives that stored map as
input and emits none of its own.**

The map holds two things no asset row holds:

- `places` — one entry per distinct *physical* place, each listing every
  `[SCENE]` heading that plays there. Headings are not places: the same place
  under a second heading (different time of day, a later day, a second visit)
  belongs to one entry.
- `connections` — the moves the script actually makes between places, each with
  the FROM place's FIXED LAYOUT anchor the move passes through and the travel
  direction stated as screen sides across the cut.

Two failures motivated it, both from geography being re-derived inside each
scene. A place revisited under a slightly different heading picked up a second
establishing shot, because the Establishing Master Shot rule was keyed to the
heading. And a character leaving one place and arriving in a connected one in
the next shot could have their travel direction flipped, because
`screenDirectionBlock` fixes sides only *within* a scene. The map moves both
decisions up to the chapter: establishing coverage fires on the first shot of
each *place* in the map, and a cut across a connection follows that
connection's stated screen direction.

**Why it is a schema field rather than a separate AI pass.** It is the leading
property of `STORYBOARD_SCHEMA`, so structured output produces it before any
scene — the model settles the geography, then shoots against what it just
wrote. That costs no extra call. A pre-pass would have cost one on every
generation and still needed the same storage.

**Why it is stored.** Per-scene regeneration is the case that actually needs it
as *input*: that pass sees the whole script but re-shoots one scene, which is
exactly where chapter-wide geography is otherwise lost. Storing the map from
the generation that produced the scenes keeps a re-shot scene in the same
geography as its neighbours.

**Rejected:**

- *Attaching the location's floor-plan / site-plan reference image to the
  storyboard call (making it multimodal).* The plan image is generated **from**
  the location's `realPrompt`, so it carries strictly less than the text
  already in `assetContext` — no compass labels, no SPATIAL RULES, no VIEWS
  frame-side derivation. The one thing shot generation must do with a layout is
  derive frame-left/frame-right from compass anchors, which
  `history/visual-styles.md` and `locationSpatialConsistencyBlock` already
  record as the fragile step (a rear view came back mirrored); a schematic
  top-down is the worst input for it, not the best. Plan images are also
  nullable, so the text path survives either way.
- *A `siteMap` the user edits in the UI.* No screen owns chapter geography, and
  an editable copy would immediately drift from the storyboard that was shot
  against it. The map's consumer is the model, not the reader — deliberately,
  per `history/ambient-population.md`'s rule against parallel state with no
  consumer.
- *Deriving the map in code from `[SCENE]` tags.* Code can list the headings but
  cannot decide which of them are the same physical place, nor match them to a
  location asset — that is the whole content of the map.
- *Letting regeneration produce its own map.* Re-deriving chapter geography from
  one scene reintroduces both failures at the seam. The scope block tells the
  pass the map is settled.

**Consequences:**

- The map is prompt-side reasoning only. `siteMapBlock` forbids copying its
  wording into a shot's `prompt`: place names, anchors, and compass directions
  are not renderable by an image model.
- A chapter storyboarded before this change has `site_map` null; its scene
  regenerations judge place and establishing coverage from the script alone,
  exactly as before. Editing a script and regenerating one scene leaves the map
  as the last full generation wrote it — the map refreshes on full generation
  only, which is also when the scenes it describes are rebuilt.
- `assetContext` still sends each asset's full `realPrompt`, including
  STRUCTURE SHELL material the shot text is told not to restate. Trimming the
  storyboard step's asset context to the layout-relevant subset is open work,
  not covered here.
