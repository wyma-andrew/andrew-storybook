# Camera stations and plates

Covers: `lib/site-map.ts` (`SiteMapStation`, `REFERENCE_STATION`),
`SITE_MAP_SCHEMA.places[].stations` and `assetsUsed.station` in
`lib/prompts/storyboard.ts`, the STATION PLATES / path / movement rules in
`lib/prompts/shared.ts`, `locationStationPreset` in
`lib/constants/system-prompts.ts`, `cleanShotAssets` in
`lib/storyboard-assets.ts`, `components/CameraPlates.tsx`, and
`supabase/migrations/20261010051504_station_plates.sql`.

> **Superseded in part (2026-10-28):** the story Asset Bible was removed; anything below about bible entries, bible matching or promotion is history only. See `history/asset-bible-removal.md`.

## 2026-10-10 — Each shot stands at a site-map station with its own plate

**Problem, from the user.** A forest trail with a boulder: a traveler walks
past while the bandit waits on the rock, then the bandit gets ahead of him and
blocks him. Every shot was generated against the one location reference image,
so the scene could never leave that frame. The passing shot, the shot from
behind, and the face-off all needed directions the reference does not show,
and the image model invented them. `history/shot-location-consistency.md`
(2026-09-13) had recorded this as open, with the candidate shape
`places[].stations[]` plus a per-shot station. This builds that shape.

**Decision.**
- The storyboard's site map lists, per place, the camera stations the chapter
  actually uses. The first is always `reference`, the reference image's own
  station. Any other station is added only when a shot needs a direction the
  reference can't show (max 4). Each `view` names position, look direction and
  frame sides against FIXED LAYOUT features.
- Every shot names its station in `assetsUsed[location].station`.
  `cleanShotAssets` drops unknown keys. Scene regeneration must reuse the stored
  stations, never invent one, because the plates may already be rendered.
- A shot is written AT its station and treats that station's plate the way THE
  REFERENCE STATION rule treats the reference: same viewpoint, delta only.
  Framing may tighten; the camera does not leave the station.
- Plates: the storyboard page's Camera plates panel copies
  `locationAltAngle` with the view slot filled from the station
  (`locationStationPreset`), and stores the upload as a `chapter_images` row
  linked to the location with `station_key`. Shot chips show `LOCATION · station`.
- Movement: a place people travel along names its two ends in FIXED LAYOUT. The
  ledger records which side of a landmark a character is on and which end they
  head toward, including who is ahead after an overtake. Screen direction is
  derived from the station, and a face-off starts a new axis.

**Rejected.**
- Restricting every shot to the reference station — still rejected
  (2026-09-13): it costs every reverse angle.
- Letting the user edit stations — the site-map entry's rejection of an editable
  map stands. The panel shows stations so plates can be made, nothing more.
- Stations on the location asset (extraction time). Which directions a chapter
  needs is a shooting decision, made when the shots are made.

**Consequences.**
- Each non-reference station costs one extra image generation.
- A full storyboard generation rewrites the site map, so station keys can change.
  A plate whose key disappears stays on the location card but leaves the panel.
  Scene regeneration keeps the stations.
- The shot copy does not attach plates automatically; the chip says which one.
- Locations extracted before this change have no path-end bullet until
  regenerated; stations still work, the travel wording is weaker.

## 2026-10-10 — Stations also differ by position along a path

From the user, right after the first version: a station was added only for a
new *direction* (a reverse). But when characters keep walking well past the
boulder, it should fall far behind them. A station beside the boulder can't
show that, however it is framed. Stations on a place people move along now
also differ by *position*: shots that follow walkers on stand at a station
farther along the path. Each `view` states how near or far each landmark is.
The cap went from 4 to 5 per place, so two directions × two positions plus one
side view fits.

## 2026-10-10 — "Copy distant view" preset

A generic alternative to a per-chapter position station, written with the
user. `SYSTEM_PROMPTS.locationDistantView`, on the location card's ⋮ menu and on
the Bible location card, copies the approved view's prompt with the camera
pulled straight back 30–40 m along the reference's own line of sight. Every
landmark keeps its frame side and only shrinks, and the new foreground may hold
only terrain already in the reference. It is generic on purpose: the user found
a "Past the rock" station prompt too specific to reuse. It does not create a
station. Shots still point at stations; this is a manual plate the user picks
when a shot wants the place farther off. The distance is fixed in the text and
edited by hand after copying.
