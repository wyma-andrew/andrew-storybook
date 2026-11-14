# Recap V2

Covers: `app/(app)/(recap-v2)/**`, `app/api/(recap-v2)/**`,
`components/recap-v2/**`, `lib/recap-v2*.ts`,
`lib/prompts/recap-v2-translation.ts`, `lib/video-framing.ts`, and the
`recap_v2_projects` migrations (`20261114120000_recap_v2_restore.sql`).

## 2026-11-14 — Translation runs on free Gemini keys, not OpenAI

**Decision, by the user:** OpenAI cost about $0.30 per 10 minutes of source
(gpt-6-sol translate + audit). The tool pays nothing because it uses free-tier
Gemini keys, so Recap V2 does the same: `lib/gemini.ts` reads
`GEMINI_API_KEYS` (comma-separated; also `GEMINI_API_KEY` and
`GEMINI_API_KEY_<n>`), and walks the tool's model chain
(3.5-flash → 3.5-flash-lite → 3.6-flash → 3.7-flash → 3.1-flash-lite).
A 401/403/429 or quota error moves to the next key on the same model; when
every key is rejected, the next model starts at key 1; a 5xx, overload or
timeout skips to the next model. Called through REST, no SDK.

**Differences from the tool:** when every model is busy it waits 10s then 20s
(the tool waits up to 5 minutes, more than a 300s request allows) and then
fails; a rejected key/model pair is skipped for an hour by later requests in the
same server process. When everything is used up the step fails with a message
to add a key or try later — there is no checkpoint to resume from, so Translate
starts over.

**Consequences:** free-tier prompts may be used by Google for training. A key
from the same Google project as another adds no quota.

## 2026-11-14 — Recap V2 is back, following recap-en-to-mm's current flow

**Decision, by the user:** add the "Recap V2" menu again and take the whole
flow of the tool (now at its 2026-10-24 version), using this app's own
services where the tool's differ. Asked first because it reverses the
2026-11-10 removal; the user chose to restore the old code and update it.
The table is recreated by `20261114120000_recap_v2_restore.sql` (the old rows
and R2 files are gone for good).

**Services:** speech is FunASR for Chinese and whisper-mm (large-v3, now with
`?words=true`) for every other language; "Auto-detect" asks Whisper and, if it
hears Chinese, listens again with FunASR. Story memory, translation and audit
run on Gemini free-tier keys (see the next entry). The voice is the shared TTS
catalog (VoicePicker, Azure and VoxCPM). The tool's Edge and Gemini TTS are not
used.

**What changed from the 2026-10-09 port, to match the tool:**

- **Lines are whole sentences** (tool profile `v33_sentence_locked_6p5_10_24`,
  2026-10-12): a line ends at a sentence mark or a ≥1.5s pause, at a clause
  mark only after 6.5s, at a 0.35s breath or (non-English) an ASR segment end
  only after 10s, and never runs past 24s. With few marks, a segment end over
  2s is a sentence end. *Supersedes* the 4.2s/5.6s units below: the tool
  measured that short lines cut 20–35% of sentences in two, and the second half
  was then told twice or every next line slid one early.
- **Any source language** (`source_language`, `detected_language`). Burmese
  stops with a message; a transcript where a quarter of the lines repeat one of
  the five before it stops before translation (the tool's
  `_check_heard_speech`).
- **Translation checks** (`lib/recap-v2-checks.ts`): placeholders, letters of
  another script, English words, translator notes, a line repeating the end of
  the one before, two nearby lines saying the same thing, and runs of lines slid
  one early each re-ask the batch with the problem named. The last ID-complete
  answer is kept, with stray letters dropped. Prompt rules 11–12 and the story
  memory's `nameConsistency`/`unresolved` are the tool's. One unreadable story
  memory chunk is left out instead of failing the step.
- **Output**: Ratio adds Original; Fill is Blur background / Black bars / Crop to
  fill; Quality 1080/720/480 sets the short side; Flip works on every ratio.
- **Production tools**: Title, Extra text and a Logo, placed by dragging on the
  preview; Voice volume 50–300%; an SRT is written with every render
  (download from the editor; English glosses in ( ) are left off captions).
- **Edit Text**: lines with English or another script are outlined, and "Next
  problem" jumps to them. A re-render re-voices only changed lines (the clip
  cache is content-addressed).

**Rejected / not ported:**

- The house colour grade (`MOVIE_RECAP_LOOK`) is no longer applied: the tool
  has none, and the user asked for its flow.
- Gemini TTS and Edge TTS: this app's TTS catalog is used instead.
- The tool's subtitle styling panel (font, colours, box): captions keep this
  app's yellow preset with size and position.
