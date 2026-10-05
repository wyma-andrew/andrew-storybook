# Motion styles

Covers: `lib/constants/motion-styles.ts`, `lib/motion.ts`,
`lib/prompts/shared.ts` (`motionStyleBlock`), `lib/prompts/storyboard.ts`
(`motionMode` in the schema), `lib/prompt-copy.ts` (`withFrameDescription`),
the motion controls in `components/StoryControlsMenu.tsx` and the storyboard
page, and the read-only list in `app/settings`.

## 2026-10-04 — Added "Cozy ASMR" motion style

`id: "cozy-asmr"`, default mode `normal`. Companion to the Cozy Hand-drawn
Anime visual style for POV cooking / daily-routine clips. Every mode keeps the
camera locked and names the failure modes those clips show (morphing, extra
fingers, objects popping in or out).

The four existing modes were reused rather than adding a `process` mode: in
this style `normal` *is* the hand-process shot, and `micro` is the ambient
cutaway (rain, steam, flame). The selection rule says so. A new enum value would
need a DB check-constraint change and a guard update for no gain.

## 2026-09-10 — Motion is a story-wide style plus a per-shot mode

**Decision: motion behaviour is never written by the AI. The model classifies
each shot into one of four motion modes; the motion paragraph itself comes from
a predefined table and is composed at copy time.**

The trigger was the Buddha region. Cinematic movement applied uniformly to
every shot makes sacred/teaching coverage look over-animated and obviously
AI-generated, while applying stillness uniformly freezes walking and travel
shots. Neither a single story-wide motion string nor free-form per-shot motion
text solves that, so the feature is two pieces:

- `stories.motion_style_id` — the policy. Which modes are allowed, which mode a
  shot falls back to, and the actual wording each mode gets.
- `shots.motion_mode` — the classification. One of `micro | dialogue | normal |
  emotional`.

Two styles ship: **Natural** (`natural`, default mode `normal`) and **Sacred
Cinematic** (`sacred-cinematic`, default mode `micro`).

### Why the text is not AI-written

Letting the model write its own motion wording *is* the current behaviour, and
it is what produces uniformly over-animated clips. A fixed paragraph per mode
also means the negative list ("no walking, no gestures, no exaggerated facial
animation") is present in every copy, verbatim, instead of surviving at the
model's discretion.

Accepted consequence: the motion paragraph cannot name what is actually in
frame. It says "robes, cloth, and nearby light environmental elements" rather
than "bodhi leaves and oil lamps", because it is written once and reused across
every shot in the story. **This is a deliberate trade, not an omission to fix.**
If shot-specific environment motion turns out to matter, the correct change is
to *append* an AI-written line after the predefined paragraph, not to hand the
paragraph back to the model.

### Why the mode is AI-tagged rather than derived

The original plan was zero AI in the motion path: derive the mode from the
script's `[CHARACTER]`/`[DIALOG]`/`[ACTION]` tags. **That is not possible with
the current data.** Generation sends the whole script and gets scenes back;
nothing maps a shot to the script lines it covers, so there is no deterministic
way to ask "does this shot contain dialogue".

Rejected alternatives:

- *Have the model return covered line indices, then derive the mode.* More
  model output to get wrong, and the derivation still depends on the model —
  the determinism would be cosmetic.
- *Regex the videoPrompt for locomotion verbs.* Needs a second verb list for
  Burmese, and silently mis-modes anything the list misses.

What is deterministic is the guard, `resolveMotionMode()` in `lib/motion.ts`.
It clamps an unknown or disallowed mode to the style's default and corrects the
two mislabels that produce visibly wrong clips: a shot quoting a spoken line
but tagged still (a talking head with a frozen mouth), and a shot tagged
`dialogue` with no line to speak (invented gesturing). It keys off the
`Dialog: "..."` marker the storyboard prompt already mandates in every speaking
shot's videoPrompt. It is a guard, not a classifier — everything else is taken
at face value.

### Structure decisions

- **One `motionMode` enum, not five metadata fields.** The proposed
  `camera_motion` / `character_motion` / `environment_motion` /
  `motion_intensity` set is derivable from the mode, and `camera` already
  exists on the shot. Five enums are five chances for model drift.
  `motion_intensity: 1-5` was rejected outright — an LLM cannot calibrate 3 vs
  4 consistently across shots, so the number would be noise presented as
  control.
- **Composed at copy time, never stored on the shot.** Same reason as visual
  style (`lib/prompt-copy.ts`): switching a story's motion style must not
  require regenerating the storyboard. `withFrameDescription` gained a
  `motionText` argument; the paragraph trails the videoPrompt so the action and
  any quoted line stay adjacent to the frame description they animate.
- **No fallback between modes.** Every style defines text for all four modes,
  duplicating wording where two modes genuinely want the same thing. This
  mirrors the region rule in `history/visual-styles.md`: a fallback needs a rule
  about when it applies, and that rule is the bug.
- **`DEFAULT_MOTION_STYLE_ID` is an explicit constant, not `MOTION_STYLES[0]`.**
  `history/visual-styles.md` records the array-position fallback as a live
  footgun; there was no reason to reproduce it in a new file.
- **`motion_style_id` has no DB check constraint** (styles are code-defined and
  a dangling id already resolves to the default), but **`motion_mode` does** —
  it is a closed enum owned by code and every write passes the guard.

### Not coupled to region

`buddha` does not force Sacred Cinematic. Region and motion style are
independent story-wide fields; a Buddha-era story can use Natural, and a
Myanmar or English story can use Sacred Cinematic. Binding them would
reintroduce exactly the cross-axis rule that
`history/visual-styles.md` rejects. Preselecting Sacred Cinematic when a new
story picks the Buddha region is acceptable if it is ever wanted; forcing it is
not.

### Naming

The first proposal named the styles `Default` and `Sacred Cinematic`.
"Default" names a position, not a behaviour, and stops being true the moment a
third style exists or the default changes per region. Nothing else in this
codebase is named for being the default (`3D Animation`, `English`), so the
neutral style is **Natural**.

### `emotional` has no automatic trigger

Nothing in the script reliably marks a realization beat, so the model tags it
when it sees one and the storyboard page exposes a per-shot mode picker to set
it by hand. That picker writes `shots.motion_mode` directly — there is no
`*_override` counterpart like the prompts have, because a mode is a
classification rather than text, and a hand-picked mode simply replaces the
generated one.
