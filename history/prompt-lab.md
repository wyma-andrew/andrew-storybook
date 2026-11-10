# Prompt Lab

Covers: `app/(app)/labs/prompt/**`, `app/api/labs/prompt/**`, `lib/prompt-lab.ts`,
`lib/prompt-lab-inputs.ts`, `lib/storyboard-inputs.ts`, `storyboardMessages` /
`runStoryboardPass` / `parseStoryboard`, `runSceneShotsPass` / `parseSceneShots` and `extractAssetsMessages` /
`runExtractAssetsPass` / `parseExtractedAssets` in `lib/openai.ts`, migrations
`20261028090000_prompt_lab_runs.sql`, `20261028120000_prompt_lab_asset_pass.sql` and
`20261029090000_prompt_lab_parts.sql`, `20261029120000_prompt_lab_versions.sql`, `20261030090000_prompt_lab_motion_overrides.sql`; `lib/prompts/parts.ts` and the
`*SystemPromptParts` builders and `sceneScopePrompt` in `lib/prompts/storyboard.ts` / `extract-assets.ts`.

## 2026-11-10 — Nav label is "Stories Lab", a top-level row

**Decision, requested by the user:** the sidebar entry is renamed "Stories Lab"
(page heading too) and is its own top-level row directly after Stories, no
longer indented as a sub-item. Still admin-only; URL stays `/labs/prompt`
for the same reasons as before.

**Why:** the user wanted a flat nav.

**Supersedes:** "Nav sits under Stories" in the original entry below. Code,
table and history names keep "Prompt Lab"; only the visible label changed.

## 2026-11-02 — Re-shoot one scene of a storyboard run

**Decision.** Each scene column of a storyboard run has a Re-shoot button. It sends
the editor's current system prompt and user message, plus the same Single scene
scope block production's scene regenerate appends (`sceneScopePrompt`, split out of
`regenerateSceneSystemPrompt`). The block reads the continuity seams from that run's
output: previous scene's last `endState`, next scene's first `startState`, the run's
site map, the scene's lighting and shot count, and the chosen coverage mode. The
block is editable in the dialog. The call is `runSceneShotsPass`, also used by
`regenerateSceneShots`, with the same `scene_shots` schema.

The result is saved as a new storyboard run whose output is the source run with only
that scene's shots replaced, and it opens in compare against the source. Its origin
is in `context.sceneRegen` (`sourceRunId`, `sceneIndex`, `coverageMode`), which is
jsonb, so no migration was needed.

**Why the editor's prompt and not the source run's.** The point is testing a prompt
edit on one scene without paying for a whole storyboard. The seams come from the
source run, so the scene still slots into that run.

**Consequences.**
- The seams come from a lab run, not stored scenes, so a re-shoot can differ from
  production's for the same chapter once the storyboard page's scenes diverge from
  the run.
- Voice Over remapping is not run, as with every lab run.
- `system_prompt_edited` compares against the code prompt plus the default scope
  block, so an edited scope block marks the run edited.
- Load prompts on a re-shot run drops the `sceneScope` block.
- The token and latency numbers cover only the scene call.

## 2026-10-30 — Copy all assets of an extraction run at once

