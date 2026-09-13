# Storyboard scene regeneration

Covers: `lib/prompts/storyboard.ts` (`SCENE_SHOTS_SCHEMA`,
`regenerateSceneSystemPrompt`), `lib/constants/coverage-modes.ts`,
`lib/openai.ts` (`regenerateSceneShots`, `assignVoiceOvers`),
`app/api/scenes/[id]/regenerate`, and
`app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`.

## 2026-09-11 — One scene can be re-shot without rebuilding the chapter

**Decision:** each scene card carries its own Regenerate action. It replaces
only that scene's shots; the `scenes` row (index, title, slug) and every other
scene are left untouched.

The model still receives the whole tagged script and every chapter asset — the
full storyboard system prompt is reused verbatim, with a scope block appended —
so a regenerated scene follows the same shot rules as one produced by a full
generation. The scope block also carries a continuity handshake: the previous
scene's last `endState` and the next scene's first `startState`. Neighbours are
not regenerated, so without that handshake the state ledger breaks at both seams.

**Voice Over is remapped chapter-wide, not per scene.** `voice_over_segments`
boundary shots are `on delete cascade`, so deleting one scene's shots silently
destroys any narration segment anchored in it — including one that spans into a
neighbouring scene. After the new shots are generated, `assignVoiceOvers()` runs
over the projected chapter shot list (stored scenes, this scene's shots
swapped), is validated with `resolveVoiceOverAssignments()` **before** anything
is deleted, and then all of the chapter's segments are rewritten. This keeps
`history/voice-over.md`'s rule that narration is assigned over a finalized,
whole-chapter shot list and can never overlap.

**Rejected:**

- *Letting the model re-split the scene* (new title/slug, merging or splitting
  into several scenes). Scene indexes are the addressing scheme for narration
  ranges and shot labels; churn there turns a local retry into a chapter-wide
  renumber.
- *Preserving narration segments that do not touch the regenerated scene and
  remapping only the intersecting ones.* Kept segments would have to be clamped
  against freshly-numbered shots to stay non-overlapping, which is more moving
  parts than one extra AI call, and a partial remap can still leave narration
  pointing at visually stale coverage.
- *Blocking the action when a narration range overlaps the scene.* Safe, but it
  disables the feature exactly on the chapters that most need a local retry.
- *Sending only the scene's slice of the script.* Slicing is done by the model
  from the `[SCENE]` tags; re-deriving that boundary in code would add a second,
  divergent parser.

**Consequences:**

- A scene regeneration discards that scene's `prompt_override` /
  `video_prompt_override` edits, and discards narration `text_override` for the
  **whole chapter** — the same trade a full regeneration already makes.
- It costs two AI calls when the chapter has Voice Over, one when it does not.
- The endpoint returns the chapter's full scene list, because narration ids and
  ranges elsewhere in the chapter may have changed. `scenes/:id/regenerate`
  auto-invalidates `scenes*`, which nothing reads — the page refetches
  `chapters/:id/storyboard` and `chapters/:id/voice-overs` explicitly.
- The scene header is a `<div>` wrapping the accordion `<button>` plus the
  regenerate button; a button cannot legally nest inside a button.

## 2026-09-13 — A re-shoot is given a shot-count target, chosen by the user

Reported: regenerating a scene often comes back with MORE shots than the take
it replaced. Confirmed as structural, not random.

The pass never sees the shots it replaces. The route reads the chapter's scenes
for the ledger handshake and the narration remap, but sends the target scene's
own shots nowhere — so coverage is re-derived from scratch on every press. And
the drift has a direction, because every count rule in the storyboard system
prompt is a **floor**: one distinct shot per [VOICE_OVER] block, split dialogue
too long for one clip, an establishing shot for a location the scene opens,
camera variety. The only downward pressure, `shotDistinctnessBlock`, judges one
shot against its neighbour and never a total. Floors fire on hard triggers
(line length, block count); the ceiling fires on judgement. Net: a ratchet.

**Decision: `SceneRegenerationTarget` carries `previousShotCount` and a
`coverageMode` (`same` | `tighter` | `more` | `free`), and the scene menu offers
one entry per mode. `same` is what the plain "Regenerate scene" action became.**
`lib/constants/coverage-modes.ts` turns the pair into one instruction appended
after the scope block; `count` null (a scene with no stored shots) reads as
`free` whatever the mode.

The mode is the user's, not the model's, because only the user knows WHY they
regenerated. Re-shooting one bad prompt wants the same coverage; a scene that
genuinely reads thin wants more. A single automatic anchor would be wrong half
the time, and wrong in the direction that fights the user.

Each instruction states the previous count as fact, gives the direction, and
keeps the shot rules above it authoritative — `tighter` may not drop a script
beat, `more` may not add a re-labelled moment, `same` may exceed the count when
a Voice Over block or a long dialogue line forces it.

**Rejected:**

- *Sending the previous shots' prompts as well as the count.* The user is
  regenerating because those prompts were wrong; feeding them back invites the
  model to reproduce them.
- *A silent anchor with no UI.* Same failure as above in the other direction —
  a scene that deserves more coverage could never get it without editing the
  script.
- *Deriving a count budget in code from the scene's script lines.* Needs a code
  parser for scene boundaries, which is recorded-rejected above as "a second,
  divergent parser".
- *A numeric input for an exact shot count.* Precision the model cannot honour
  against the floors it must also satisfy, and one more thing to fill in on the
  common path.

**Consequences:**

- `POST scenes/:id/regenerate` now takes an optional `{ coverageMode }` body.
  A request without one regenerates at `same` — so a retry from a stale client
  gets the anchored behaviour, not the old drift.
- `same` does NOT guarantee an identical count; it is prompt pressure, not a
  constraint the schema can enforce. A scene whose Voice Over coverage was
  short before will still come back longer, correctly.
- The shot count still changes narration ranges chapter-wide on every mode, so
  the confirm copy is unchanged apart from one leading line naming the target.
