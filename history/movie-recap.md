# Movie Recap

Covers: `app/(app)/(movie-recap)/movie-recap/**`,
`app/api/(movie-recap)/movie-recaps/**`, `components/movie-recap/**`,
`lib/constants/movie-recap.ts`, `lib/movie-recap.ts`,
`lib/movie-recap-render.ts`, `lib/prompts/movie-recap-narration.ts`,
`lib/r2.ts`, `lib/spoosh.ts`, and the `movie_recap_projects` migrations.

## 2026-09-14 — Phase one is a resumable configuration project, not a render job

**Decision:** Movie Recap starts with a project dashboard and a persisted
four-step editor: source, settings, customization, and review. Clicking
Generate only marks the configuration `ready_for_generation`; phase one does
not manufacture a job, fake progress, or an output URL.

**Why:** the requested processing pipeline is explicitly phase two. A durable
ready state is the smallest honest handoff for that pipeline and lets users
reopen or edit the configuration now. Any later edit demotes the project back
to `draft`, so phase two cannot mistake stale settings for approved ones.

The one code-defined voice is `narrator`, with a stable preview at
`public/movie-recap/voices/narrator.mp3`. Output language is Burmese only.
Aspect ratio, subtitle mode, logo placement/opacity, and normalized blur
geometry live on the project row. (A deferred `copyright_free` boolean also
lived here originally; superseded 2026-09-15 — see below.)

## 2026-09-14 — Movie sources use R2 multipart upload with same-file reselection

**Decision:** videos upload browser-to-R2 in multipart chunks with three
workers. The database stores the active upload id; reopening lists completed
R2 parts, then asks the user to reselect a file with the same name, byte size,
and last-modified value. Failed parts receive a fresh signed URL and retry;
completed parts are not sent again.

**Why:** Cloudflare recommends multipart upload for video and other large
objects. Keeping the `File` itself across a browser restart would duplicate a
potentially huge movie into IndexedDB or depend on browser-specific file-handle
permissions. Reselection preserves server progress without either cost.

Upload progress uses `XMLHttpRequest.upload`; Fetch exposes no outbound upload
progress. Direct R2 requests are the same deliberate exception recorded for
chapter-image uploads: Spoosh owns calls to this app, not presigned third-party
storage URLs. App API calls still all use Spoosh.

**Accepted consequence:** the existing public R2 bucket was explicitly chosen
over a separate private bucket. Source and logo URLs are therefore public to
anyone who obtains them. Keys include project and random identifiers, but that
is obscurity, not authorization.

**Rejected:** one large PUT. It is simpler, but a network failure restarts the
whole movie and R2 recommends multipart for this workload. Also rejected:
persisting the video Blob in browser storage for transparent resume.

## 2026-09-14 — Preview edits are normalized configuration only

Aspect ratio changes the centered `object-cover` preview; subtitle mode shows a
fixed safe-area placeholder only for styled subtitles. Logo position uses four
corners. Blur is a normalized percentage rectangle clamped inside the selected
frame and supports pointer drag plus keyboard nudging. Actual crop, subtitle,
logo, blur, copyright transformation, and rendering remain phase two work.

GeckoUI 1.6.3 has no Slider. The opacity/width/height controls are an explicitly
approved narrow exception: accessible native range inputs styled with Tailwind
tokens. Other visible form controls remain GeckoUI components.

## 2026-09-15 — Upload failures are traceable without exposing upload grants

The browser upload flow emits structured console events prefixed with
`[MovieRecapUpload]` for file metadata, project/resume state, multipart sizing,
part attempts, retries, completion, and the final stopped reason. Logs include
part numbers and non-secret file metadata, but deliberately omit presigned R2
URLs and ETags because both are upload credentials or completion tokens.

## 2026-09-15 — 9:16 preview frame sizing bug, and a preview-only fit mode

**Bug fixed:** the 9:16 preview frame (`MovieRecapPreview.tsx`) applied
`w-full max-w-[620px]` and `max-h-[480px]` together regardless of orientation.
For 9:16, width was sized first (up to 620px), then `aspect-ratio: 9/16`
computed a ~1102px height, which `max-h-[480px]` then clipped without
shrinking width back down — producing a squashed, wrong-shaped frame instead
of a tall portrait one. Fixed by picking which dimension drives sizing based
on orientation: 9:16 uses a fixed `h-[480px]` with `w-auto` (height drives,
width derives from the ratio); 16:9 keeps the original `w-full max-w-[620px]`
with `h-auto` (width drives).

