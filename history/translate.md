# Translate

Covers: `app/(app)/(translate)/translate/**`, `components/translate/**`,
`app/api/(translate)/translate-projects/**`, `lib/translate*.ts` (including `lib/translate-transfer.ts`), the
`translate_projects` migration, and the Translate sidebar item.

## 2026-09-29 — Restore Hobby-compatible route limits

**Decision:** set Translate align, generate, and render routes back to
`maxDuration = 300` after all three returned to `3600` in code.

**Why:** Vercel Hobby rejects a deployment when any function requests more
than 300 seconds. This restores the 2026-09-27 decision and avoids fixing only
the first route named by the builder error.

**Rejected:** changing only Auto Sync's align route; the other two routes would
cause the same deployment failure.

## 2026-09-28 — Shorten the new-project action on mobile

**Decision:** show “New” beside the plus icon in the Translate project-list
header below `sm`; retain “New project” on wider screens.

**Why:** the shorter label leaves room for the adjacent Import action in a
narrow header without changing where the link goes.

## 2026-09-27 — Cue edit is a bottom sheet without a backdrop

**Decision:** Editing a translated cue opens a bottom `Drawer` (max 560px content, 3-row text) instead of a dialog, with no backdrop and no outside-click close. Start and End each have a "Now" button that copies the video's current time.

**Why:** User request: set times from the playhead while playing, seeking, or stepping frames with the sheet open.

**Consequence:** The page stays interactive behind the sheet. Retiming the same cue on the timeline while the sheet is open does not update the form's fields; the form saves what it shows.

## 2026-09-27 — Timing selector is a Select before View

**Decision:** The Original / Synced Original / Synced Translated pill switch becomes a GeckoUI `Select` at the start of the action row under the cue list. The actions after it show only when the selected timing is the active one; selecting a timing without data (no sync yet, no translated SRT) shows its empty state below instead.

**Why:** User request: the pill switch scrolled sideways on mobile and sat apart from the actions it controls.

View and Paste SRT moved into the ⋯ menu (with Download and Replace); Prompt stays a button.

**Supersedes:** The pill switch kept in the SRT section by "Timing actions sit under the cue list".

## 2026-09-27 — Settings move into a popover; Customize is full width

**Decision:** The desktop settings column is removed. Customize spans the full width, and a Settings button in its header opens the same settings panel as a popover (340px, scrolls inside, max 70vh). Below `md` the existing bottom sheet is unchanged.

**Why:** User request: the preview and timeline need the width more than the settings do.

**Supersedes:** "Customize and settings share one row" and "Fixed preview height; settings panel follows the left column" (the fixed preview height stays, reduced from `min(60vh, 560px)` to `min(45vh, 420px)` at the user's request).

The separate video header row is gone once the upload is ready: the Customize header shows the file name (truncated to ~220–320px, full name and size in the tooltip) in place of "3. Customize", with Replace video, Auto Sync, and Settings beside it; the replacement notice and upload bar sit under it.

Below `md` the same header button opens the bottom sheet (icon only below `sm`); the sticky bottom bar with Settings and Render is removed, since Render is inside the settings panel (user request).

**Consequence:** The popover does not close on outside clicks, because blur areas are dragged on the video while it is open; it closes from its X or the Settings button. On desktop, Save and Render are only reachable inside the popover.

## 2026-09-27 — Zoomable timeline with frame stepping

**Decision:** The preview's range slider is replaced by `components/translate/TranslateTimeline.tsx`: a ruler, playhead, and one track of cue blocks for the active timing, zoomable from fit-to-width down to 14 px per frame (buttons, Ctrl/Cmd+wheel). Only cues and ticks in view are rendered. Click or drag on the timeline seeks with a mouse; with touch, a swipe only scrolls and a tap (under 8 px of movement) seeks, so panning does not move the playhead. The playhead itself can be dragged with either. ←/→ move one frame (no on-screen step buttons, removed at the user's request) (Shift: 1 s); time shows as m:ss:ff. With Synced Translated active, dragging a cue edge retimes it (snapped to frames, the video follows the edge) and saves through the same `applyCueEdit` neighbour-trim rule as the edit modal; double-click opens that modal.

