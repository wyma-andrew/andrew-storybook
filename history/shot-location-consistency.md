# Shot prompts vs the location reference image

Covers: `lib/prompts/shared.ts` (`locationSpatialConsistencyBlock`,
`stateLedgerBlock`'s container-state line, `locationSpatialLayoutBlock`'s
relative-position line),
read alongside `lib/prompts/shared.ts` (`locationSpatialLayoutBlock`,
`identityAnchorBlock`) and `lib/constants/system-prompts.ts`
(`locationInterior`, `locationAltAngle`, `locationFloorPlan`).

## Standing position

The location's reference image is the visual truth. The shot `prompt` is a
delta on it, never a re-description of it. Everything below is a rule about
what the delta may and may not say — none of it reintroduces layout prose into
`prompt`, which stays recorded-rejected here and in
`history/storyboard-site-map.md`.

## 2026-10-06 — Shots at the reference's own station say so and describe only the delta

From the same garden chapter, after the fixes below. A wide establishing shot
with Mya in it was written as a full composition ("from the garden's south
edge toward the cottage… tomato bed at frame left, green onion bed at frame
right, path through the center, Mya between the beds"). Every fixture kept its
side, but the render dropped the reference's raised, angled view for a flat
eye-level one with the beds enlarged and pushed apart. Placement held; the
camera did not. The model rebuilt the view from the sentence rather than keep
the attached picture's.

**Decision:** the storyboard prompt now states the reference image's own
station (taken from the `locationExterior` / `locationInterior` camera lines).
A shot standing there writes "from the same viewpoint as the attached location
reference" and describes only the delta: characters and their action, weather,
doors and lamps, container fill state. It does not re-list fixtures or frame
sides. The full station / frame-side / background rules still apply to every
other station.

**Supersedes in part** the 2026-09-13 ban on reference-matching phrases
("matching the reference layout"). That ban was about claims on a *previous
shot*, an image the model cannot see. This phrase names the *attached*
picture's camera, which the model does have. It is the one allowed phrase; the
rest of the ban stands. Approved by the user on 2026-10-06.

**Rejected:** restricting all shots to the reference station. It is still
rejected for the reasons in the 2026-09-13 entry; this only stops shots that
are already there from re-describing it.

**Trap:** the two camera descriptions now live in two files
(`system-prompts.ts` and `shared.ts`). Each has a comment pointing at the other.
If they drift, the model will claim the reference station for a view that was
not rendered from it.

## 2026-10-06 — Station against a fixed structure, a named background, container fill state

From a cozy-ASMR garden chapter (cottage north, tomato bed southeast, harvest
basket "beside the vegetable beds"). A close POV shot of hands picking a tomato
had the station "looking down toward the basket" and "basket at lower frame
right". Two renders came back with the cottage redesigned and in a different
place each time, and the basket already full of tomatoes and onions on the
first pick.

Three causes, three additions:

**1. A movable prop fixes no direction.** The station existed but was named
against the basket. The station rule now requires the look direction to be
named against a fixed structure.

**2. A close shot's background was unnamed, so the image model drew its own.**
"Name only what is visible" was being read as "name nothing behind the
subject". Close and medium shots now name the one large fixed structure behind
the subject, with its frame side, explicitly soft. One structure, not a list:
the existing ban on naming off-frame objects still holds, and a list would
widen the framing.

**3. The ledger said "basket empty" but the prompt did not.** The ledger rule
already lets deltas into `prompt`; container fill state is now named as an
always-delta, because image models fill containers by default.

**And upstream:** the location's FIXED LAYOUT said "beside the vegetable beds",
so the storyboard had to guess the side, and guessed wrong. The layout block
(`locationSpatialLayoutBlock`) now requires a relative position to name its
side. This affects newly extracted or regenerated location assets only.

**Rejected:** limiting these to the Cozy ASMR format block. The same failure
(an unanchored station, an invented background on close coverage) applies to
cinematic OTS and close-ups.

**Consequences:** existing storyboards and location assets do not change until
they are regenerated. The background clause can still pull focus if a model
ignores "soft"; that is the trade for not leaving the background to the model.

## 2026-09-13 — A frame-side claim needs a camera station, and a fixture needs an anchor

From one reviewed render (Buddha-era interior, a hall with a low platform
against the far end wall). The generated shot text was:

> "Medium over-the-shoulder shot from behind Kisa Gotami at frame left, toward
> the Buddha seated at frame right on the teaching platform. […] The reed mat
> and platform keep the established spatial relationship."

The render came back with **two** platforms — the canonical one still empty
against the far wall, plus a second one built at frame right with the Buddha on
it — and with the door wall, the water pot, and the mat grid all reinvented.

Three separate causes, three rules:

**1. The station was never written, so the furniture moved instead of the
camera.** The prompt asserted frame sides but not where the camera stood. From
the reference plate's own station the platform is dead centre, so "Buddha at
frame right" contradicts the plate. Faced with that, an image model moves the
cheap thing — the object — not the expensive one — the whole room seen from a
new position. The block now requires the station to be stated in `prompt`,
immediately after the opening framing and subject, named against visible things
rather than a compass bearing, and requires every frame-side claim to be
cross-checked against it. When a beat wants a fixture on a given side, the fix
is to move the camera to a station where it *is* on that side and say so — not
to assert the side and hope.

**2. A bare fixture name reads as an object to add.** "on the teaching
platform" names a thing without locating it in the picture, so the model built
one. Fixtures must now be named with their shell anchor and worded as already
standing there ("the low wooden platform against the far end wall").

**3. "Keeps the established spatial relationship" is a dead clause.** The block
already banned continuity assertions, but every example it gave was a compass
one, and the model did not generalise. An image model cannot act on a claim
about a different image: the clause spends attention and leaves the object it
names unplaced, which is why the reed mats — named only inside that clause —
came back rearranged. The ban now lists the non-compass phrasings by name.

A fourth line was added affirmatively rather than as a prohibition: on framings
that show much of the space, state what the room *holds*. Negation ("do not add
furniture") is recorded as backfiring in `system-prompts.ts`'s
`locationInterior` comment; the positive list is the same instruction in the
form that works.

**Rejected:**

- *Restating the FIXED LAYOUT in `prompt`.* Still rejected, unchanged — see the
  block's own header comment. A camera station is not a layout recital: it is
  one clause about where the viewer is, in terms the picture can show.
- *Deriving the station in code from `startState`'s anchor.* `startState` gives
  the character's position, not the camera's, and the two are independent.
- *Restricting the storyboard to the location's canonical station only.* It
  would hold consistency for free but costs every reverse angle and every OTS.
  Worth revisiting only if the rules above prove insufficient.

**Consequences and what is still open:**

- These rules make the model *choose stations more honestly*; they do not give
  it a picture of a non-canonical station. A tight over-the-shoulder is still
  being asked to move the camera ~90° and populate the room in one generation,
  off a wide empty plate. The structural fix is the two-step already half-built
  in `SYSTEM_PROMPTS.locationAltAngle`: generate the empty-room plate for each
  camera station the chapter actually uses, approve it, then shoot characters
  into that plate. Nothing today decides which stations a chapter needs — the
  candidate shape is `places[].stations[]` on the site map plus a `station`
  field per shot, so the app knows which plate to attach. Deliberately not
  built yet; the prompt-side rules were tried first because they cost no extra
  image generation.
- Shots generated before this change keep their text; the rules apply on the
  next generation or scene regeneration.