**Decision:** added a `fitMode` field (`cover` | `contain`, default `cover`)
on the project row, editable from the aspect-ratio tab, that only changes
whether the *preview* crops (`object-cover`) or letterboxes (`object-contain`)
the video inside the frame.

**Why:** the 2026-09-14 "Preview edits are normalized configuration only"
entry fixed the preview to a centered `object-cover` crop as phase-one scope,
with real crop/render behavior deferred to phase two. `fitMode` stays inside
that same boundary — it is still just a preview toggle, not a rendering
decision, so it does not pull phase-two work forward. Confirmed with the user
before building since it does expand what the phase-one preview does.

**Consequence:** `fitMode` is persisted and will need a real phase-two
rendering counterpart later (crop vs. letterbox in the actual output), but
that implementation is out of scope here — same as aspect ratio, subtitle
mode, logo, and blur already are.

## 2026-09-15 — Copyright-free transformation is mandatory, not optional (supersedes)

**Decision:** removed the `copyrightFree` toggle and its `copyright_free`
column entirely. Every project is now always treated as copyright-free;
there is no per-project choice.

**Why:** the 2026-09-14 phase-one decision explicitly recorded this as "the
deferred copyright-free boolean" — a deliberate optional per-project toggle.
The user asked to make it mandatory instead, which is a real reversal of that
choice, not a bug fix, so it was confirmed before implementing. Since every
project must always go through it, keeping a field that is always `true` (or
keeping a UI control that does nothing) would only be dead weight.

**Rejected:** keeping the DB column defaulted to `true` and just hiding the
UI control. Rejected because there is no scenario where the field is expected
to ever be `false` — a live but meaningless column and a value that can never
legitimately vary don't earn their keep in the schema.

**Consequence:** phase-two rendering must assume copyright-free transformation
always runs; it cannot read a per-project flag to skip it, because that flag
no longer exists.

## 2026-09-15 — Phase-two pipeline order and audio/video duration matching (design, not yet built)

**Decision:** phase-two render pipeline runs in this order:

1. AI reads source video (scene detection, dialogue/plot extraction).
2. Copyright-free transform on video only — freeze-frame, speed change,
   split/re-cut. Real source audio is dropped; our voice-over replaces it.
3. AI generates a narration script from step 1 ("ART file").
4. Narration script → TTS → voice-over audio (`narrator` voice profile).
5. Render: match final video segment durations to the locked narration audio,
   using a hybrid strategy — narration audio duration is authoritative;
   video segments are freeze/hold-padded or mildly speed-ramped (~5-15%) to
   fit each narration segment's window, with re-cut/re-split only when the
   mismatch is too large for freeze/speed alone.

**Why:** audio-driven duration matching (video conforms to narration, not the
reverse) fits recap style, where video is B-roll under narration. Pure
audio-driven (always freeze/hold) risks visually dead segments on large
mismatches; pure video-driven (always stretch/speed TTS to fit) distorts
narration pacing. Hybrid keeps normal-case segments untouched and only reaches
for the heavier fix (re-cut) when needed.

**Consequence:** this is a design decision for still-unbuilt phase-two
rendering, no code exists yet. It fixes the *order* (read → transform →
script → TTS → duration-matched render) and the *duration-matching strategy*
so a future implementer doesn't re-litigate them. Rejected alternatives:
strict audio-driven-only (dead freeze segments on big mismatches) and strict
video-driven-only (unnatural TTS speed distortion).

## 2026-09-15 — Phase-two-a: real render pipeline, TTS synthesis stubbed to console.log

**Decision:** built the actual pipeline (`lib/movie-recap-render.ts`, `POST
movie-recaps/:id/render`) instead of the phase-2 placeholder described above:
ffmpeg extracts the source audio, OpenAI Whisper transcribes it,
`generateMovieRecapNarration` (gpt-5.6-luna) writes a Burmese recap script
timed against the source video, and hybrid duration matching (speed-ramp
±15%, else freeze-pad or trim — see the entry above) renders a no-audio,
subtitle-track-only preview video. Every narration line is still generated
and logged (`[MovieRecapRender] ... TTS skipped, would synthesize: "..."`);
only the actual speech synthesis call is skipped, per explicit request to
keep this step visible rather than removing it, because generation is slow
and this phase is for testing the rest of the pipeline.