**Decision.** Each asset run's column has a Copy all assets button. It copies every
Characters, Locations and Props asset under a section header, with the same prompt
the single-asset Copy gives (`withAssetContext` with the kind's preset), so the lab
matches the Assets tab.

## 2026-10-30 — Copy all scenes of a storyboard run at once

**Decision.** Each storyboard run's column has a Copy all scenes button, which joins
every scene's copy (the per-scene Copy scene text) in scene order. The per-scene
button stays.

## 2026-10-30 — Copy a scene at once, by its title

**Decision.** Each scene column in a storyboard run has a Copy scene button. It copies
the scene under its title, then each shot's Start Frame and Video prompt, using the same
composition as the per-shot copies (`shotCopyTexts`), so the lab and the storyboard page
agree.

**Consequence.** With two runs compared, each column copies its own run's scene.

## 2026-10-30 — Motion preset edits are saved with prompt versions

**Decision.** Motion preset text edited in the lab is stored on the prompt version
in `prompt_lab_versions.motion_overrides` (`{ styleId: { mode: text } }`). Choosing a
version loads its motion text into the editor, and Save as new / Update write it
back. The text still reaches copies only at copy time, so runs store no motion text.

**Supersedes** the 2026-10-29 entry "Motion preset text is editable in the lab, not
saved", which rejected saving motion overrides in versions because a version would not
reproduce what the model saw. Approved by the user on 2026-10-30. The trade-off stands:
a version reproduces the copied motion text, not the model's output, which the run
already records.

**Consequence.** Edits stay in page state until saved. The editor is per run style, and
the mode each shot uses is still the guard's resolved mode, so a motion edit shows only
on shots with that resolved mode.

## 2026-10-29 — Shot cards show the motion preset and the copied video prompt

**Problem.** The lab showed the raw `motionMode` nowhere and copied only the
Start Frame prompt, so the motion paragraph that production composes at copy
time (`withFrameDescription`) was invisible when judging a motion change.

**Decision.** Each shot card resolves its mode the same way production does
(`resolveMotionMode` with the run's `motionStyleId`), shows it as a tag, and
shows the Video prompt copy composed exactly as the storyboard page copies it,
including the motion paragraph. The run still stores the raw model output.

**Consequence.** A run's motion tag can differ from the model's raw
`motionMode` when the guard clamps it. That is intended: it is what production
would store.

## 2026-10-29 — Saved prompt versions apply across stories

**Problem.** Edits tested on one story had to be re-typed block by block to try
them on another, because Load prompts restores a whole run — including that
chapter's style, region and script.

**Decision.** A *version* (`prompt_lab_versions`) stores only the system-prompt
blocks that differ from the code default, keyed by block `key`, per pass.
Choosing it swaps those blocks into whichever chapter's freshly built prompt is
open; every other block, and the whole user message, stays that chapter's own.
The choice sits in the URL (`version_<pass>`), so it survives switching chapter
or story. Runs record `version_id`.

**Consequences.**
- A block a chapter's prompt lacks (empty style block, a non-ASMR story) is
  skipped and named on the page.
- An edited story-dependent block — Visual style, Region adaptation, Motion
  style, Aspect ratio (it embeds the ratio) — is saved with the story's values
  baked in, and will carry them to every other story. Edit those only when that
  is the point.
- A version is keyed to block keys, so renaming a block key in
  `lib/prompts/*` orphans that block in saved versions (it shows as skipped).

## 2026-10-29 — Prompts are shown as their blocks, copied whole

**Decision.** `storyboardSystemPromptParts()` and `extractAssetsSystemPromptParts()`
return the system prompt as ordered `{ key, label, source, text }` blocks — the
pass's own sections, then each `shared.ts` block — and the old string builders
are now `joinPromptParts()` of them. The user message is split the same way
(Known assets / Script). Prompt Lab shows each prompt as one group with a child
per block, in send order, each editable and resettable on its own. The group's
**Copy all** copies every block under a `===== n. Label (source) =====` header,
for reading outside the app; **Copy raw** copies the joined text exactly as the
pass sends it. Runs store the blocks (`system_parts`,
`user_parts`) so Load prompts restores them block by block; older runs load as
one "Full" block.

**Trap.** The join has no separator: each block carries its own newlines. The
split was verified byte-identical to the previous prompt across every region,
style, aspect, motion style and format (144 combinations). New prompt text must
go inside a block (or be a new block), never between them, or the lab and
production stop matching. An empty block (e.g. no style, non-ASMR format) is
dropped by `nonEmptyParts`, so block numbers can shift between stories.

## 2026-10-28 — Asset Extraction pass, and chaining it into the storyboard

**Decision.** The lab gains a Pass picker: Storyboard Generate or Asset
Extraction. Extraction is split the same way as the storyboard pass
(`extractAssetsMessages` → `runExtractAssetsPass` → `parseExtractedAssets`), and
`extractAssets()` now calls those, so the lab and Analyze still send the same
request. Its preview is the **Analyze** request (no existing-names block); the
Re-Sync variant is not in the lab.

Asset output is grouped into Characters / Locations / Props. Each card shows the
copied prompt with the same preset the Assets tab uses (`withAssetContext` with
the kind's reference-sheet preset, a location's interior/exterior view), plus
looks, scenes and evidence. `storyAnalysis` — logged and discarded in production
— is kept on the run and viewable. Compare aligns assets by kind and exact name,
so an asset one run produced and the other did not shows as "Not in this run".

**Use as storyboard input.** A successful extraction run can feed the
storyboard pass: the storyboard preview is rebuilt with Known Assets from that
run instead of `chapter_assets`, and the run records `asset_run_id`. This lets
an extraction prompt change be judged by the shot prompts it leads to, without
touching the chapter.

**Consequences.**
- Chained assets are the raw extracted prompts. Production's Analyze swaps a
  bible-matched asset's prompt for the bible entry's, so a chained run can
  differ from what Analyze + Generate would produce for a story with a bible.
  The page says so in the banner.
- "default" effort means the production setting (`STORY_REASONING_EFFORT`,
  medium since 2026-10-29). The run stores what was actually sent.
- Deleting an extraction run sets `asset_run_id` to null on storyboard runs made
  from it; their stored prompts still show what was sent.


## 2026-10-28 — In-app test bench for the storyboard pass

**Problem.** Judging whether a prompt change improves shot image prompts meant
re-generating a real chapter's storyboard and eyeballing it. That overwrote the
previous result, so nothing could be compared, and nothing showed what was
actually injected into the request.

**Decision.** An admin-only page at `/labs/prompt`. For a chapter it shows the
exact system prompt and user message the storyboard pass sends, plus the
injected context (region, style, format, aspect, motion style, asset count).
Both are editable. A run picks the model and reasoning effort, is saved to
`prompt_lab_runs`, and its output renders as scene → shot cards showing the
**copied** Start Frame prompt (`withStyle` with style, scene lighting and
framing optics) — the text that actually goes to the image model, not the
stored shot prompt. Two runs can be compared scene by scene, side by side.

- **The lab and production share one code path.** `loadStoryboardInputs`
  (reading the chapter) and `storyboardMessages` (building the messages) are
  used by both the Generate route and the lab. A lab that rebuilt the prompt
  itself would drift from production and test the wrong thing. Keep any future
  storyboard-input change inside those two functions.
- **Runs are a sandbox.** A run never writes scenes, shots or Voice Over. Voice
  Over mapping is not run, because it does not affect image prompts.
- **Edited prompts are experiments, not configuration.** System prompts are
  code constants (`lib/prompts/`). A better prompt found in the lab is ported
  back into code by hand; there is deliberately no "save as default".
- **Runs store the prompts as sent**, with `*_edited` flags, so an old run
  stays reproducible after the code constant changes. "Load prompts" puts a
  run's prompts back into the editor.
- **Nav sits under Stories** *(superseded 2026-11-10, see top)*, as an indented admin-only sub-item, because it
  tests the Stories storyboard pass. The URL stays `/labs/prompt`: moving it
  under `/stories` would also light up the Stories item and put it behind the
  `stories` feature layout instead of the admin gate.

**Rejected.**
- *A CLI eval script with fixtures.* Faster to build, but the user wanted to see
  the injected prompts and the output in the UI.
- *An external prompt tool (promptfoo, etc.).* The prompts are assembled in code
  from schema, region, style and format, so copying them out would diverge.

**Left open / consequences.**
- Single-asset regenerate is not in the lab yet. (Scene re-shoot was added on
  2026-11-02.)
- No image rendering yet. Phase 2 is rendering selected shots with the image
  model and A/B scoring.
- A run is one synchronous request (`maxDuration = 300`). Leaving the page
  mid-run loses the spinner, but the run is still saved when it finishes.
- A failed run (API error or unparseable JSON) is still saved, with `error`
  and whatever raw output came back.