- Batch folder processing and "Save final to": a web project is one video.
- Translation batches still run three at a time with source-only context,
  unlike the tool's sequential batches, so a long video fits the route's
  300s limit; the repeat and near-duplicate checks therefore do not look
  across a batch boundary.
- Hindi/Urdu: an auto-detected Urdu is not rewritten as Hindi.

**Consequences:**

- whisper-mm must be redeployed (`modal deploy workers/whisper-mm/modal_app.py`)
  before non-Chinese sources work; an old deployment returns no word stamps,
  so every segment is spread evenly.
- Projects re-split from a saved FunASR transcript get the sentence rules too.

## 2026-11-10 — Recap V2 removed entirely *(superseded 2026-11-14 — restored)*

**Decision, requested by the user:** Recap V2 is gone — page, nav item, API,
`components/recap-v2/`, `lib/recap-v2*.ts`, its prompt, the Spoosh schema and
the R2 key helpers. Migration `20261110140000_drop_recap_v2_projects.sql`
dropped `recap_v2_projects` (2 projects) and every object under `recap-v2/`
in R2 (95 files, 0.71 GB) was deleted. Both were confirmed by the user as
permanent.

**Why:** the user no longer uses it; Movie Recap is the recap flow.

**Consequence:** the entries below describe code that no longer exists. They
stay as the record of what was tried, should a Chinese-to-Burmese re-narration
flow come back. The two `recap_v2` create migrations remain in
`supabase/migrations/` because migration history is append-only.

## 2026-11-05 — The poller reads progress columns, not the whole row

**Decision, approved by the user:** the editor's tick reads
`GET recap-v2-projects/:id/progress` every 10 seconds, down from the full row
every 2. When the job leaves `running` it fetches the full row once and adopts it.
A tick that finds the row orphaned by `RECAP_V2_STALE_JOB_MS` stops the timer.

**Why:** the Vercel account was paused at 10.28 GB of Fast Origin Transfer against
Hobby's 10 GB, 95.6% of it outgoing and 99.1% from this app. Every tick sent all
of `units`, and a stuck row kept sending them while the tab stayed open. The
Usage page did not break this down by route, so polling is the likely cause
rather than a measured one. Same reasoning as `history/movie-recap.md` 2026-11-05.

**Rejected:** merging only `job_stage` and `job_progress` while dropping the
settled row. Transcribe, Translate, and Render all replace `units` or the output,
and a reloaded tab has no POST response to learn that from.

**Consequences:** progress on screen can lag the row by up to 10 seconds. The bar
stays "running" after the timer stops on an orphaned row, until a reload or a new
job, because this entry changes the poller and not how `running` is displayed. A
column the UI needs during a job must be added to `RECAP_V2_PROGRESS_COLUMNS`.

## 2026-10-09 — Lines can be muted, keeping their picture

**Decision, by the user:** some ASR lines say nothing worth narrating. A line
can be muted (and restored) from the Lines list. Chosen over two rejected
options: handing its picture to the neighbouring lines (their narration would
not change, so their picture would slow down), and cutting its picture out
(a jump cut, and a shorter video).

- A muted line's picture plays at 1.0x over silence of the same length, with
  no caption, so cuts and every other line's sync are unchanged.
- Translate skips muted lines (story memory included) and leaves their old
  text in place, so restoring a line brings its Burmese back. Render needs
  text only for unmuted lines.
- Mutes are saved per unit (`muted` on the units JSON) with the line edits;
  Transcribe and Re-split rebuild units and clear them.

## 2026-10-09 — Captions are timed from the measured voice

**Bug (reported by the user — captions a little early):** each line's first
caption started at the clip's start, ahead of the voice's own lead silence,
and later pieces switched at a length-proportional estimate, which ran ahead
of the speech. Now the first piece waits for the voice onset (−50dB, 10ms
blocks) and each later piece switches where the voice resumes after the pause
(≥0.12s) nearest its estimate; TTS pauses at "။"/"၊", which is where pieces
are cut. With no pause within max(1s, 25% of the speech) the estimate stands.
The preview (source timing, not rendered) was early for the same kind of
reason: it showed a line from its picture window's start — the middle of the
silence before the speech. It now shows a line from its Chinese speech start,
splits it by length across that speech, and shows a faint sample when
nothing is being said (so it can be dragged).

**Captions clear when the voice stops (by the user — text stayed on after the
line was said):** render and preview both clear a line's caption 0.3s after
its speech ends instead of holding it through the following silence.

## 2026-10-09 — Raw speech transcript is kept; lines can be re-split

