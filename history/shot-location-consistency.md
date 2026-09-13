# Shot prompts vs the location reference image

Covers: `lib/prompts/shared.ts` (`locationSpatialConsistencyBlock`),
read alongside `lib/prompts/shared.ts` (`locationSpatialLayoutBlock`,
`identityAnchorBlock`) and `lib/constants/system-prompts.ts`
(`locationInterior`, `locationAltAngle`, `locationFloorPlan`).

## Standing position

The location's reference image is the visual truth. The shot `prompt` is a
delta on it, never a re-description of it. Everything below is a rule about
what the delta may and may not say — none of it reintroduces layout prose into
`prompt`, which stays recorded-rejected here and in
`history/storyboard-site-map.md`.

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