**Why:** Subtitle timing needs frame accuracy and a view of neighbouring cues, like CapCut; a slider with 0.05 s steps over a 50-minute video could not show either.

**Rejected (for now):** A thumbnail filmstrip; planned as a later step.

**Consequence:** Frame rate is not stored. It is assumed 30 fps and measured with `requestVideoFrameCallback` once the video has played about 2 s, snapped to the nearest common rate (shown as "~30 fps" until measured). Frame steps can be off by one on variable-frame-rate sources. Dragging an edge saves the whole project draft, as the edit modal already does. Original and Synced Original cues stay read-only.

## 2026-09-27 — Route time limit capped at 300 s for Vercel Hobby

**Decision:** Render, align, and generate set `maxDuration = 300` (was 3600).

**Why:** Vercel Hobby rejects the deploy when any function asks for more than 300 s.

**Consequence:** On Vercel, a render, Auto Sync, or AI translation that runs past 5 minutes is killed; the project can be left `running` until the 2-hour stale check. These routes also have no ffmpeg on Vercel (see `history/movie-recap.md`). Raise the limit again only on a host or plan that allows it. A local-only change to 3600 was committed by accident once; keep 300 in commits.

## 2026-09-27 — Export and import a project as JSON, without the video

**Decision:** The editor's Export button downloads `<name>-<date>.translate.json` (`lib/translate-transfer.ts`) with the name, original SRT, synced cues, translated SRT, timing mode, blur areas, and subtitle placement, built client-side from the loaded project (unsaved edits included). Import is optional on New project: choose the file, then choose the video; the project is created from the video, the bundle is applied through the normal PATCH, then the video uploads. The list page's Import button opens New project.

**Why:** The user re-adds the video themselves, so the file only carries the work done on it. Reusing PATCH keeps one validation path and needs no import route.

**Rejected:** Including the source video or render (hundreds of MB, same reason as `history/story-transfer.md`).

**Consequence:** Import sends two PATCHes, because PATCH resets timing to Original whenever the SRT text changes; cues and timing mode go second. A timing mode whose data is missing falls back to Original. If the chosen video's length differs by more than 1 s from the exported one, import warns but continues; synced timing may then be wrong. No render output is carried over.

## 2026-09-27 — Render a time range

**Decision:** The Render section has Full / Range. Range takes start and end in m:ss.cc (with "Now" buttons that copy the playhead), must be at least 1 s and inside the video, and is sent in the render request body; it is not persisted. The server seeks with `-ss/-to` before the input, keeps only cues overlapping the range, shifts them to start at 0 and clips them to the range end. A range render is stored as `translated-<startMs>-<endMs>.mp4` and becomes the project's rendered output like a full render.

**Why:** Checking a subtitle fix or posting one scene as a reel should not require encoding the whole video.

**Consequence:** Only the latest render (full or range) is shown; there is no list of past range renders as in Movie Recap.

## 2026-09-27 — Translation batches are 200 blocks

**Decision:** `TRANSLATE_PROMPT_BATCH_SIZE` is 200 for both Copy Prompt and Generate with AI (previously 100).

**Why:** User preference: fewer batches to copy and paste. Longer batches raise the chance a reply stops early; the prompt's block-count check and the timing-first merge report any missing blocks.

## 2026-09-27 — Generate the translated SRT with AI

**Decision:** Synced Translated offers Generate with AI (after a confirm dialog). The server sends every synced cue in 100-block batches with the Copy Prompt template to `gpt-5.6-sol` (the model used for the recap retelling, chosen for Burmese dialogue quality), three batches at a time, and merges each reply with the same timing-first paste merge. The result replaces matching blocks in the translated SRT and selects Synced Translated. Requires synced timing and an OpenAI key.

**Why:** Copying each batch to a chat and pasting it back is slow for long videos; the prompt and merge were already proven by the manual flow.

**Supersedes:** "Rejected: an AI translation step" in "Burn a supplied translated SRT locally". The language is fixed to Burmese by the prompt, which removes the language-selection concern recorded there.

**Status (2026-09-27):** The buttons are hidden behind `SHOW_AI_TRANSLATE = false` at the user's request; the route remains.

**Consequence:** One request runs all batches, so the page shows only a spinner, not per-batch progress. Blocks a reply drops stay untranslated (or keep their previous translation); check the count after generating.