**Decision, by the user:** the comma bug showed that units alone cannot be
re-split — they keep text and unit bounds but not the per-character stamps,
and spreading characters evenly would put cuts where nobody is speaking.
Transcribe now saves FunASR's raw segments and stamps to
`recap-v2/<id>/asr/transcript.json` (tagged with the source object key), and
"Re-split lines from saved transcript" (`POST …/resplit`) rebuilds units from
it with the current rules, without calling the worker. It shares the
transcribe job slot and, like Transcribe, clears translations and the render
(IDs change). Projects transcribed before this have no saved transcript and
must be transcribed once more.

## 2026-10-09 — Step progress: coalesced writes, indeterminate stages

**Bug (reported by the user):** progress bars stalled and skipped stages. The
job dropped every progress write within 1.5s of the last one, with no trailing
write, so a new stage could be lost and the bar sat on an old value. Now a new
stage is written at once and repeats are coalesced into one trailing write;
pending writes are flushed before the job's final save.

Stages that cannot be measured — FunASR, a single ffmpeg pass, the upload —
report a null fraction and show an indeterminate bar instead of a frozen one.
Downloads report bytes; Translate reports each batch twice (translated,
audited). Each step shows its own bar under its button, with an elapsed timer
that restarts on reload (it is client-side).

## 2026-10-09 — Bug fixed: commas inside a FunASR segment were dropped; captions split by sentence

**Bug (found on a real render):** FunASR often returns one segment with several
"，" inside (`我饱了，先去学校问妈妈，慢用二十岁了，…`, 5.3s). Only the segment's
closing mark was put back on the stamped characters, so the tool's "close on a
clause mark past 1.68s" rule never saw the inner commas and the unit ran to the
5.6s cap — its Burmese came out as four sentences. Every mark in the segment
text is now put back on the character before it; stamps that do not line up
with the text fall back to the closing mark only. Projects transcribed before
this keep their old units until transcribed again.

**Captions (by the user, from the same render):** a line's whole translation
was one 6-row caption. It is now shown a sentence at a time (split after "။";
a piece over 40 characters splits after "၊" or at spaces), each for its share
of the line's audio by length. The preview splits across the line's picture
window the same way. The tool itself burns no captions, so this is not a port.

## 2026-10-09 — Translation audit added; models are GPT-6

**Decision, by the user:** the tool's `audit_and_repair_batch` runs after
every translation batch, on `gpt-6-sol` (the translation model — repaired
lines are heard, so they need the same prose quality). Each ID is checked for
omissions, events borrowed from neighbours, shifted chains and adjacent
duplicates; a failing ID is rewritten, a passing one kept byte-for-byte. Two
attempts, then the same rows are re-audited in halves; an unvalidated window
fails the step, as the tool does. Roughly doubles the Translate step's cost.
The story-memory pass is `gpt-6-luna`.

## 2026-10-09 — Smart Sync timing is recap-en-to-mm's, rule for rule (supersedes parts of the entry below)

**Decision, by the user ("exactly like the original tool"):** three
deviations from the tool in the first build were reverted.

- **Segmentation** is the tool's `atomicize_timestamp_segments` on FunASR's
  character stamps: close on a ≥1s pause, on a sentence mark, on a clause mark
  once past 1.68s, past 1.68s with a ≥0.5s gap, past 4.2s with a ≥0.16s gap,
  or at 5.6s; then fold ≤0.5s, ≤2-token units into the next one (dropping a
  repeated name). FunASR's stamps carry no punctuation, so each segment's
  closing mark is put back on its last stamped character. *Superseded:* the
  first build's segment merging with an equal-share split of long segments.
- **Picture past 1.25× is cut**, as the tool's `_sync_filter` does: play at
  1.25× and trim the window to the line. *Superseded:* padding every short
  line with unlimited silence so no picture was ever cut, plus a fixed 0.25s
  gap after every line.
- **Short pauses** is the tool's `trim_edge_silence`: RMS over 10ms at −50dB,
  keep 0.05s before and 0.20s after the speech, but not below window/1.25 —
  only as far as the raw clip reaches, so a cut can still happen. It is a
  per-project switch, on by default (the tool's UI default). The R2 cache now
  holds the voice's **raw** clip (24kHz mono) so the switch needs no new TTS.
- Part filter order, `tpad` 0.5s and `-shortest` at the mux match the tool.

- **ASR loop filter** (2026-10-09, by the user — FunASR produces the same
  "我我我…" loops as Whisper): the tool's `_filter_local_whisper_artifact_units`
  with its thresholds (segment ≥4s, ≥24 letters, top letter ≥72%, unique
  ≤18%; unit dropped only if all its segments are such loops and it is
  low-information), but without the tool's Whisper-only gate. Dropped units'
  picture goes to their neighbours via full coverage. It is deliberately
  conservative: shorter or phrase-level loops pass through.
- **Voice rate is +0%** (2026-10-09, by the user): the tool speaks at Edge
  TTS's default +0%, and Edge's Thiha/Nilar are the same Microsoft neural
  voices Azure serves. The catalog's +20% (Movie Recap's measured pace) is
  overridden for Recap V2 only.

