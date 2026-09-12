# Storyboard scene regeneration

Covers: `lib/prompts/storyboard.ts` (`SCENE_SHOTS_SCHEMA`,
`regenerateSceneSystemPrompt`), `lib/openai.ts` (`regenerateSceneShots`,
`assignVoiceOvers`), `app/api/scenes/[id]/regenerate`, and
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