## 2026-09-27 — Paste-merge matches synced timing before block numbers

**Decision:** Each pasted block is first matched to the synced cue with the same start and end (to the millisecond) and takes that cue's number; only unmatched blocks use their own SRT number. A number used twice in one paste keeps the first block and skips the rest. The modal reports renumbered and duplicate blocks.

**Why:** A real 101–200 chat reply kept every timestamp but numbered two blocks wrongly (135 twice instead of 135/136, 162 instead of 168). Merging by number alone would have overwritten 135 and 162 and lost 136 and 168.

**Supersedes:** Number-only matching in "Paste translated SRT blocks to add or update by number".

## 2026-09-27 — Parse pasted SRT by lines; never guess block numbers

**Decision:** `parseSrtBlocks` scans lines for timing rows instead of splitting on blank lines, ignores ``` fence lines, and accepts a number wrapped in markdown (`**101**`). A block's text ends at a blank line, the next timing row, or a number line followed by a timing row. Paste-merge skips blocks with no number and reports them; it never assigns a positional number.

**Why:** Chat replies often drop the blank lines between blocks or wrap the SRT in a code fence. The old parser then read a whole batch as one or two blocks and numbered them 1, 2, which would have overwritten the first translated blocks ("2 updated" for a 101–200 batch).

## 2026-09-27 — Cue edits trim overlapped neighbours

**Decision:** Editing a translated cue's start before the previous cue's end moves that cue's end to the new start; editing the end past the next cue's start moves that cue's start to the new end. Only overlapped neighbours change. An edit that would leave a neighbour under 0.3 s is refused with the allowed limit; neighbours are never deleted or merged. The modal states the neighbour change before Save, and edited cues keep their order (no re-sort).

**Why:** Overlapping cues display two subtitles at once; silently removing or merging a neighbour could drop translated text.

## 2026-09-27 — Settings become a bottom sheet on mobile (bottom bar superseded by "Settings move into a popover")

**Decision:** Below the `md` breakpoint the editor is one column; the settings panel is hidden and opened as a GeckoUI bottom `Drawer` from a sticky bottom bar (Settings, Render). The same panel JSX renders in the desktop aside and the sheet. Blur deselection checks `[data-blur-panel]` instead of a ref, because the panel can exist in either place.

**Why:** The 720px minimum width made phones scroll sideways to reach settings.

**Supersedes:** The narrow-screen horizontal scroll in "Keep Customize and settings side by side".

## 2026-09-27 — Fixed preview height; settings panel follows the left column (superseded)

**Decision:** The preview container has a fixed height (`min(60vh, 560px)`); the video fits inside it by aspect ratio. The settings panel stretches to the Customize column's height and scrolls internally, so it no longer sets the row height.

**Why:** Tying the video to the settings panel's height made the preview resize whenever panel content changed (selecting a blur area, adding one).

**Supersedes:** The video-height-follows-settings-panel part of "Customize and settings share one row".

## 2026-09-27 — Timing actions sit under the cue list

**Decision:** The View, Download, Replace, Prompt, Delete, and Paste actions for the active timing are small icon buttons (`MiniButton`) with short labels under the preview's cue list, followed by the file and cue count. The SRT section keeps the pill switch and only the empty states (Run Auto Sync hint, translated SRT drop area).

**Why:** The list and its actions belong together beside the preview; full-size buttons in the SRT section were far from the cues they act on.

**Supersedes:** The per-tab action rows in "Three timing tabs with a translated SRT import".

## 2026-09-27 — One cue list under the preview, following playback

**Decision:** The timed cue lists move out of the Synced Original and Synced Translated tabs into one list under the Customize video. It shows the cues of the active timing, about four rows tall (three until 2026-09-27), highlights the cue under the playhead with the ghost-button hover background, and scrolls it into view as the video plays. Clicking a row seeks; the edit icon appears on hover only while Synced Translated is active.

**Why:** Reviewing timing means watching the video and the text together; lists inside the SRT tabs were far from the preview and did not follow playback.

## 2026-09-27 — Paste translated SRT blocks to add or update by number

**Decision:** Synced Translated has a Paste SRT modal beside Import/Replace. Pasted blocks are merged into the stored translated SRT by their SRT number: an existing number is replaced, a new number is added. The modal shows the new/updated counts before Apply. The stored text keeps block numbers (it is no longer renumbered), so a later batch or correction still finds its block; inline cue edits keep the edited block's number too.

**Why:** Copy Prompt produces 100-block batches; the translations come back one chat reply at a time and need to accumulate without joining files by hand.

**Consequence:** Numbers can have gaps until every batch is pasted. Matching is by number only, so a pasted block with a wrong number overwrites that number's block.

## 2026-09-27 — Copy the translation prompt in 100-cue batches

**Decision:** Copy Prompt in the Synced Original tab is a dropdown with one item per 100 synced cues. Each batch keeps its global SRT numbers (101, 102, …) so translated batches can be concatenated in order.

**Why:** A whole film's synced SRT is too long for one chat reply; the model truncates or merges blocks.

**Consequence:** File import still replaces the whole translated SRT; use Paste SRT to add batches one at a time.

## 2026-09-27 — Stop sending the SRT as the Whisper prompt

**Decision:** Remove the Whisper `prompt` built from the SRT text and version the cached word file (`<hash>.v2.words.json`), so every project transcribes once more without a prompt.

**Why:** After the prompt was added, a new project for the same video left every cue with its original timing, while the earlier project, which reused a transcript cached before the prompt existed, split the same text correctly. The SRT separates every Chinese character with a space, and Whisper follows a prompt's style closely, so the prompt is the likely cause. This was not confirmed against the stored transcript.

**Supersedes:** The prompt sentence in "Time short subtitle chunks from character-aligned speech".

**Consequence:** The next Auto Sync on each project makes one new paid transcription.

## 2026-09-27 — Use Movie Recap's yellow subtitle preset

**Decision:** Translate subtitles use Movie Recap's `yellow` preset (`MOVIE_RECAP_SUBTITLE_PRESETS[0]`): lime yellow `#D9E824`, bold Noto Sans Myanmar via `subtitleFace`, black outline at 0.14 of the font size, 6% horizontal margins. The render imports `subtitleFace`, `toAssColor`, and `ASS_FONT_SIZE_RATIO` from `lib/movie-recap-render.ts`; the preview mirrors Movie Recap's overlay (text stroke painted behind the fill). The user-chosen height and size remain Translate settings.

