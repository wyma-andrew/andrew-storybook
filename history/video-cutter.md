# Video Cutter

Covers: `app/(app)/(movie-recap)/video-cutter/**`, `components/video-cutter/**`,
and the Video Cutter sidebar item.

## 2026-10-01 — A lossless, browser-only trim tool instead of a server source cache

**Decision, by the user:** recap sources were being re-downloaded from R2 for
every Auto read, script build, and render. A server-side disk cache was
proposed. The user chose a separate tool instead, to cut the source down
before uploading it. It is a sidebar item ("Video Cutter", gated by the
`movie_recap` feature because it serves that flow), and works like this:

- **Nothing leaves the device or is stored.** ffmpeg.wasm runs in the browser.
  There is no upload, no database row, and no R2 object.
- **One range per cut.** Every cut is taken from the original file. Cutting
  again replaces the previous output. Clear resets everything. The original
  file on disk is only read, never modified.
- **Lossless:** stream copy (`-c copy`), so the original quality is kept bit
  for bit. **Accepted consequence:** the cut starts on the keyframe at or
  before Start, so it can begin a little early. A frame-exact start would mean
  re-encoding, which the user ruled out.
- **WORKERFS mount:** the source File is read in place rather than copied into
  wasm memory, so a multi-GB source works. Only the cut output is held in
  memory, so very large cuts (around 2GB and up) can still fail.
- **Save** uses Chromium's save dialog, which can overwrite an existing file.
  Other browsers fall back to a normal download, which never overwrites.
- **Single-threaded ffmpeg core from unpkg.** The multi-threaded core needs
  cross-origin isolation headers on the whole app, which would break the R2
  and Supabase requests other pages make.

**Rejected for now:** the server-side source cache (keyed by object key, with
size/ETag validation, atomic `.part` downloads, and LRU eviction). Revisit if
repeated R2 downloads stay a problem after sources are trimmed.

## 2026-10-01 — The player reuses Translate's frame-accurate timeline

**Decision, by the user:** the source player is the same one the Translate
editor uses, not the browser's native controls. It reuses
`TranslateTimeline` with zoom down to individual frames, a measured frame
rate, a frame timecode, and ←/→ (Shift for one second) frame stepping. The cut
range appears as the timeline's single cue, so dragging its edges sets
Start/End on frame boundaries. Frame-exact marks still produce a
keyframe-aligned stream-copy cut; see the entry above.