New project columns: `render_status`, `render_error`, `render_transcript`,
`render_script`, `render_output_url`/`render_output_object_key`,
`render_subtitle_url`/`render_subtitle_object_key`, `render_started_at`,
`render_completed_at`. New server helper `putObject` in `lib/r2.ts` — the
first R2 write that originates on the server rather than a presigned browser
upload, since the render output is generated server-side.

**Why estimated duration, not real audio:** with TTS skipped there is no
synthesized audio to measure, so each segment's spoken length is estimated
from word count (`WORDS_PER_SECOND_BURMESE = 2.3`) and used as the
duration-matching target instead. Swapping in real audio duration later is a
one-line change once TTS is wired up — the rest of the matching/render logic
doesn't change.

**Why subtitles are a WebVTT `<track>`, not burned into the video:** burning
Burmese text into video via ffmpeg's `subtitles`/`drawtext` filters depends on
a server-side font with Burmese glyph coverage and `libass` availability,
which isn't set up. A `<track>` element renders the browser's own font and
needs nothing from ffmpeg beyond the timestamps already being computed. This
applies to both `srt` and `styled` subtitle modes for now — a real burned-in
"styled" look (positioning, animation) is deferred; only "no subtitles" vs.
"has a subtitle track" is implemented today.

**Rejected:** true re-cut (choosing different footage) when a narration/video
duration mismatch is too extreme for freeze-pad or trim — logged as a
warning (`extreme duration mismatch`) instead of implemented, since it needs
its own clip-selection logic and is out of scope for this pass.

**Consequence:** `render_transcript`/`render_script` are real generated
data, not phase-2 placeholders — a future TTS integration reads
`render_script` for the exact text to synthesize per segment, and the
duration-matching math it should use is already implemented here, just with
an estimated duration in place of a measured one. The "Generate Recap Video"
button/`ready_for_generation` status is unchanged and unrelated to this
preview render.

## 2026-09-15 — Blur and logo are burned into the render preview too

**Decision:** the render pipeline now applies `blurEnabled`/`logoEnabled` to
the actual output, not just the customize-step client preview. Both apply
once, in a single ffmpeg pass over the whole concatenated video (`crop` +
`boxblur` composited back for blur; a scaled, opacity-adjusted logo image
`overlay`ed at the configured corner) — not per-segment, since both are a
fixed region/position for the entire recap, not something that changes shot
to shot.

**Why:** blur/logo were previously customize-step-only visuals with no real
counterpart in the output (same "preview edits are normalized configuration
only" gap the aspect-ratio/fit-mode entries above already covered for their
areas) — explicitly asked to close that gap for blur/logo now that a real
render pipeline exists.

**Consequence:** logo position/size math (`~18%` width, `4%` corner margin)
is duplicated between the CSS preview (`MovieRecapPreview.tsx`) and the
ffmpeg filter graph (`buildOverlayFilter` in `lib/movie-recap-render.ts`) —
there's no shared source of truth between a Tailwind layout and an ffmpeg
filter string, so if one changes, check the other.

## 2026-09-15 — Render-preview subtitle track styled to approximate the "styled" mode pill

**Decision:** the render-preview `<video>`'s `<track>` cues get a
Tailwind arbitrary `::cue` variant (`[&::cue]:bg-bg/80 [&::cue]:font-semibold
[&::cue]:text-fg`) when `subtitleMode === "styled"`, instead of the browser's
bare default caption styling.

**Why:** the step-3 customize preview shows a rounded, shadowed pill as a
mockup of "styled" subtitles, but the real `<track>` rendered plain
unstyled captions — a visible mismatch between preview and actual output.

**Rejected:** fully matching the pill (rounded corners, padding, drop
shadow). The WebVTT `::cue` pseudo-element only honors a narrow property set
— color, background-color, font, text-shadow, text-decoration — and ignores
border-radius/padding/box-shadow per spec, so an exact match isn't reachable
this way; burning subtitles into the video with ffmpeg's `subtitles`/`ass`
filter could get the exact look but needs a server-side Burmese-capable font
+ libass, deferred per the WebVTT-vs-burned-in decision above.

**Consequence:** this only affects the render-preview `<video>`; `srt` mode
still gets the browser's bare default caption styling (no override), which
matches that mode's "plain export" intent.

## 2026-09-15 — Real render progress, via polling not SSE