**Why:** The user wants both products to burn the same caption look. Sharing the preset keeps them from drifting apart.

**Supersedes:** The white regular face and 8% outline in the preview-matching entry below; its font-metric reasoning still applies.

## 2026-09-27 — Preview subtitles use the render's face and metrics

**Decision:** The Customize preview draws subtitles in Noto Sans Myanmar 400 (next/font, the face libass burns with), line height 2.184em, full frame width, and a black outline equal to the render's 8% ASS outline (CSS stroke at twice the width, painted behind the fill). The drop shadow and semibold weight are removed.

**Why:** The preview used the system Burmese font at semibold, wrapped at 90% width, and had no outline, while the render used Noto Sans Myanmar regular with ASS sizing (font size × 2.184, see `ASS_FONT_SIZE_RATIO` in `lib/movie-recap-render.ts`). The preview therefore looked much larger and wrapped into two lines where the export showed one.

**Consequence:** Wrapping can still differ slightly because libass balances wrapped lines and CSS fills greedily. The match assumes the server has the `MOVIE_RECAP_SUBTITLE_FONT` face installed; otherwise libass falls back to another font.

## 2026-09-27 — Show real render progress

**Decision:** ffmpeg runs with `-progress pipe:1`; its `out_time_us` divided by the source duration is written to `translate_projects.render_progress` (0–1), mapped to 2–95%, at most every 1.5 s and 1% change, without touching `updated_at`. 95% means uploading to R2. The editor polls the project every 2 s through the Spoosh read's `trigger({ force: true })` while `render_status` is `running` and less than two hours old, merging only render fields into the local draft. Polling stops when the status leaves `running`, the run is stale, or the page unmounts. The bar sits under the Render button.

**Why:** The render request stays open for the whole encode, so the client had no signal beyond "in progress". This mirrors Movie Recap's row-polling progress pattern.

## 2026-09-27 — Edit imported translated cues only

