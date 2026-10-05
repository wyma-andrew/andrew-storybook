# Story formats

Covers: `lib/constants/story-formats.ts`, `lib/prompts/storyboard-asmr.ts`,
`lib/prompts/storyboard.ts` (`storyboardSchema`, `sceneShotsSchema`, the
`format` argument), `lib/openai.ts` (`generateStoryboard`,
`regenerateSceneShots`), `app/api/chapters/[id]/storyboard/generate`,
`app/api/scenes/[id]/regenerate`, `app/api/shots/[id]` (`soundPrompt`), the
Format picker in `components/StoryControlsMenu.tsx`, the Sound box on the
storyboard page, `lib/story-transfer.ts`, and migration
`20261004162733_story_format_and_sound_prompt.sql`.

## 2026-10-04 — Cozy POV ASMR is a story format, not a separate feature

**Decision:** `stories.format` (`cinematic` default, `cozy-asmr`) selects what
the storyboard pass is asked to produce. The cozy format reuses the whole
Script → Assets → Storyboard flow; only the storyboard prompt and schema differ.

The target is the cozy anime POV / cooking-ASMR video: a daily routine shot as
first-person hands close-ups, process steps, environment cutaways, a resting
ending, with sound carrying half the experience. Its companions are the
**Cozy Hand-drawn Anime** visual style and the **Cozy ASMR** motion style
(see `history/visual-styles.md`, `history/motion-styles.md`). The format does
not select them; the three stay independent axes, as region and motion style
do.

**The ASMR rules are appended, not a forked prompt.** `cozyAsmrFormatBlock()`
is added at the end of the unchanged cinematic prompt and declares that it wins
on conflict. The cinematic prompt's continuity machinery — site map, state
ledger, layout anchors, scene lighting, shot scale — is exactly what holds a POV
routine together shot to shot, and a fork would drift from it. The cinematic
path was verified byte-identical (prompt and schema, all regions, full and
single-scene) against the version before this change.

**Sound is a separate per-shot field, `shots.sound_prompt`**, with a
`sound_prompt_override` like the other prompts. It is required in the ASMR
schema and absent from the cinematic schema, so cinematic generations never pay
for it and stay null. It is shown and copied on its own in the Video tab, never
folded into the video prompt: sound is laid in during editing, and image-to-video
tools treat sound wording in a motion prompt unpredictably.

**Single-scene regeneration reads the story's format** and uses the same
prompt and schema as a full pass. Without it, re-shooting one scene of an ASMR
chapter would silently return cinematic coverage with no sound.

**Rejected:**

- *A new top-level feature beside Stories.* It would duplicate assets, bible,
  storyboard, and export for what is a prompt and one column.
- *Baking POV, cottage, or rain into the visual style.* Those are shot,
  location, and lighting decisions; see `history/visual-styles.md`.
- *A `process` motion mode.* `normal` already covers hand-process shots in the
  Cozy ASMR motion style; a new enum needs a check-constraint change and guard
  update for nothing.

**Consequences:**

- Changing a story's format applies only after regenerating storyboards —
  unlike style and motion, it changes generated content, not copied text.
- Switching a story back to Cinematic leaves existing sound prompts on its
  shots until the storyboard is regenerated.
- Asset extraction is unchanged. An ASMR script with no named protagonist may
  extract no character, or a generic one; the storyboard still lists whatever
  character exists on hand shots. Deliberately left open until real scripts
  show whether extraction needs a format-aware rule.
- Story exports carry `format`, `soundPrompt`, and `soundPromptOverride`.
  Older exports without them import as Cinematic with null sound; the bundle
  version was not bumped because the change is additive.