**Decision:** the render pipeline writes its current stage (`render_stage`:
`extracting_audio` → `transcribing` → `writing_script` →
`rendering_segments` with a live segment counter → `concatenating` →
`applying_overlays` → `uploading`) onto the project row as it runs
(`setProgress()` in `lib/movie-recap-render.ts`), cleared back to null on
completion or failure. The wizard polls `GET movie-recaps/:id` every 2s
while `renderStatus === "running"` and shows the current stage.

**Why polling, not SSE:** confirmed with the user — SSE would reintroduce
`@spoosh/transport-sse`, which was removed during the voice-lab "revert to
non-streaming" (see `history/voice-lab.md`). That case is not a precedent
against progress here: there, "real progress" broke because the underlying
model had to run in a fundamentally slower internal streaming mode just to
report it. Here, a DB row update between ffmpeg/OpenAI calls costs nothing —
the pipeline already has real, wall-clock-significant discrete stages, so
progress is free to report and polling is a plain HTTP GET, no new transport.

**Consequence:** progress lags real state by up to ~2s (poll interval), and
the render POST request itself still blocks for the whole pipeline exactly
as before — the poll only reads what that request is writing, it doesn't
change how the render itself runs.

## 2026-09-15 — Bug fixed: one narration segment produced one giant, striped subtitle cue

**Bug:** each `render_script` entry is a full recap sentence/paragraph —
correct for narration/TTS text — but the VTT builder turned one segment into
one subtitle cue verbatim. A long cue wraps across many lines in the
browser, and `::cue` backgrounds render per wrapped line (spec behavior, not
a bug in the styling itself — see the earlier "approximate the styled pill"
entry), so the result was several stacked boxes instead of one clean
caption, visibly different from the step-3 preview mockup.

**Fix:** `splitIntoCaptionChunks()` in `lib/movie-recap-render.ts` splits
each narration segment on Burmese sentence breaks (`။`), then further on
spaces if a "sentence" is still over ~40 chars, and each segment's estimated
duration is divided across its chunks proportionally by character length.
Only affects how subtitle cues are sliced — `render_script` (the text future
TTS will read) is untouched, still one entry per full narration segment.

## 2026-09-15 — Cancel a running render

**Decision:** added `POST movie-recaps/:id/render/cancel`. The render
pipeline creates an `AbortController` per run, keyed by project id in an
in-memory `Map` (`activeRenders` in `lib/movie-recap-render.ts`); cancel
looks up that id and calls `.abort()`. The signal is threaded into every
ffmpeg `execFile` call and both OpenAI calls (Whisper transcription, GPT
narration), so an abort actually kills the in-flight child process/request
instead of just giving up client-side. On abort, the row is marked
`render_status: "failed"`, `render_error: "Cancelled."` — there's no
separate "cancelled" status value.