**Still different from the tool (not timing):** Azure instead of Edge TTS as
the service, blur boxes on the source frame rather
than the output frame, concurrent translation batches (source-only context),
 no voice volume, no title/logo/extra text.

## 2026-10-08 — Recap V2 is a separate menu built on recap-en-to-mm's Smart Sync

**Decision, by the user:** port the timing approach of the user's Windows tool
`recap-en-to-mm` as its own menu ("Recap V2") instead of changing Movie Recap.
Source is a **Chinese**-narrated recap video; translation is in-app AI; voices
are the existing Azure catalog.

**Why a separate feature:** Movie Recap's planner was built for raw movies —
shot borrowing, motion scoring, a 3s-kept/1s-skipped cadence — and its Recap
Video mode inherits all of it, which is where picture and narration drifted
apart. Smart Sync is much simpler and owns no shared code paths, so a new
feature avoids re-arguing ~7000 lines of `history/movie-recap.md`.

**The pipeline (three requests, one shared job slot on the row):**

1. **Transcribe** — FunASR worker with `words=true`. Sentence/clause segments
   are merged into units of ~4.2s (cap 5.6s); a segment longer than the cap is
   split into equal shares on its character timestamps. Equal shares, not
   greedy 4.2s pieces: greedy left a short tail whose only fix was pushing a
   piece past the cap (caught by the test).
2. **Translate** — a story-memory pass (Chinese name → fixed Burmese name),
   then ID-locked batches of 40 with 6 units of read-only context either side.
   A batch whose IDs come back wrong is retried with a correction, then split
   in half. Batches run three at a time with **source-only** context, unlike
   recap-en-to-mm's sequential batches, so a long source fits the request.
   *(Superseded 2026-10-09 — the audit pass is now ported.)* recap-en-to-mm's separate audit pass was **not** ported (it doubles cost);
   every line is editable instead.
3. **Render (Smart Sync)** — every unit owns a window of source picture; the
   silence between two units is split at its middle, so windows tile the whole
   source. Narration leads: each window's picture is `setpts`-retimed to its
   line. Picture never plays faster than **1.25×**; a line shorter than
   window/1.25 is **padded with silence** instead of cutting picture (the
   tool's "short pauses" rule), and every line gets 0.25s of trailing room.
   Frame counts come from the cumulative narration clock at 30fps, so hundreds
   of units stay within half a frame of the audio.

**Accepted consequences:**

- No slow-down cap: a long Burmese line slows its window as far as needed.
  recap-en-to-mm's freeze fallback was off by default there too.
- Blur areas are drawn and applied on the **source** frame, before framing,
  zoom and mirror, because their job is covering the source's burned-in
  Chinese subtitles.
- Only 16:9 / 9:16 / 1:1 (Movie Recap's output sizes and `buildShotFilter`);
  the tool's "Original" ratio is not offered.
- Gated by the `movie_recap` feature flag, like Video Cutter.
- Jobs run inside their request (`maxDuration` 300 committed) and ignore client
  disconnects, so a reload keeps polling the same job. A row stuck `running`
  for over 2 hours is treated as orphaned.
- Not yet ported: logo, title/extra text, voice volume, per-line re-render.

## 2026-10-09 — Output preview with a draggable subtitle

**Decision, by the user:** the editor shows the output frame before rendering,
and the subtitle height is set by dragging it there (the 80–93% select is
gone). The user's condition: nothing about Smart Sync changes — this is
editor-only.

- `RecapV2OutputPreview` draws the render's order in CSS: blur boxes on the
  source picture, fit into the frame, zoom the fitted picture, mirror, colour
  grade, then the caption on the finished frame. Its caption sizing is the
  same mapping Translate uses for the same ASS style.
- Blur boxes are edited inside the output preview too (2026-10-09, by the
  user — switching to a separate source view with native video controls read
  as the preview resetting). They sit in the mirrored picture box and are
  stored in source coordinates; a drag is flipped when mirrored. With "Crop to
  fill", parts of the source outside the frame cannot be reached.
- **Known gap:** the preview plays at source timing and shows the line under
  the source playhead; only the render retimes picture to narration.