**Decision:** The Synced Translated tab lists its cues (click to seek) with an edit icon per row. The modal edits start, end, and text; saving re-serializes the list to SRT, sorts by start, and stores it as `translated_srt_text`. Original and Synced Original stay read-only.

**Why:** Hand translation can drift from the synced timing; fixing individual lines in place is faster than re-importing a file. The original SRT and synced timing are the sources the translation was made from, so they are not edited here.

**Consequence:** Editing rewrites the stored translated SRT in normalized form (renumbered, markup stripped) rather than preserving the imported file byte for byte.

## 2026-09-27 — Customize and settings share one row (superseded)

**Decision:** Video and SRT sections span the full width. Customize and the settings panel sit together in one row below them, stretched to the same height. The preview frame fits inside the Customize area (container query sizing), so the video's height is capped by the settings panel. The settings panel is no longer sticky. The rendered video stays full width below.

**Why:** A tall reel preview made the page long and left the settings beside the Video and SRT sections instead of beside the preview they control.

**Supersedes:** The sticky settings panel from "Keep Customize and settings side by side".

## 2026-09-27 — Three timing tabs with a translated SRT import

**Decision:** The SRT section shows one pill switch with Original, Synced Original, and Synced Translated. Choosing a tab that has content also makes it the timing used for preview and render; a tab without content opens only to show its next step. Each tab carries its own View action, replacing the header's View SRT and View synced timing buttons. The more-actions menu is removed: Download and Replace for the original SRT live under the Original tab, and the header keeps only Auto Sync (or Choose SRT before one exists). Synced Translated holds an imported translated SRT (`translated_srt_text`, `translated_srt_file_name`) that the user makes from the synced timing outside the app; it is rendered with its own timing and is not validated against the original text. Importing selects it. Replacing the original SRT resets the active timing to Original but keeps the imported translation.

**Why:** Users translate the speech-synced subtitles externally and need to burn that translation, while still switching back to the original or synced original without re-running Auto Sync.

## 2026-09-26 — Time short subtitle chunks from character-aligned speech

**Decision:** Auto Sync splits every cue into reel-sized chunks (whitespace, punctuation, sentence ends; at most about 16 CJK characters or 32 narrow characters, long unbroken CJK text split evenly) and aligns the cue's normalized characters to the Whisper word characters within 4 seconds of the cue, using semi-global character alignment. Each chunk is shown from its first to its last matched spoken character, with small padding and a 0.7-second minimum, clipped at the next chunk. Chunks without enough matched characters take an even share of a real gap between their neighbours or merge into the previous chunk. A cue with under 40% matched characters keeps its original timing. Cues consume speech words in order so one spoken span is not reused by a later cue. The SRT text is passed as the Whisper prompt so new transcriptions use the same script.

**Why:** The punctuation-only split with the six-part cap left long SRT cues whole, so a cue covering several spoken lines showed all of them together until its SRT end. Whole-phrase fuzzy matching also rejected a phrase when Whisper's spelling differed or the phrase spanned more than 32 words.

**Supersedes:** The six-display-part cap and the audible-pause fallback above. The duration-proportional paging rejection still applies: time comes from matched speech, except the even split of a gap for an unmatched chunk between matched ones.

**Consequence:** Already cached word timestamps were made without the prompt and are reused. Chunks are shorter than a cue, so reading speed follows the speech.

## 2026-09-26 — Fall back to audible phrase boundaries

**Decision:** If direct original-language text matching fails for any phrase in a cue, Auto Sync may align that cue's ordered SRT phrases to punctuation and pauses in the timed speech words inside its original cue window. Require a distinct speech span of at least 0.3 seconds for every phrase; otherwise retain the original cue. This is a local fallback using the same transcription response, with no additional API call. Allow a wider word candidate set so dense Chinese speech is not skipped before matching. Cache the timed words in project-scoped R2 under a key tied to the source video's object key, so later Auto Sync retries or SRT replacements can reuse the paid transcription; a replaced video uses a new key.

**Why:** Even same-language SRT can differ from Whisper's transcription in spelling or Chinese character form. Previously one unmatched phrase rejected its entire cue, making a paid Auto Sync return no result despite timed speech being present. The small start/end display padding also made contiguous matched words look overlapping and rejected otherwise valid multi-phrase cues; clip that padding at the next phrase instead. Speech boundaries provide an estimate without dividing time in proportion to subtitle length.

