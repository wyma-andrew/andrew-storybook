# Shot copy mark

Covers: `lastCopiedKey` / `readLastCopiedShot` / `markCopied` and the shot card
border in `app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`.

## Standing decisions

- The problem it solves: copying a shot prompt means leaving the app for the
  image tool and coming back to a wall of near-identical cards. The app has to
  remember where the user was; they should not have to.
- Only the shot id is persisted (localStorage, per chapter). Number and label
  are resolved from the live scene list on render, so a mark pointing at a shot
  that no longer exists — a regenerated scene, another device — highlights
  nothing instead of showing a stale "3.2".
- The mark does not expire. It persists across reloads until another shot is
  copied. It is a place marker, not a toast.
- Last copy wins outright, including a copy of an earlier shot: going back is
  deliberate.
- Copying Image or Video moves the same mark — two prompts, one shot.

## 2026-09-13 — Bottom place-marker strip replaced by a card border

The mark was first a strip at the bottom of the scroll region (`ShotPlaceMarker`)
showing "At shot 2.1 … Next 2.2", with jump and clear buttons, taking the
footer's slot.

Replaced with a border on the copied shot's own card — `border-ok` (green), not
`border-accent`: accent is already the app's interactive/selected color, and a
mark meaning "done, copied" reads better as green than as selection. Reasoning: the
strip described a location in words when the location itself was on screen and
could simply be lit up, and it needed a whole navigation vocabulary — next shot,
jump, clear — to make up for pointing at nothing.

Removed with it, deliberately, not as an oversight:

- **The "Next 2.2" affordance and `jumpToShot`.** Chapter order is already the
  reading order; the next card is the next card.
- **The clear (×) button.** Nothing to dismiss once the mark is a border, and
  copying another shot moves it.
- **The footer swap.** `<Foot />` is unconditional again.

Accepted consequence: with every scene collapsed (the default fold state) the
mark is invisible until its scene is opened. That is fine — the border is a
"you are here" for someone already reading the shots, not a chapter-level index.
