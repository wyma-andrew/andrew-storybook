# Splitter

Covers: `app/(app)/(splitter)/**`, `app/api/(splitter)/**`,
`components/splitter/**`, `lib/splitter*.ts`, and `splitter_projects` in
`20261114120000_recap_v2_restore.sql`.

## 2026-11-14 — recap-en-to-mm's Splitter tab, as an Other tool

**Decision, by the user:** port the tool's Splitter with Recap V2. It lives
under Other (next to Video Cutter), gated by `movie_recap`.

- Parts of N minutes (0.5–60). **Smart cut** reads the sound at 50ms steps and,
  when time is up mid-speech, waits up to N seconds (default 20) for a pause:
  one already running through the cut, else the earliest of the longest pauses,
  else the quietest moment. Pause = 18dB under the speech level or within 6dB
  of the local floor; one loud 50ms blip does not end a pause. A last piece
  under a quarter part (and 20s) joins the part before. Thresholds are the
  tool's (`splitter.py`).
- Ratio Original / 16:9 / 9:16 / 1:1 with Fill and Quality from
  `lib/video-framing.ts` (shared with Recap V2).
- Text box and part number (`{n}`, `{mm}` Myanmar digits, `{total}` — also in
  Myanmar digits when `{mm}` is used), placed by dragging on the preview. They
  are drawn with libass (it shapes Burmese) instead of the tool's Chromium PNGs;
  the dark box is BorderStyle 3.
- Every part is re-encoded so cuts are exact. **Check cuts** plans without
  rendering. Each split replaces all earlier parts.

**Not ported:** several videos per run, a save folder, NVENC, and resuming a
stopped split part by part (a split runs inside its request, `maxDuration` 300;
a long source needs the local override).