**Consequence:** A pause can mark a different phrase boundary from the SRT, so the saved synced timing still needs visual review. Cue text and original timing remain available.

## 2026-09-26 — Accept original-language SRT for direct speech matching

**Decision:** The SRT supplied to Translate now contains the video's spoken-language text and is also the text burned into the output. Auto Sync still uses `whisper-1` word timestamps, but matches normalized SRT phrases to consecutive transcript word spans locally. It no longer calls GPT for cross-language semantic mapping. Sentence and clause boundaries are retained, including Chinese `，` and `、`; only reliably matched spans replace source cue timing. Existing saved synced timing stays intact until the SRT is replaced or Auto Sync is run again. The editor reports how many source cues retained their original timing instead of presenting a partly unchanged result as fully aligned.

**Why:** Matching translated Burmese phrases to source-language audio left most cues unchanged, including the example shown after a paid retry. The user will supply the original-language SRT, which allows text-to-text matching and removes the uncertain semantic pass. This also reduces future Auto Sync usage to the transcription call.

**Supersedes:** The translated-SRT input and GPT semantic alignment decisions below. This flow does not translate subtitles. The original SRT timing and saved synced timing remain separately selectable. Manual timing editing was considered for the failed result but deferred in favor of this original-language input.

## 2026-09-26 — Time translated sentences from their matched speech

**Refinement:** Treat Myanmar `၊` and spaced commas as possible clause boundaries as well as sentence punctuation. Keep at most six display parts per cue; when commas create more than six, use sentence boundaries instead. The speech match must still validate every part before replacing that cue's original timing.

**Decision:** Auto Sync splits each translated SRT cue at sentence punctuation and line breaks before matching it to the original-language word transcript. The semantic pass maps each complete translated sentence to its own source-word span, searching eight seconds on either side of the coarse SRT cue. Its spoken-word timestamps determine both display boundaries, including for a single-sentence cue; the original SRT endpoints no longer pin the result. Reject uncertain or out-of-order matches and retain the original cue in those cases. Keep the uploaded SRT and saved synced timing separately.

**Why:** A cue can contain several dialogue turns from separate clips, while its supplied timing may start after speech. Keeping the whole cue or pinning its first/last sentence to those endpoints displayed multiple turns together and made subtitles late. Deterministic sentence boundaries preserve every translated character without asking the model to rewrite text.

**Supersedes:** The earlier Auto Sync rule that confines phrase mapping and final timing to each SRT cue. Speech-based splitting remains limited by punctuation and reliable semantic matches; ambiguous cues remain whole for review. The duration-proportional paging rejection still applies.

## 2026-09-26 — Keep equal spacing in the SRT action group

**Decision:** Let the action buttons take only the width they need and use the same `gap-2` spacing between each action, including the more-actions button.

**Why:** A growing button group left an oversized gap before the menu trigger.

## 2026-09-26 — Put SRT actions beside the heading

**Decision:** Keep the SRT heading and filename on the left of the section header and place viewing, Auto Sync, and the more-actions menu in a right-side area on that same row. Shorten the primary button label to “Auto Sync”; its action is the same whether it runs for the first time or replaces saved synced timing.

**Why:** The section header should use one row while leaving file actions close to their context. The action area scrolls horizontally when space is tight.

**Supersedes:** The previous placement of the SRT action row beneath the heading.

## 2026-09-26 — Emphasize Auto sync and group file actions

**Decision:** Style Auto sync as the primary action. Keep viewing and syncing in the SRT action row, and move Download SRT and Replace SRT into a more-actions menu at its right edge.

**Why:** Speech alignment is the main next step after adding an SRT; file management should remain accessible without crowding the row.

## 2026-09-26 — Keep SRT actions together and accept original cue bounds

**Decision:** Place all SRT actions in one horizontally scrollable row beneath the SRT heading. Show an indeterminate progress bar while Auto sync is running, since the single alignment request does not report a reliable percentage. Validate aligned timing against the later of video duration and the supplied SRT's last cue end, while continuing to require ordered, finite cues and exact preservation of the translated text.

**Why:** The actions should stay together at narrow widths, and audio transcription can take long enough that users need visible activity. An SRT cue extending slightly past the video's end is already accepted on upload, so it must not invalidate the whole Auto sync result.