**Why an in-memory map, not a DB-backed job/queue table:** this app runs as
one Node process (the whole deployment target here — see the "real render
progress" entry above making the same call for polling), so a plain module-
level `Map` is visible to both the render request and the cancel request
without any new infrastructure. It would NOT survive multiple server
instances or serverless isolates — noted as a real limit, not an oversight,
consistent with this feature's other "single-process, personal-scale"
choices.

**Consequence:** the Review step's "Render Preview" button also had to stop
relying on local `renderStatus` alone to know a render is running client-side
optimistically before the request resolves (added right before this — see
the render-progress entry) — cancel's availability (`renderStatus ===
"running"`) piggybacks on that same flag.

## 2026-09-15 — Cancel also self-heals a row orphaned by a process restart

**Bug:** a dev-server restart (hot-reload from an unrelated file edit, or any
process restart) wipes the in-memory `activeRenders` map without ever
reaching the render pipeline's own `catch`/`finally` — so the row is left at
`render_status: "running"` forever, and no future render can start
("A render is already in progress."). Hitting Cancel on that row correctly
found no live `AbortController` and reported `{ cancelled: false }`, leaving
the row stuck exactly as before.

**Fix:** the cancel route, when `cancelMovieRecapRender` finds nothing to
abort AND the row still says `running`, resets it directly
(`render_status: "failed"`, `render_error: "Cancelled."`) instead of just
reporting failure. Safe because "no controller for this id" in this
single-process app means nothing is actually running — there's no other
process that could still be holding it.

## 2026-09-15 — Mock render, logo geometry parity, and a real subtitle design

**Mock render.** `POST movie-recaps/:id/render` takes `{ mock: true }`. It
skips Whisper and the GPT narration pass and uses canned Burmese lines
(`MOVIE_RECAP_MOCK_NARRATION`) spread over the first
`MOVIE_RECAP_MOCK_SOURCE_SECONDS` (40s) of the source; everything after that —
segment rendering, duration matching, concat, blur/logo overlays, VTT, upload —
is the identical code path. `render_is_mock` records which kind of render
produced the current output, and the Review step has separate "Render Mock
Preview" and "Render AI Preview" buttons.

**Why:** design iteration on framing/logo/subtitles was paying for a Whisper
transcription plus a GPT script on every attempt, which made the visual work
too expensive to do properly. Mock keeps the expensive steps out and the
visual output real. **Rejected:** a client-only mock (fake output URL, no
ffmpeg) — it would not show the actual rendered frame, which is the whole
point.

**Logo geometry parity (bug).** The preview capped the logo at 18% frame width
*and* `max-h-16`, while `buildOverlayFilter` scaled to 18% width with `-1`
height and no cap — so a tall logo rendered visibly bigger than it previewed.
Both now use one shared box, `MOVIE_RECAP_LOGO_BOX` (18% width × 12% height,
4% margin), fitted with `force_original_aspect_ratio=decrease` on the ffmpeg
side and `object-contain` in a fixed percentage box on the CSS side. This
replaces the earlier entry's "the math is duplicated, check both" consequence
with a single exported constant.

**Subtitle design is now real configuration.** New columns:
`subtitle_font_size` (% of frame height), `subtitle_color`, `subtitle_bg_color`,
`subtitle_bg_opacity`, `subtitle_position` (bottom/middle/top),
`subtitle_offset` (% from that edge), `subtitle_bold`. The styled subtitle is
drawn as real DOM over the video by `MovieRecapSubtitleOverlay`, shared by the
step-3 preview and the Review player (`MovieRecapRenderPlayer`), so what is
configured is exactly what is shown in both. The VTT track still supplies
timing — it is switched to `mode = "hidden"` so the browser reports cues
without painting its own captions.

**Supersedes** the `::cue` styling entry above: `::cue` ignores padding,
border-radius and box-shadow, so it could only ever approximate the pill. Its
reasoning stands (that is why `::cue` was dropped), but the conclusion "an
exact match isn't reachable" applied to `::cue` only — a DOM overlay reaches it.

Sizes are percentages of frame height (rendered with container-query `cqh`
units) rather than pixels specifically so the same numbers can drive a future
burned-in render at any output resolution.

**Consequence — subtitles are still not burned into the exported MP4.** The
installed ffmpeg (8.1.1, Homebrew) is built without libass and without
libfreetype, so `subtitles`, `ass` and `drawtext` filters do not exist on this
machine; the design lives in the app's player only. Burning in needs an ffmpeg
with libass plus a Burmese-capable font passed to it (Pyidaungsu and Noto Sans
Myanmar are installed locally).

## 2026-09-15 — Styled subtitles are burned in with libass (ffmpeg-full)

**Decision:** styled subtitles are now rendered into the output file. The
pipeline writes an `.ass` file built from the same cues as the VTT
(`buildAss`) and applies it in the existing single overlay pass, between blur
and logo so the logo stays the topmost mark. The player draws nothing over the
video any more — what plays in Review is the exported frame. The WebVTT track
is kept and attached only in `srt` mode, where the subtitle is a separate
deliverable rather than part of the picture.

**Setup this requires:** Homebrew's `ffmpeg` formula no longer ships
libass/freetype (moved to the keg-only `ffmpeg-full`), which is why
`subtitles`/`ass`/`drawtext` were missing. `brew install ffmpeg-full`, and the
render pipeline reads `FFMPEG_PATH`
(`/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`) with `MOVIE_RECAP_SUBTITLE_FONT`
(default `Noto Sans Myanmar`, system-installed) for the face. Both are in
`.env`. Without `FFMPEG_PATH` the pipeline still runs on plain `ffmpeg` and
only the burn-in step fails — it is the one thing that needs libass.

**BorderStyle 3, not 4 (tested):** ASS mode 4 boxes each text run separately,
so a Burmese line rendered as a row of overlapping rounded blobs. Mode 3 draws
one box around the whole line, padded by `Outline` — the CSS pill. In mode 3
the box colour comes from `OutlineColour`, so the background colour/opacity is
written into both the outline and back colour slots.

**Consequence:** the design is now defined twice — CSS
(`MovieRecapSubtitleOverlay`, the step-3 mock) and ASS (`buildAss`). Both read
the same percentage-of-frame fields, so a new subtitle control must be added
to both or the preview and the export will disagree. This supersedes the
earlier entry's "not burned into the exported MP4" consequence.

## 2026-09-15 — Subtitle preview and export now share a font; default size raised

**Bug:** a subtitle that looked right in the step-3 preview came out small in
the rendered video, at the same configured percentage. Sizing was never the
problem — both sides already scale with the frame (`cqh` in CSS, `Fontsize`
against `PlayResY` in ASS, so a value is resolution-independent). The cause was
the *face*: the preview inherited the app's UI font stack (macOS resolved
Burmese to Myanmar Sangam MN / Pyidaungsu), while libass burned
`Noto Sans Myanmar`. Burmese faces differ a lot in how much of the em box the
glyph body fills, so an identical nominal size read as two different sizes.

**Fix:** the preview overlay now loads `Noto Sans Myanmar` through
`next/font/google` — the same family `MOVIE_RECAP_SUBTITLE_FONT` names for the
burn-in. Same face on both sides, so what step 3 shows is what the export
produces.

**Also:** the default size moved 4.5% → 6% of frame height and the slider
ceiling 12% → 16% (migration also lifts existing rows still on the old
default). 4.5% is broadcast-caption size, below what recap/social video
normally uses.

**Rejected for now:** a calibration multiplier on the ASS font size to
compensate for the metric difference. It papers over the mismatch instead of
removing it and has to be re-tuned whenever the font changes — keep it in
reserve only if a residual difference shows up now that both sides share a
face.

**Consequence:** the app's preview depends on the Google-hosted
`Noto Sans Myanmar` (self-hosted at build time by `next/font`), while the
render uses whatever `Noto Sans Myanmar` fontconfig finds on the render
machine — the macOS system copy locally. Same family, but if a render host
ships a different cut, the two can drift apart again.

## 2026-09-15 — The preview was lying about subtitle size (cqh fell back to the viewport)

**Bug:** a subtitle occupying ~67% of the frame width in the step-3 preview
came out at ~30% in the export. Measured with libass at an identical 6%
setting, the same line is 33% of frame width in Noto Sans Myanmar, 39% in
Pyidaungsu, 44% in Myanmar Sangam MN — no font choice explains 67%. The
preview was rendering at roughly 2x its configured size: `font-size: Xcqh`
resolves against the nearest **size** container, and when the frame did not
establish one the unit silently fell back to viewport height (~750px instead
of the frame's ~350px). No error, just a wrong number. The export was correct
the whole time.

**Fix:** the overlay measures its frame (`offsetParent` + `ResizeObserver`) and
sets `font-size` in px from the percentage itself. `subtitleFrameClass()` and
the `container-type: size` marker are gone.

**Why not just fix the container:** a container query that silently degrades to
a completely different reference size is exactly the failure that cost this
round of debugging — the preview looked plausible while being 2x off. An
explicit measurement can be wrong, but it cannot be wrong *quietly*.

**Consequence:** the default moved 6% → 10% (migration lifts rows on the old
4.5/6 defaults). The sizes people approved while the preview was 2x were
really ~half of what they saw, so the honest preview needs a bigger number to
show the same look. For reference at 16:9 with the sample line: 6% ≈ 33% of
frame width, 10% ≈ 55%, 12% ≈ 67%.

## 2026-09-15 — Bug fixed: libass sizes by ascent+descent, CSS sizes by em (2.184x)

**Bug:** with the preview finally honest, the burned subtitle was still ~2x
smaller than the preview at the same configured percentage. Measured, same
font, same line, nominal size 100: FreeType/`drawtext` (which sizes by em, the
convention CSS `font-size` uses) draws it 1243px wide / 146px tall; libass with
`Fontsize: 100` draws it 540 x 68. The ratio is the font's
`(hhea ascender - descender) / unitsPerEm` — **2.184** for Noto Sans Myanmar,
which reserves that much vertical space for stacked Burmese marks. libass fits
ascent+descent into `Fontsize`; CSS fits the em into `font-size`. Same number,
2.18x different picture.

**Fix:** `buildAss` computes `cssPx` (the size the preview uses, in output
pixels) and writes `Fontsize = cssPx * ASS_FONT_SIZE_RATIO`
(`MOVIE_RECAP_SUBTITLE_FONT_RATIO`, default 2.184). Box padding is derived from
`cssPx` too, so it stays the CSS pill's 0.35em rather than scaling with the
inflated number. Verified: after the fix both renderers put the same line at
identical ink height (107px) and within 5% on width.

**Consequence:** `ASS_FONT_SIZE_RATIO` is per-font. Changing
`MOVIE_RECAP_SUBTITLE_FONT` without recomputing it
(`(hhea ascender - descender) / unitsPerEm` of the new face) silently
reintroduces this mismatch. This is the calibration constant the earlier entry
rejected — rejected there as a fudge for a metric difference of unknown origin;
accepted here because the origin is now measured and the number is derived from
the font, not tuned by eye.

**Note:** any render made before this fix keeps its old, small subtitles — the
size is burned in, so those projects need re-rendering.

## 2026-09-15 — The mock render opens with the preview's own sample line

`MOVIE_RECAP_SUBTITLE_SAMPLE` is now one constant used by both the step-3
preview overlay and as the first line of `MOVIE_RECAP_MOCK_NARRATION`, and the
mock path skips `splitIntoCaptionChunks` (each mock line is already one
caption). So a mock render's first cue puts the identical words, at the
identical size, in the identical place as the preview — the comparison the mock
render exists for. Real renders still split narration into caption-sized cues;
that behaviour is unchanged.

## 2026-09-16 — Styled burned-in subtitles are the only mode (supersedes)

**Decision:** the subtitle mode chooser is gone. "No Subtitles" and "SRT file
only" are removed, the Subtitle tab shows the style controls directly, and
`subtitle_mode` is dropped from the schema along with `render_subtitle_url` /
`render_subtitle_object_key`. Every render burns subtitles into the picture
with the configured design; no WebVTT sidecar is produced and the review player
carries no `<track>`.

**Why:** requested, and confirmed before implementing because it reverses the
2026-09-14 "preview edits are normalized configuration only" entry (which
listed subtitle mode as one of the per-project settings) and the
WebVTT-vs-burned-in reasoning in the two 2026-09-15 entries. Those entries'
reasoning is superseded, not just overridden: they chose a `<track>` because
this ffmpeg build had no libass, and the "srt" mode existed as the plain-export
escape hatch from a styling approach that could not reproduce the design.
libass is installed now and the burn-in matches the preview exactly, so both
reasons are gone.

**Rejected:** keeping `subtitle_mode` pinned to `'styled'`, and keeping the
`.vtt` upload as a downloadable sidecar. Both would leave a value that can
never vary plus dead code paths, the same trade rejected for `copyright_free`.

**Consequence:** there is no way to ship a recap without subtitles, and no
separate subtitle file to hand to an editor. Re-adding either means a new
column and a real branch in the render pipeline, not just a UI toggle. Any
`.vtt` objects already uploaded to R2 by earlier renders are now orphaned —
their rows no longer point at them.

## 2026-09-16 — Text shadow added, then removed; the two-layer ASS output stays

A `subtitle_shadow` toggle (offset 10% of text size, hard-edged black at 75%,
mirrored in the preview as `text-shadow: Npx Npx 0`) was built and then removed
the same day at the user's request. Its column is dropped; there is no shadow
control and no shadow in the output.

**What the attempt established, and why the ASS output still emits two layers
per cue:** no single ASS BorderStyle gives both a line-wide background box and
a per-glyph drop shadow. Tested — BorderStyle 3 paints the box but its `Shadow`
offsets the whole box; BorderStyle 1 shadows each glyph but has no box. The
two-layer split (layer 0 = `Box` style, BorderStyle 3, box colour in
`OutlineColour`, text fully transparent; layer 1 = `Text` style, BorderStyle 1,
no border) was kept because it is also what makes 0% background opacity draw
nothing at all behind the text. Anyone re-adding a shadow adds `Shadow N` to
the `Text` style and needs no restructuring.

**Rejected while building it:** painting the box layer's text in the background
colour rather than transparent — below 100% opacity the glyph fill and the box
double up and the letters show through as darker shapes.

**Also fixed (kept):** the preview pill had an unconditional `shadow-lg` that
the burned output never reproduced, most visible at 0% background opacity where
the preview drew a shadow under a box that wasn't there. Removed; neither side
draws a shadow now.

**Known remaining mismatch:** the preview pill is `rounded-lg`, the burned box
has square corners. ASS BorderStyle 3 has no corner radius.