## 2026-09-26 — Keep video state and replacement action in one header

**Decision:** Show the video upload state as a badge beside the Video heading and place the replacement or resume action on the right side of the same header row.

**Why:** The file metadata remains directly beneath the heading while the action stays easy to find without adding another row.

## 2026-09-26 — Inspect synced timing and replace only the video

**Decision:** The editor offers a separate full cue list for saved speech-aligned timing. Replacing the video uploads to a new temporary R2 object and switches the project to it only after multipart completion. The supplied SRT, synced cues, active timing choice, blur settings, subtitle placement, and previous rendered output remain saved. The prior source object is not deleted during replacement, and an interrupted upload leaves the current source active. A successful replacement marks the render stale without clearing its saved output. Saved cues may extend past a shorter replacement video; they remain available for review or another Auto sync.

**Why:** Users need to inspect the generated timing independently and try a different source video without losing subtitle work or the currently usable video when an upload fails.

## 2026-09-26 — Keep both subtitle timings selectable

**Decision:** Keep the supplied SRT and saved speech-aligned cues separately. Persist which timing drives preview and render, and let users switch between Original SRT and Synced timing without removing either. Auto sync replaces only the saved synced cues and selects them. Delete synced timing is a separate confirmed action; replacing the supplied SRT clears synced cues because they correspond to the previous text. Existing projects with synced cues retain synced timing as their active mode during migration.

**Why:** Returning to the original timing is a viewing/rendering choice, not an instruction to discard the processed timing and incur another audio alignment call.

**Supersedes:** The earlier alignment entry's behavior of deleting synced cues when users restore original timing. The original SRT remains unchanged.

## 2026-09-26 — Read the complete uploaded SRT

**Decision:** Open a scrollable dialog from the Translate editor that lists every cue in the saved original SRT with its order, time range, and full text. Keep the generated speech-aligned timing separate from this source view.

**Why:** Users need to inspect all uploaded subtitle content without downloading the file or relying on the video playback position.

## 2026-09-26 — Download the supplied SRT

**Decision:** Let users download the saved, originally uploaded SRT from the Translate editor. Show Download SRT and Auto sync to speech only while a saved SRT exists.

**Why:** Users need a copy of their supplied subtitle file after upload. Auto sync requires that subtitle text and must not appear before an SRT is present. Downloading the original preserves it independently of generated speech-aligned timing.

## 2026-09-26 — Use GPT-6 Luna for semantic alignment

**Decision:** Use `gpt-6-luna` for the translated phrase to source speech mapping. Keep `whisper-1` for word timestamps because GPT-6 Luna does not process audio in this flow.

**Why:** GPT-6 Luna supports the structured text output used by alignment and has lower published input and output token prices than the previous `gpt-5.6-luna` choice. Alignment quality still needs review on real translated SRTs.

## 2026-09-26 — Align translated subtitle parts to source speech

**Decision:** Keep the uploaded translated SRT unchanged. An explicit Auto sync action transcribes the uploaded video's original-language audio with word timestamps, then maps exact translated phrases within each SRT cue to consecutive source speech spans by meaning. Store the resulting timed parts separately in `translate_projects.subtitle_cues`; preview and render use them until the SRT is replaced or the user restores original timing. A cue without a reliable match remains whole.

**Why:** The translated SRT gives coarse timing but not a time for every readable phrase, and its words cannot be matched directly to audio in another language. The earlier duration-proportional two-line paging made reading worse because it ignored speech. Preserve the full translated text and use speech timing only when the semantic mapping validates.

**Consequence:** Auto sync requires a video audio track, ffmpeg, and a configured OpenAI API key. Transcription and semantic alignment incur processing time and API usage. The result is an estimate, so the editor exposes each timed part for review; original SRT timing remains available.

## 2026-09-26 — Restore complete SRT cues

**Decision:** Show each SRT cue as one continuous subtitle for its original timing in preview and render, with normal line wrapping. Remove automatic two-line paging.

**Why:** The timed pages proved harder to read than the complete cue. This supersedes the paging decision below; keep the original SRT timing and text together.

## 2026-09-26 — Page long cues for reel frames (superseded)

**Decision:** Split a long SRT cue into successive displays of at most two estimated frame-width lines. Allocate the original cue duration among those displays in proportion to their text length. Preview and ffmpeg/libass use the same paging function; all text remains within its original cue time.

**Why:** A tall reel frame cannot show a long cue as one readable block. Splitting it keeps the text visible without shrinking the chosen font size or discarding words. Very dense cues can still advance quickly because their SRT timing is preserved.

## 2026-09-26 — Keep Customize and settings side by side

**Decision:** The editor keeps the video/Customize column beside the settings panel in one row. The settings panel sticks near the top of the editor scroll area; narrow screens can scroll horizontally to preserve a usable preview width.

**Why:** Blur and subtitle adjustments need the preview visible alongside their controls while scrolling through a project.

## 2026-09-26 — Center subtitles and adjust height with a slider

**Decision:** Subtitles stay horizontally centered in the preview and rendered MP4. The Customize panel offers a vertical position slider and a separate text size control. Horizontal positioning and direct subtitle dragging are removed. The existing `subtitle_x` database column remains for compatibility but is ignored.

**Why:** Users only need to choose the subtitle's height while keeping alignment consistent across cues. This supersedes the independent horizontal placement in the project customization decision below.

## 2026-09-26 — Always show subtitle placement in Customize

**Decision (updated 2026-09-27):** Show “ဒီနေရာမှာ စာသားပေါ်ပါမယ်” at the chosen subtitle position only until an SRT is saved. Once an SRT exists, the preview shows only the active cue and nothing between cues, matching the render. Previously the sample also filled gaps between cues; that was dropped because it looked like a real subtitle during silent moments. An active cue replaces the sample in the preview. The sample is preview-only and is never burned into the rendered MP4.

**Why:** Position and size controls need visible feedback throughout editing, including before SRT upload and between cues.

## 2026-09-26 — Give Translate its own access flag

**Decision:** `profiles.can_use_translate` is a separate permission, defaulting
to false. Admin can grant it independently. The Translate page and table RLS
check `has_feature('translate')`; account deletion removes Translate R2 objects
before deleting the auth user.

**Why:** Translate is a top-level menu and project type, so Movie Recap access
does not imply Translate access. This follows the per-user feature boundary
recorded in `history/admin-users.md`.

**Supersedes:** the initial use of the Movie Recap feature gate below.

## 2026-09-26 — Persist projects and make Customize editable (supersedes)

**Decision:** Translate is a saved project per user. The original video is
uploaded to R2 with resumable parts, the translated SRT and customization live
in `translate_projects`, and the final MP4 is rendered with ffmpeg/libass and
stored under the same project prefix. Access was initially tied to Movie Recap;
the separate Translate access decision above replaces that gate.

**Why:** the first local-only version lost all work on navigation or reload,
and its single blur rectangle could only move. Users need to revisit projects
and fully control the cover and translated text before rendering.

**Customize:** up to eight blur rectangles can be added, removed, moved,
resized, and set numerically. Subtitle text has independent horizontal and
vertical placement plus a size measured as a percentage of video height. All
geometry uses the uploaded video's dimensions, so preview and output follow
the same frame. Settings are saved before render.

**Supersedes:** the browser-only WebM render, one fixed-size blur area, and
session-local files from the first entry. The already-translated SRT input
decision remains; no automatic language translation is performed.

**Consequence:** renders now require the configured R2 and ffmpeg/libass
environment and take server time. Deleting a project removes its R2 prefix.

## 2026-09-26 — Burn a supplied translated SRT locally

**Decision:** Translate takes a video followed by an already translated SRT.
The browser uses the video's own dimensions for the preview, offers one
draggable blur region for covering source subtitles, and renders the SRT and
blur into a WebM with canvas and MediaRecorder.

**Why:** this first version needs the requested upload, blur customization,
and final render without introducing another persistent project model or
duplicating Movie Recap's server render pipeline.

**Rejected:** an AI translation step. The requested SRT upload is treated as
the translated subtitle input; translating source text would need a language
selection and a separate translation workflow.

**Consequence:** files are held only in the browser session; rendering runs at
playback speed and needs the tab to remain open. The export is WebM and depends
on browser MediaRecorder support. No project history or cloud copy is kept.
