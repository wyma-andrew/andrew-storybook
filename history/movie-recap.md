# Movie Recap

Covers: `app/(app)/(movie-recap)/movie-recap/**`,
`app/api/(movie-recap)/movie-recaps/**`, `components/movie-recap/**`,
`lib/constants/movie-recap.ts`, `lib/movie-recap.ts`,
`lib/movie-recap-render.ts`, `lib/prompts/movie-recap-narration.ts`,
`lib/r2.ts`, `lib/spoosh.ts`, `lib/tts/**`, and the `movie_recap_projects`
migrations.

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

## 2026-09-15 — Copyright-free transformation is mandatory, not optional (supersedes) (superseded 2026-09-16)

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

## 2026-09-15 — Phase-two-a: real render pipeline, TTS synthesis stubbed to console.log (superseded 2026-09-16)

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

## 2026-09-15 — Subtitle preview and export now share a font; default size raised (superseded)

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

## 2026-09-16 — The render reads the picture too: scene detection + a vision pass

**Decision:** before narration, the pipeline now detects scenes with
PySceneDetect, extracts one keyframe per scene, and has the vision model
describe each frame in one English sentence. The narration model receives
`scenes[{index, startS, endS, visual, dialogue}]` and returns one Burmese line
per SELECTED scene index — not timestamps it invented. Dialogue is matched to a
scene by overlapping the Whisper transcript with the scene's own time range.

**Why:** a transcript cannot see. Action beats, establishing shots and anything
between lines of dialogue were invisible to the old prompt, which only ever saw
text. This also fixes clip selection at the root: because the model picks scene
indexes, every recap clip starts and ends on a real cut, which is what the
"extreme duration mismatch" warnings were really complaining about. The
2026-09-15 pipeline-order entry already specified "scene detection" in step 1;
phase-two-a shipped without it, and this closes that gap rather than reversing
anything.

**Why PySceneDetect over ffmpeg `scdet`:** confirmed with the user. ffmpeg
needs no install and the pipeline already shells out to it, but it handles slow
dissolves and dark scenes noticeably worse and has no adaptive detector. The
cost is a Python dependency: `.venv-scenedetect`, invoked as a CLI through
`SCENEDETECT_BIN` (see README), not as a library binding.

**Budget decisions, measured on real footage** (71s sample: 18 scenes, detect
3.4s, keyframes 2.0s, vision 5.1s):
- Scenes shorter than 2s merge into the previous one — a recap beat is never
  half a second, and flash cuts would dominate the keyframe budget.
- At most 300 scenes are carried forward, keeping the LONGEST ones (a two-hour
  film detects ~2000 cuts; long scenes carry plot, quick cutaways rarely do).
- Keyframes are taken a third of the way into each scene — past the cut's fade
  and motion blur, still on that scene's subject.
- Images go at `detail: "low"` (~19 prompt tokens each) in batches of 25, so
  the whole vision pass costs about a page of text.

**Also:** the source is now downloaded once to the work directory and every
later ffmpeg call reads that local copy. Scene detection decodes the entire
file, and the per-segment clip extraction was re-fetching over the network for
every segment.

**Rejected:** 3 keyframes per scene (3x cost/time for motion within a shot),
and describing only dialogue-free scenes (cheapest, but then the scenes that
matter most get no visual context).

**Consequence:** a real render now spends minutes of local CPU on detection
before its first API call, every time — scene results are not cached on the
project row yet, so re-rendering the same source repeats that work. The mock
render skips detection, vision, Whisper and narration entirely, so it stays the
fast path for design work.

## 2026-09-16 — Bug fixed: the duration estimate counted Burmese "words"

**Bug:** shots flashed past and subtitles were unreadable.
`estimateSpokenSeconds` counted whitespace-delimited words and divided by 2.3
words/sec — but Burmese is not space-delimited; its spaces mark phrase breaks.
Every narration line, whatever its length, counted as ~4 "words" and got the
same **1.7s**. That single number was the clip's target duration AND the
subtitle's on-screen time, so it made short shots and sub-second cues together.

**Fixes, all three requested together:**
- **Estimate by characters** — `CHARS_PER_SECOND_BURMESE = 8.5` (unhurried
  narration). The same lines now come out 5.4-6.7s instead of 1.7s.
- **Cue floors** — `MIN_CUE_S = 1.5` and `MAX_CUE_CHARS_PER_SECOND = 11`
  (roughly broadcast practice, slower than the ~17 CPS used for Latin text).
  `timeCaptionChunks()` applies both, then reports the total.
- **Shot floor** — `MIN_SEGMENT_S` raised 1s -> 3s.

**Order reversed on purpose:** cues are now split and timed BEFORE the clip
length is chosen, and their total becomes the segment's target duration. The
video follows the subtitles rather than cutting away mid-caption. Previously
the clip length was decided first and cues were squeezed into whatever was
left.

**Consequence:** recaps get longer — every beat is at least 3s and carries its
full reading time, where before many were 1.7s. Trimming can no longer produce
a flash cut, since the trim target already includes both floors. The estimate
is still an estimate; measuring real synthesized audio from the self-hosted
VoxCPM2 worker (the voice lab's) would remove the guess entirely and is the
obvious next step — deliberately left for its own pass.

## 2026-09-16 — Tuning pass: readable, but shorter

The character-based timing fixed readability and overshot into dragging. Tuned
down without giving the floors back:

- `CHARS_PER_SECOND_BURMESE` 8.5 -> 10 (brisk recap pace, not an audiobook)
- `MIN_SEGMENT_S` 3 -> 2.5
- `MIN_CUE_S` 1.5 -> 1.3, `MAX_CUE_CHARS_PER_SECOND` 11 -> 13

**The bigger lever was the prompt, not the constants.** A narration line's
length decides how long its clip sits on screen, so the narration prompt now
asks for one idea per line, 30-60 Burmese characters, never over 80. Measured
on sample lines: constants alone took three beats from 18.0s to 15.3s; with
short lines the same three beats are 11.1s, each 3-5s with cues at ~10.5 ch/s
(still under the 13 ceiling).

**Consequence:** pacing is now shared between a prompt instruction and the
timing constants, so a future "too fast"/"too slow" complaint can come from
either. Check the generated `render_script` line lengths first — if lines are
running 80+ characters the model is ignoring the instruction, and no constant
will fix that.

## 2026-09-16 — Second tuning pass, and where the floor is

Shots still dwelled. Pace raised again and lines shortened further:

- `CHARS_PER_SECOND_BURMESE` 10 -> 12.5
- `MIN_SEGMENT_S` 2.5 -> 2, `MIN_CUE_S` 1.3 -> 1.2,
  `MAX_CUE_CHARS_PER_SECOND` 13 -> 15
- narration prompt: 25-45 Burmese characters per line, 60 max (was 30-60/80)

Measured on the same three lines: 13.1s -> 11.1s -> **8.9s**, beats now
2.6-3.8s at ~13 ch/s.

**This is the floor for the constants.** ~13 ch/s of Burmese is the fast end of
readable, and the whole reason this timing work started was captions that could
not be read. Further shortening should come from shorter narration lines, not a
higher rate — if beats still feel long, check `render_script`: a line over ~60
characters means the model ignored the prompt, and lowering the constants will
only make that line unreadable rather than shorter.

## 2026-09-16 — Narration register: spoken Burmese, not literary

**Problem:** the script read like a book being recited — `ပစ်ချနိုင်ခဲ့သည်`,
`အပြင်းအထန်လိုက်သည်`. Burmese is diglossic, and the model defaults to the
literary register (စာပေ) for anything that looks like writing, which is wrong
for a voice-over.

**Fix:** the narration prompt names the grammar instead of asking for a tone.
"Write naturally" does not move a model off literary Burmese; naming the
endings does. Three lines: spoken endings တယ်/ပါတယ်/မယ်/တာ and never သည်; တွေ
not များ, ရဲ့ not ၏, ဒီ/အဲဒီ not ဤ/ထို, no သော/လျက်/ခြင်း; plain everyday
words.

**Kept deliberately short.** A first version spelled the same rules out over
eight lines with a before/after example. It worked, but the register block was
then a third of the prompt and crowded the instructions that decide content and
line length. The Burmese tokens are the entire lever — the English around them
is padding, so it was cut back to one sentence each and re-verified.

**Verified** with real generations over five synthetic scenes, before and after
the trim: 5/5 lines in spoken register both times, 48-55 characters, e.g.
`သူက ဒုံးကျည်ပစ်ပြီး ရန်သူလေယာဉ်ကို ဖျက်ဆီးလိုက်တယ်`.

**Consequence:** the register rules are a third of the narration prompt now. If
lines ever drift back to သည် forms, the check is the prompt, not the timing
constants — and `render_script` is the place to look, since the burned subtitle
is that text verbatim.

## 2026-09-16 — Long captions were overpaid: tiered reading rate + a hard shot cap

**Problem:** long subtitle lines held their shot longer than they should. The
estimate was linear — characters ÷ 12.5 — so a 57-character line always cost
4.4s. Reading is not linear: starting a caption costs the most, continuing it
is faster.

**Fix:** the first `LEAD_IN_CHARS` (35) are timed at 12.5 ch/s and everything
after at `CONTINUATION_CHARS_PER_SECOND` (20). Added `MAX_SEGMENT_S = 5` as a
hard ceiling on any single shot: over it, cues are squeezed by a common factor,
but never past `ABS_MAX_CUE_CHARS_PER_SECOND` (18), so an over-long line
overruns the cap instead of becoming an unreadable flash.

Measured (flat -> tiered+cap): 33 chars 2.5s -> 2.5s, 51 chars 4.1s -> 3.8s,
57 chars 4.4s -> 3.8s, 96 chars 5.3s -> 5.3s at the 18 ch/s limit.

**Consequence:** short lines are unchanged, medium lines tighten, and a shot
that still runs past 5s means the narration model wrote a line far over the
prompt's 60-character limit. That is a prompt problem — the timing layer
deliberately refuses to fix it by making the caption unreadable.

## 2026-09-16 — Third timing pass: long captions cost less again

Long lines still held their shot too long. Only the long-line path was touched;
short lines are unchanged by design.

- `CONTINUATION_CHARS_PER_SECOND` 20 -> 28 (everything past the first 35
  characters)
- `MAX_SEGMENT_S` 5 -> 4, `MAX_CUE_CHARS_PER_SECOND` 15 -> 16,
  `ABS_MAX_CUE_CHARS_PER_SECOND` 18 -> 20

Measured (before -> after): 33 chars 2.5s -> 2.5s, 48 chars 3.7s -> 3.6s,
53 chars 3.5s -> 3.3s, 91 chars 5.1s -> 4.5s.

**Where this now sits:** a 91-character line runs every cue at the 20 ch/s
absolute limit — the timing layer is out of room, and that line is 50% over the
prompt's 60-character maximum. Further shortening has to come from the
narration prompt (or from enforcing length at generation time), not from these
constants; lowering them further only produces captions that cannot be read.

**Not done, and the reason:** enforcing `maxLength` on the narration schema was
started and stopped. It would cap line length at generation time rather than
asking for it in prose, and nothing in the pipeline truncates text — worth
testing whether strict structured outputs accepts the keyword before relying
on it.

## 2026-09-16 — About a second off every caption, and ending variety

**Timing.** Asked for roughly 1s off a ~10-word (45-55 character) line:
`LEAD_IN_CHARS` 35 -> 20, `CONTINUATION_CHARS_PER_SECOND` 28 -> 36,
`MAX_CUE_CHARS_PER_SECOND` 16 -> 22, `ABS_MAX_CUE_CHARS_PER_SECOND` 20 -> 26,
`MIN_CUE_S` 1.2 -> 1, `MAX_SEGMENT_S` 4 -> 3.5. Measured: 33 chars 2.5s ->
2.0s, 48 chars 3.6s -> 2.7s, 53 chars 3.3s -> 2.4s, 91 chars 4.5s -> 3.6s.

Cues now run at 21-26 ch/s, well past the ~13 ch/s this timing work started
from and past ordinary broadcast practice. That is a deliberate, user-made call
by a native Burmese reader on their own footage, not a derived number — do not
"correct" it back toward a standard reading rate without asking.

**Ending variety.** Every generated line ended in တယ်, which reads as a list
rather than narration. Cause was the prompt itself: it listed တယ်/ပါတယ်/မယ်/တာ
as the allowed spoken endings and the model took the first one every time. The
rule now states the constraint (never သည်) and asks for variation across
တယ်၊ ပါတယ်၊ တာ၊ တာပဲ၊ မယ်၊ လိုက်တယ်၊ နေတယ်၊ ခဲ့တယ်၊ ပြီ, with no three lines
ending alike. Listing permitted forms without asking for variation is what
caused the monotony — worth remembering for any future register rule.

## 2026-09-16 — Register rules replaced by a role; တယ် is not prompt-induced

**Replaced** the grammar checklist (spoken endings, never သည်, တွေ not များ,
ရဲ့ not ၏, no သော/လျက်/ခြင်း) with two sentences: the model is a Burmese recap
narrator on YouTube, writing lines the way it would say them aloud rather than
the way they would be written in a book.

**Tested, and it holds:** 5/5 lines came back in spoken register with no
literary forms at all. The checklist was not doing the work its earlier entry
claimed — a role framing is enough, and it leaves room for the model to vary
its own phrasing.

**Correction to the previous entry:** every line ending in တယ် was blamed on
the prompt listing တယ် first. That was wrong, and was asserted without testing.
With the ending list removed entirely, output is still 5/5 တယ် — it is how the
model writes Burmese declaratives, not something the wording induced. Forcing
alternatives (ပြီ၊ မယ်၊ တာပဲ) changes tense or mood, so it is left alone unless
a native listener says the repetition actually grates.

**Still open:** the line-length rule (25-45 characters, 60 max) is the weakest
instruction in the prompt — generations run 48-64. Since line length sets shot
duration, that is where pacing complaints should be aimed next, not at the
timing constants.

## 2026-09-16 — Subtitle weight is three-way, "Extra bold" is faked in both layers (superseded)

**Decision:** `subtitle_bold` (boolean) is replaced by `subtitle_font_weight`
(400 / 700 / 900, checked in SQL, backfilled bold→700). The customize step now
shows a "Font weight" three-button picker instead of a Bold switch, because the
reference look the user is matching (heavy yellow Burmese captions) is heavier
than Noto Sans Myanmar's 700.

**900 is not a heavier font file.** ASS/libass has a single Bold flag and no
weight axis, so a real 900 cut cannot be selected in the burn-in at all. "Extra
bold" is therefore bold glyphs plus an outline in the *text* colour, which
grows the glyph body outward: ASS `Outline = round(cssPx *
MOVIE_RECAP_SUBTITLE_FAUX_BOLD_EM)` with `OutlineColour` = the text colour on
the `Text` style (the `Box` style is untouched, so the pill does not grow).

**Rejected: a real 900 face in the CSS preview only.** It previews a weight the
export cannot produce — the same parity failure the font-face and `cqh` entries
above already cost a day each. The preview fakes it the same way instead:
`-webkit-text-stroke` in the text colour at *double* the width with
`paint-order: stroke fill`, since CSS centres the stroke on the glyph edge
while ASS grows outward — doubling and painting the stroke under the fill
leaves exactly the outward half visible.

**Consequence:** at 900 the outline shares the `Text` style's colour, so it is
invisible against the text by design. If a *contrasting* outline (black rim
around yellow text) is ever wanted, that is a separate setting — do not
repurpose the faux-bold outline for it, or weight and rim will fight over one
ASS field.

## 2026-09-16 — Text shadow is configuration (supersedes "no drop shadow")

**Decision:** new `subtitle_shadow` (% of the subtitle font size, 0–20, default
0 = off) and `subtitle_shadow_color`, exposed in the customize step as a slider
plus a colour row that only appears above 0.

**Supersedes the "No drop shadow" note** in the subtitle-overlay entry above.
That note was never "shadows are wrong" — it was parity: the ASS style wrote
`Shadow 0`, so a CSS shadow was decoration the export could not reproduce. Both
layers now read the same setting, so the rule it was protecting still holds.

- Render: `Shadow` on the `Text` style, with the shadow colour in `BackColour`;
  the `Box` style keeps `Shadow 0`, so the pill does not get its own shadow.
- Preview: `text-shadow` with the SAME offset on x and y and a **0 blur
  radius**, because libass offsets the shadow on both axes and does not blur
  it. A softer, blurred CSS shadow is rejected for that reason.
- Size resolves against `cssPx` (the CSS-equivalent font size), not the
  ASS-inflated `fontSize`, same as the pill padding.

**Note for a future reader:** shadow and the 900 "extra bold" faux outline use
different ASS fields (`Shadow`/`BackColour` vs `Outline`/`OutlineColour`), so
they compose — an extra-bold caption can still carry a shadow.

## 2026-09-16 — Shadow and heavy weight are switch + options, not magic values

**Decision:** both extras follow the same shape as Add Logo and Blur — a
`Switch` that turns the feature on, and its options revealed only when it is
on. New columns `subtitle_shadow_enabled` and `subtitle_font_weight_enabled`
(both default false); backfilled from what each project already rendered
(shadow > 0, weight <> 400).

**Rejected: "off" as a value inside the control** (0% on the shadow slider, a
"Regular" entry in the weight picker). It reads as a setting when it is really
a feature switch, and it left two encodings of the same state — a project could
sit at `shadow_enabled`-equivalent 0% while carrying a shadow colour, and the
weight picker showed three buttons where one of them meant "none of this". The
value columns now only ever hold the *on* look: `subtitle_shadow` is checked
1–20 (default 6) and `subtitle_font_weight` is 700 or 900 (400 is gone).

**Consequence:** the render and the preview both gate on the boolean, never on
the value — do not "simplify" `subtitleShadowEnabled ? … : 0` back to a
`subtitleShadow > 0` test, or a project that is switched off but still holds
its remembered 6% will start drawing a shadow again.

## 2026-09-16 — Bold and shadow are switches with no knobs (supersedes both entries above) (superseded)

**Decision:** the subtitle tab exposes exactly two booleans — `subtitle_bold`
and `subtitle_shadow`. The size slider, shadow-colour row and the
Bold/Extra-bold picker added earlier today are gone, along with the columns
behind them (`subtitle_shadow`, `subtitle_shadow_color`, `subtitle_font_weight`
were dropped; the two `*_enabled` booleans were renamed to the plain names).

**Why the earlier shape was wrong:** those entries treated shadow depth and
weight step as things a user would tune per project. They are not — every
project wants the same one, and each extra control is another number that has
to stay in parity between the CSS preview and the ASS style. The look is now
fixed in code: `MOVIE_RECAP_SUBTITLE_SHADOW_EM` (0.06 of the font size) and
`MOVIE_RECAP_SUBTITLE_SHADOW_COLOR` (black), read by both layers.

**Also dropped: the 900 "extra bold" faux outline.** With no weight step to
choose, nothing sets it, so the `Outline`/`OutlineColour` trick and
`MOVIE_RECAP_SUBTITLE_FAUX_BOLD_EM` are removed and the `Text` style is back to
`Outline 0`. The reasoning in the superseded entry still stands if a heavier
weight is ever wanted again — libass has a Bold flag, not a weight axis, so it
would have to be faked in both layers the same way.

**Consequence:** `Outline` on the `Text` style is free again. A future
contrasting rim (black edge around yellow text) can use it without fighting a
weight setting for the same field.

## 2026-09-16 — Blur region preview: no tint, and the radius is converted

**Reported as "the subtitle colour changes after render."** It does not — the
same glyph measures `#FAE17F` in the export and `#FAE179` in the preview, and
`#FFE066` survives ass → libx264 → yuv420p → decode as `#FEE066`. What differed
was the *backdrop*: the preview's blur region carried `bg-panel/35` (plus
`shadow-lg`), so the area behind the caption was darkened in the preview and
merely blurred in the export. Yellow on a dark wash reads bright; the same
yellow on a blurred near-white scene reads olive.

**Decision:** the blur region draws blur only. The tint and drop shadow are
removed; the accent border and the grip icon stay, as editor chrome that is
obviously not part of the picture.

**Decision:** the blur radius is converted instead of copied. `boxblur` is
specified in OUTPUT pixels (1280/720 wide) while the preview frame is drawn a
few hundred CSS pixels wide, so `backdrop-blur-md` was blurring far harder than
the render. `MOVIE_RECAP_BLUR` (radius 12, 2 passes) is now the single source
for both, and `movieRecapBlurCssPx` maps it to a CSS gaussian: N box passes of
radius r ≈ sigma `sqrt(N * ((2r+1)^2 - 1) / 12)`, scaled by the measured frame
width over the output width. `TARGET_DIMENSIONS` moved to
`lib/constants/movie-recap.ts` so the client can do that scaling.

**Consequence:** the blur region is fainter on busy footage than the old tinted
box. That is the point — it now shows what the export will contain. Do not
re-add a wash to make it easier to see; use the border/grip instead.

## 2026-09-16 — "Yellow" is the reference lime yellow, not gold (superseded)

The Yellow swatch is `#D9E824`, sampled (median of the glyph core) from the
reference caption the product is matching, replacing `#FFE066`. Projects on the
old hex were moved in the same migration so their picker still shows a
selection; a project that had deliberately picked gold has no way to get it
back from the swatch list, which is accepted — the list is three fixed choices,
not a colour picker.

## 2026-09-16 — Subtitle pill padding is even, and defined once (superseded)

**Problem:** the pill looked tight at the sides and loose above/below, and the
two layers disagreed. The preview used `px-[1.2em] py-[0.35em] leading-snug`;
the ASS box used `Outline = 0.35em` on *both* axes. Measured on a burn at a
48.6px CSS size: sides 20px, top/bottom 35px — because libass sizes the box
from the font's LINE box (Noto Sans Myanmar reserves 2.184em for stacked
Burmese marks) while the glyph ink is much shorter, so an equal pad never looks
equal.

**Decision:** `MOVIE_RECAP_SUBTITLE_PILL` in `lib/constants/movie-recap.ts` is
the only definition — `padEm: 0.35`, `sideSpaceEm: 0.257`, `lineEm: 2.184`.

- Render: the **box layer** (not the glyph layer) carries one hard space `\h`
  per side on every `\N` line. libass grows the background to fit it while the
  glyphs, drawn from the untouched text, stay centred. Measured result: sides
  31/34px vs top/bottom 34/36px — even.
- Preview: explicit `lineHeight: 2.184` (so the CSS line box equals the ASS
  one — half-leading becomes zero and the ink centres the same way) and
  `padding: 0.35em 0.607em`, where 0.607 = `padEm + sideSpaceEm`. Tailwind's
  `leading-snug` is gone precisely because it made the CSS box shorter than the
  rendered one.

**Rejected: widening the sides with a larger `Outline`.** ASS has one padding
value for both axes, so it would have made the vertical gap grow too. Rejected:
drawing the box with ffmpeg `drawbox` — the server does not know the shaped
text width, only libass does.

**Consequence:** `sideSpaceEm` is the width of a space in Noto Sans Myanmar. If
`MOVIE_RECAP_SUBTITLE_FONT` is ever changed, re-measure it (and `lineEm`, which
is the same ratio as `ASS_FONT_SIZE_RATIO`) or the preview's side padding will
drift from the render's.

## 2026-09-16 — The pill is a plain square box (feather tried, then removed) (superseded)

**Reported as "the border around is not soft."** The preview drew the pill with
`rounded-lg`; the export draws it with ASS `BorderStyle 3`, which is a hard
rectangle — libass has no corner radius. So the render could never match, and
the CSS radius was previewing something unreachable.

**Rejected: rounding the box in the export.** A rounded rect would have to be an
ASS drawing sized to the shaped text, and only libass knows that width — the
render pipeline cannot measure Burmese shaping itself. Also rejected: dropping
the softness and keeping a crisp rectangle in both (offered, not chosen).

**Also rejected, after trying it: feathering the pill.** `{\blur N}` on the ASS
box layer (with a matching `filter: blur()` on a preview layer) does soften the
edges, and it was built and then removed — the blurred background reads as a
smear behind the caption, and the video already has a *separate* blur feature,
so a second, unrelated blur on the subtitle is confusing.

**Decision:** the pill is a plain hard-edged rectangle in both layers. The
preview has no `rounded-lg`, no feather layer — just `backgroundColor` on the
same padded box libass draws.

**Consequence:** do not re-add a CSS radius or blur to the pill "to make it look
nicer". Both were tried; both only exist in the preview.

## 2026-09-16 — Output stays 1280×720 for now

Caption edges looking stepped was traced to playback, not the pipeline: the ASS
box rasterizes on exact integer rows (measured: single-row transition, no
anti-aliased band) and survives the libx264/yuv420p encode within ~3/255, so
sub-pixel rounding, a canvas/scale mismatch and chroma subsampling are all ruled
out as causes here. What remains is that `TARGET_DIMENSIONS` is 1280×720, so any
player on a large screen upscales an already-rasterized box.

Raising it to 1920×1080 was offered and **deliberately deferred** — longer
renders and bigger files, for a problem that only shows on big screens. Treat
the 720p output as a known trade-off, not an oversight.

## 2026-09-16 — Real narration: Azure Speech, and audio now sizes the picture

Supersedes "Phase-two-a: real render pipeline, TTS synthesis stubbed to
console.log" — only its TTS-skipped part; everything else in that entry stands.

**Decision:** the render synthesizes narration for real, one call per beat,
through `lib/tts/` (see `history/voice-lab.md` for the provider contract). Movie
Recap's Settings tab offers the two Azure Burmese neural voices —
`my-MM-ThihaNeural` and `my-MM-NilarNeural` — and nothing else. The synthesized
track is muxed into the export.

**Why per-beat calls, not one call for the whole script:** every beat needs its
own measured duration to size its video segment. Synthesizing the script as one
clip would mean splitting it again on silence, which is guesswork, and a wrong
split desynchronizes everything after it.

**Why the Azure voices replaced `narrator`:** the self-hosted VoxCPM2 worker
runs on CPU at tens of seconds per clip (see `history/voice-lab.md`), which a
render with dozens of beats cannot wear. VoxCPM2 stays a provider and stays in
the lab, so the comparison that decides whether to move back to our own service
is still one edit away — flip `surfaces` on the voice.

**Measured audio now outranks the caption cap.** `timeCaptionChunks` caps a beat
at `MAX_SEGMENT_S` (3.5s). That was right against a character-count estimate, but
it would now cut real speech off mid-word, so a segment whose audio is longer
than the cap is stretched to the audio's length and its cues are stretched with
it. This is the "narration audio duration is authoritative" rule from the
phase-two design entry, finally with real audio behind it.
`estimateSpokenSeconds` is not dead code: it is what a mock render still uses.

**Decided against storing the audio.** Clips live in the render's temp workDir
and go away with it. A recap script is ~2-3k characters: on Azure's free (F0)
tier that is ~150-250 renders inside the 0.5M-characters-per-month allowance, and
on S0 it is about four cents a render at $15 per 1M characters. Caching it would
add columns, object keys, and cleanup for that. It is also usually the wrong thing to reuse — the narration
script is regenerated on every render, so cached audio would be stale more often
than it would be reused. Revisit if per-beat re-rendering is ever built.

**Mock renders stay silent**, and stay on the estimate. Being free of API spend
is the entire reason mock exists.

**429 is a normal event, not a failure.** F0 allows 20 synthesis requests per
60 seconds and the limit is not adjustable, while a render fires one request per
narration beat back to back — any recap of real length crosses it. The Azure
provider therefore retries a 429 up to five times, honoring `Retry-After` and
otherwise backing off linearly toward the length of that 60-second window. S0
raises the ceiling but does not remove the case: Azure also answers 429 while its
backend scales.

**Consequence:** a real render now fails outright when `TTS_AZURE_KEY` /
`TTS_AZURE_REGION` are missing, where before it produced a silent video. The
Azure voices ship with `previewUrl: null` — no sample clips have been recorded —
so the Settings tab shows no play button next to them. The migration
`20260916230000_movie_recap_azure_voices.sql` rewrites existing `narrator` rows
to `azure-thiha`; `resolveMovieRecapVoice()` also falls back at runtime, so a
row that escapes the migration renders in the default voice instead of failing.

## 2026-09-16 — Voice previews are synthesized on demand, not shipped as files (superseded same day)

**Decision:** every voice card in the Settings tab has a working play button.
A voice with a recorded clip (`previewUrl`) plays that file; the Azure voices
have none, so the first press calls `POST voices/preview`, which synthesizes
that voice's own `sampleText` and returns the WAV inline as base64.

**Why not commit two sample MP3s to `public/`:** the sample line and the voice
parameters live in the catalog, so a checked-in clip is a copy that silently goes
stale the moment either changes — and it would have to be regenerated by hand for
every voice added later. Synthesizing from the catalog means the preview is
always the voice as configured.

**Cached on both sides, because the bytes cannot differ.** The preview is one
fixed line in one fixed voice for every user, so the route holds a
module-level `voiceId -> base64` map and the client keeps the object URL for the
session. Without that, a user clicking play four times would spend four of the
free tier's twenty requests per minute on identical audio. The server map has a
fixed ceiling (one short clip per catalog voice) and lives for the process —
the same single-process assumption the render's cancel map already makes.

**Consequence:** the first press on a cold server waits on Azure — roughly a
second, shown as a spinner in the button, with every other card's button
disabled meanwhile so two synthesis requests can't race. A voice preview also
fails when Azure is unconfigured, where before the button simply wasn't there.
The client's object URLs are revoked on unmount.

## 2026-09-16 — Bug fixed: SSML namespace capitalisation, diagnosed the long way

**Bug:** every Azure request failed with `Azure Speech returned 400.` and no
detail. The envelope was built with
`xmlns="http://www.w3.org/2001/10/Synthesis"`; the namespace is lowercase
`synthesis`. One character.

**Why it cost so much to find:** Azure answers a malformed envelope with a 400,
an empty body, and no `x-requestid` — indistinguishable from a wrong voice name,
an unsupported output format, a bad key, or the wrong endpoint host. Ruling those
out took a voices/list call (both Burmese voices present in `westus3`), a token
exchange (auth was fine), three output formats (all fine), and finally bisecting
the SSML itself.

**Consequence:** `buildSsml` is exported and tested for exactly this
(`lib/tts/providers/azure.test.ts`), because the request body is the part of the
provider that fails without saying so. `Content-Type` also now carries
`charset=utf-8` — the narration is multi-byte Burmese.

**For the next 400:** do not start from the code. Send the smallest possible
English request with curl, confirm it returns 200, then add back one piece of
the real request at a time. The failure gives nothing to read, so bisection is
the only tool.

## 2026-09-16 — Voice previews are static files after all (supersedes)

Supersedes "Voice previews are synthesized on demand, not shipped as files".

**Decision:** each Azure voice's `previewUrl` points at a committed MP3 under
`public/movie-recap/voices/<voice-id>.mp3`. The play button plays a file and
never calls Azure. `scripts/generate-voice-previews.ts` writes those files from
the catalog:

```
node --experimental-strip-types --env-file=.env scripts/generate-voice-previews.ts
```

**Why the reversal:** the on-demand version was already cached on both sides, so
the spend was ~124 characters per server process — but `next dev` resets module
state, the cost is not bounded by anything the code controls, and pressing play
could fail (Azure down, quota gone, key missing) for audio that never changes.
A file cannot fail. The earlier entry's objection — that a committed clip goes
stale when `sampleText` or the voice params change — is answered by generating it
from the catalog rather than by hand.

**Why a script and not two curl commands in the README:** the script reads
`VOICES`, so adding an Azure voice means running one command, not writing a new
curl line with the right namespace in it.

**Consequence:** changing a voice's `sampleText` or `params` without rerunning
the script leaves the button playing the old reading, with nothing to flag it.
`POST voices/preview` stays for voices with no file (the self-hosted ones), and
the wizard still falls back to it. `buildSsml` moved to `lib/tts/ssml.ts` — a
module with no runtime imports, because `node --experimental-strip-types` cannot
resolve the extensionless imports the app uses; `allowImportingTsExtensions` in
`tsconfig.json` is what lets `scripts/` be typechecked alongside the app.

**MP3, not WAV:** these ship in the repo and are only played in a browser, so
size wins — 51KB and 59KB against ~200KB each as WAV.

## 2026-09-16 — The render player shows the file's own shape, and unmutes

**Decision:** `MovieRecapRenderPlayer` no longer sets its box from
`project.aspectRatio`. It sizes to the video, capped at the panel width and
70vh. It also dropped `muted`.

**Why:** this player's job is to show what came out of the render. Sizing the box
from the *configuration* means a render whose shape disagrees with it — a stale
output from before an aspect-ratio change, or any future pipeline bug — gets
silently letterboxed into looking correct. The file's own shape is the thing
worth seeing here. `muted` dated from the phase where the export had no audio
track at all; it now carries narration, which is the part most worth checking.

**Consequence:** the player's width now varies with the video rather than being
a fixed column. The step-3 customize preview still uses the configured ratio —
that one IS about the configuration.

## 2026-09-16 — Subtitle look is a preset; size follows the aspect ratio (supersedes)

Supersedes, in whole or in part, every subtitle-styling entry above: the shared
font/default-size entry, the three-way weight, "Bold and shadow are switches with
no knobs", the yellow/white colour list, and both pill entries. Their *findings*
still hold — the 2.184 libass/CSS ratio, the Noto Sans Myanmar requirement, the
`cqh` trap — only the controls are gone.

**Decision:** the Subtitle tab offers two presets and nothing else about the look.

- `yellow` — `#D9E824` text, black outline, bold, `outlineEm` 0.14
- `mono` — `#000000` text, white outline, SemiBold (600), `outlineEm` 0.14

Both are bold, both draw a hard black OUTLINE at `OUTLINE_EM` (0.08 of the font
size), neither has a background box or a drop shadow. Size is not chosen at all: `MOVIE_RECAP_SUBTITLE_SIZE_PCT` gives
10% of frame height for 16:9 and 4% for 9:16. Position and edge distance remain
editable — they depend on the footage, not on taste.

**Why:** a caption has one job, staying readable over moving video, and the
settings that achieve it are few and known. A colour list, a size slider, an
opacity slider and two switches can be arranged into output that fails that job,
and every one of them had to be kept in sync between the CSS preview and the ASS
export — which is what the superseded entries above are mostly about.

**Why size is per aspect ratio and not one number:** the percentage is of frame
HEIGHT. 10% of a 720-tall landscape frame is 72px on a 1280-wide picture; 10% of
a 1280-tall portrait frame is 128px on one only 720 wide — more than twice the
relative size. The two values put the caption at a comparable fraction of the
picture's width in both.

**What the code lost:** the ASS output is one style and one layer per cue. The
two-layer box/glyph split, the hard-space side padding, and
`MOVIE_RECAP_SUBTITLE_PILL` existed only to draw the background pill and are
gone with it. `movieRecapSubtitleStyle()` in `lib/constants/movie-recap.ts` is now
the single place the preview and the render agree on a caption's appearance.

**Migration `20260916240000_movie_recap_subtitle_presets.sql`:** existing rows
map to the preset matching their old `subtitle_color` (white → `white`,
anything else → `yellow`). A hand-set size, a background pill, and the bold and
shadow switches have no preset equivalent and are dropped with their columns —
a project that had turned the shadow off or the pill on will render differently
after this. That is the intended consequence, not a bug.

## 2026-09-16 — Outline, not drop shadow, and no second copy behind the glyph

**Decision:** the preset draws a black outline around every glyph (ASS `Outline`
= 0.08 × the CSS-equivalent font size; `-webkit-text-stroke` with
`paint-order: stroke fill` in the preview) and `Shadow` is 0.

**Why outline:** an offset shadow darkens one side of a glyph only, so a white
caption still dissolves where the frame behind it is pale on the other three.
An outline is the one treatment that survives a pale frame, a dark frame, and
the boundary between them — which is what the reference caption being matched
uses.

**Why no shadow alongside it:** both were burned together and looked at first.
The offset copy reads as a grey ghost trailing every glyph and makes the outline
itself look doubled. The reference has no such ghost.

**Why `paint-order: stroke fill` in CSS:** `-webkit-text-stroke` alone centres
the stroke on the glyph contour, so half of it eats into the letterform and the
preview reads thinner than the export — libass expands the contour outwards.
Painting the stroke behind the fill reproduces that.

**How this was checked:** the ASS style was rendered to a single frame over a
flat grey with `ffmpeg -f lavfi -i color=... -vf ass=...` and the caption area
cropped out, at shadow 3px, 2px and 0. That is the way to judge a subtitle
change — the CSS preview is an approximation of libass, not the other way round.

## 2026-09-16 — The second preset is black-on-white-outline, and outline colour belongs to the preset (colours re-inverted; the outlineColour part stands)

**Decision:** the second preset is `black` — black fill, white outline — not
`white` with a black outline. `outlineColor` moved out of the module-level
constants and onto each preset entry.

**Why:** the reference caption for it inverts the first preset rather than
recolouring it. A single shared outline colour could express one of the two but
not both, so it was never a property of "captions in general" — it is a property
of a look.

**Consequence:** migration `20260916250000_movie_recap_subtitle_black_preset.sql`
renames the stored value `white` → `black` and moves the check constraint with
it. The preset ids are the DB values, so a look cannot be renamed in code alone.

Verified the same way as the outline itself: burned over flat grey with libass
and compared against the reference before pushing.

## 2026-09-16 — Weight and outline thickness are per preset, measured off the reference (weight corrected below)

**Decision:** `bold` and `outlineEm` moved onto the preset entries. `yellow`
stays bold with a 0.08em outline; `black` is REGULAR weight with a 0.111em
outline.

**Why:** the two reference frames are not the same look at two colours. The
black one's stems measure ~6.5% of the caption's ink height — lighter than this
font at 700, which is what the export was drawing — and its white outline is
proportionally much thicker. Stacked against the reference, bold read visibly
heavier while regular+thicker-outline matched. The outline carries the weight in
that look, not the letterform.

**How it was measured, and the limit of it:** the reference is a 396px-wide,
heavily compressed crop, so per-pixel run statistics on it are dominated by
antialiasing — a first pass "measured" a 2px stroke that visibly is not 2px.
What worked: render candidates through libass at 1280×720, crop each to its ink
bounding box, scale every crop to the reference's width, and stack them with
`vstack` for a like-for-like look. Trust the stack, not the pixel counter, and
never trust either against an uncompressed source.

**Consequence:** a preset now owns colour, outline colour, outline thickness and
weight — everything about how a caption looks. Nothing about the look is shared
between presets any more except the size rule and the absence of a background
box.

## 2026-09-16 — The reference face is Noto Sans Myanmar Medium, and libass needs a family name to get it

**Weight since raised to 600 by request — see the note at the end of this entry.**

**Finding:** the reference caption is the SAME family the app already uses.
Rendering the identical line in Noto Sans Myanmar, Pyidaungsu, Padauk and Myanmar
Sangam MN and zooming on `ပေါ်က` settles it — the other three differ in shape,
Noto matches exactly. What differed was WEIGHT: at 400 / 500 / 600 / 700, the
reference sits on 500. The `black` preset therefore carries `weight: 500`, not
regular as the entry above concluded from a small-scale comparison.

**Why this needed a code change and not just a number:** ASS has one weight
control, a Bold flag, so any weight between regular and bold can only be selected
by naming the family fontconfig maps to that cut. `MOVIE_RECAP_SUBTITLE_FONT_MEDIUM`
(default `Noto Sans Myanmar Med`, which is what `fc-match` resolves on macOS)
names it; `subtitleFace()` picks between that and the Bold flag from the preset's
weight. The CSS preview loads 500 from `next/font` alongside 400/700.

**Trap that cost a pass:** `fc-match "Noto Sans Myanmar SemiBold"` returns
**Verdana** — fontconfig's family names for the cuts are the abbreviated
`Noto Sans Myanmar Med` / `SemBd` forms. Naming a weight the obvious way silently
renders a fallback face that still shows Burmese (libass falls back per glyph),
so the render looks plausible and is not the font asked for. Always confirm a
family name with `fc-match` before putting it in a style.

**Consequence:** a render host without the named cut falls back to Regular —
lighter than the preview, not broken. `fc-match "Noto Sans Myanmar Med"` /
`"... SemBd"` on the render host is the check;
`MOVIE_RECAP_SUBTITLE_FONT_MEDIUM` and `MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD` are
the overrides.

**Raised to 600 (2026-09-16, by request).** The measurement above still stands —
the still crop measures closest to 500 — but the preset ships SemiBold: the
caption plays over moving footage, not a frozen frame, and the extra weight holds
up there. 700 remains too heavy against the reference. `subtitleFace()` picks the
SemBd family for 600 the same way it picks Med for 500.

## 2026-09-16 — Second preset back to white-on-black-outline

**Decision:** the second preset is `white` again — white fill, black outline —
reverting the colour inversion recorded above. Migration
`20260916260000_movie_recap_subtitle_white_preset.sql` renames the stored value
`black` → `white`.

**What survives from the inverted pass:** everything except the two colours. The
outline colour still belongs to the preset rather than being one shared constant,
and the weight (SemiBold 600) and outline thickness (0.111em) were both measured
during it and are unchanged — they were derived from the reference's proportions,
which an inversion does not alter.

**Note for whoever reads this next:** this look flipped twice while the reference
was being pinned down (white-on-black → black-on-white → white-on-black). Each
flip cost a migration because the preset id is the stored value and is kept honest
about what it draws. If a third reference frame appears, compare it against a
burned frame BEFORE changing the catalog — the comparison method is in the entry
above, and it is cheap.

## 2026-09-16 — 16:9 caption size set from a reference frame: 10% -> 6.5%

**Decision:** `MOVIE_RECAP_SUBTITLE_SIZE_PCT["16:9"]` is 6.5, down from 10.

**How it was derived:** the reference frame supplied for it is PORTRAIT
(828x1434). Its Burmese caption measures 51px of ink height, and this font's ink
runs about 1.68x the font size once marks stack above and below, so the font size
is ~30px — 3.6% of that frame's width. Size is held to a fraction of WIDTH across
ratios (a caption's readable length tracks the picture's width, not its height),
so a 1280-wide frame wants ~47px, and `SIZE_PCT` is a percentage of height:
47/720 = 6.5%.

**`9:16` followed, 4% -> 2% -> 2.5%**, once a screenshot of a portrait render
confirmed the captions were oversized there too. The strict width match put it at
2.0% and that read undersized, so portrait ships at 2.5% (4.4% of width against
landscape's 3.6%).

**Consequence:** captions are smaller than they were in both ratios, and the two
are deliberately NOT at the same fraction of width — a portrait frame is watched
at phone size, where the strict match is too small. The width rule is the starting
point for a new aspect ratio, not the final answer; burn a frame and look.

## 2026-09-16 — The yellow preset's outline was half the reference's: 0.08 -> 0.14

**Finding:** compared against a TikTok recap caption, the difference was neither
the family nor the weight — both already matched (Noto Sans Myanmar, bold). It
was outline thickness:

| | outline | stem | outline/stem |
| --- | --- | --- | --- |
| reference | 4px | 5px | 0.80 |
| ours at 0.08em | 1-2px | 4px | 0.25-0.50 |

`outlineEm` for `yellow` is now 0.14, which puts the outline at roughly the width
of the stems it surrounds — what the reference does.

**Worth remembering:** "the font looks different" was reported, and the font was
identical. Outline weight changes the apparent typeface enough to read as a
different face at caption size. Measure outline-to-stem before reaching for a
font substitution.

**`white` followed to 0.14** by request, so both presets now wear the same
outline weight and differ only in colour and one step of font weight (700 vs
600). Its earlier 0.111 came from its own reference frame; that measurement is
superseded by the preference for the heavier treatment on both.

## 2026-09-16 — The second preset's id is colour-neutral: `mono`

**Decision:** the second preset is black text with a white outline again, and its
id is now `mono` rather than naming either colour.

**Why the rename:** this look inverted three times in one session while its
reference was being settled (white-on-black -> black-on-white -> white-on-black
-> black-on-white). The id is the stored value, so each flip cost a migration
purely to keep the name honest. `mono` describes the pairing rather than which
half is which, so the next inversion is a code change and nothing else.

**Migration `20260916270000_movie_recap_subtitle_mono_preset.sql`** maps both
previous values (`white`, `black`) to `mono` and narrows the check constraint to
`('yellow', 'mono')`.

**Rule this leaves behind:** a preset id names the ROLE of a look, not its
colours. `yellow` is a borderline case kept as-is because that colour is the
point of it — it is the reference caption's signature — but a new preset should
be named for what it is for.

## 2026-09-16 — A narration beat cuts between several shots

**Problem:** the pacing dragged. Every narration line held ONE clip for its whole
length, so a 5-second line meant a 5-second static shot. Real recaps cut every
second or two underneath a continuous line.

**Decision:** a beat is now a group of scenes, not one scene.
`generateMovieRecapNarration` returns `{ sceneIndexes: number[], text }` and the
prompt asks for 2-4 scenes per beat that belong together, in order. The render
cuts between them while the beat's single line of speech plays over the top.

**Why the model groups them rather than the render:** grouping is an editorial
judgement — which shots belong to the same moment — and the model is the only
part of the pipeline that knows the plot. A render-side rule would cut wherever
the clock said, including across an unrelated scene. (The alternative was
offered and rejected for that reason.)

**`planBeatShots()` decides how many of a beat's scenes it can afford**: roughly
one cut per `SHOT_TARGET_S` (1.5s), floored at `MIN_SHOT_S` (1s). Scenes the line
is too short to pay for are dropped rather than squeezed — the model picks scenes
before anything knows how long the synthesized line will run, so over-supply is
normal and has to be absorbed somewhere. It is exported and unit-tested because
the arithmetic decides every cut in the video.

**`ceil`, not `round`, on the shot count.** A test written first with `round`
caught it: at 2s of speech, rounding gives ONE 2s hold, which is precisely the
dragging pace this change exists to remove. Ceiling gives two 1s cuts, and the
`MIN_SHOT_S` floor stops that bias from producing flicker.

**Timeline consequence:** `beatDurations` (one entry per beat) is now separate
from the clip list (one entry per shot). The narration track pads each line out
to its BEAT's length — the sum of its shots — so speech starts with a beat's
first shot and keeps playing across its cuts. Confusing the two arrays would
desynchronize audio from picture for the rest of the video.

**Also changed:** a mock render now builds two shots per canned line, so mock
exercises the cutting path instead of only the single-shot case. Scene reuse is
rejected at map time — first use wins — because the same footage under two
different lines reads as a bug even when the model does it deliberately.

**Not verified end to end yet:** no real render has run through this.

## 2026-09-16 — Second pacing pass: a hold cap, and unused scenes get borrowed

Review of a rendered 37s recap: median shot ~1.4s, which matched the target, but
three things stood out. Two were real.

**Real: 3-4s holds remained.** `slotS = targetS / shotCount`, so a beat the model
gave one or two scenes, carrying a 4-7s line, sat on a frame. Fixed with
`MAX_SHOT_S` (2.4s) and a borrowing pass: before planning, a beat pulls unused
scenes — the ones the model passed over — until it has enough to cut without
exceeding the cap, taking whichever are nearest in time so borrowed footage still
belongs to that stretch of the film. Shots are re-sorted chronologically
afterwards. If the pool is empty the hold stands: repeating footage inside one
beat looks worse than a long shot.

**Real: beats could group near-identical angles.** Nothing in the prompt said the
scenes in a beat should look DIFFERENT from each other, so two shots of the same
person at almost the same framing were a legal grouping. The prompt now asks for
a new subject, place, or clearly different framing within a beat.

**Not real: "some cuts are 0.4-0.7s, raise the minimum to 0.8s."** `planBeatShots`
cannot emit a shot under `MIN_SHOT_S` — `affordable = floor(targetS / MIN_SHOT_S)`
caps the count, and `targetS` is itself floored at 1s by the cue timing. Any
sub-second cut in the output is a cut INSIDE the source footage that scene
detection missed, so one of our ~1.4s clips contains an original edit. Measuring
the output counts those as ours. Raising the floor would not touch them and would
only license genuinely faster cuts. Left at 1.0s.

`SHOT_TARGET_S` moved 1.5 -> 1.4. Tests cover the hold cap, the floor, and the
single-scene fallback.

## 2026-09-16 — Azure's own silence was pacing the video

**Bug:** a rendered recap had ~0.95s of dead air after every narration line —
19.7% of a 23.65s video. It was not padding added by the render.

**Cause:** Azure returns each clip with silence baked in. Measured on one
4.85s clip: 0.18s before the speech, 0.81s after it. `durationSeconds` is the
file's duration, that duration sizes the beat, and the picture therefore holds
through silence the render never chose to add.

**Fix:** `trimToSpeech()` cuts each clip back to its speech (silencedetect,
-40dB, with a 60ms margin either side so a soft syllable cannot be clipped) and
the trimmed length is what sizes the beat. One deliberate `BEAT_GAP_S` (0.15s)
is then added between beats, and none after the last — a recap should not end on
dead air. The gap is now uniform and chosen, rather than whatever the TTS felt
like appending.

**Trap, caught by dry-running the parser against a real clip:** silencedetect
closes the FINAL silence run at EOF rather than leaving it open, so testing for
"a start with no matching end" finds nothing and the tail survives. The first
version of this saved 0.12s instead of 0.86s. The test is whether the last run's
END lands on the end of the file.

**Also:** the narration prompt capped lines at 60 characters and the model was
writing 63-70. 60 characters is about four seconds of speech — a whole beat on
one thought. The cap is now 50 with the reason stated.

**Not fixed here:** the delivery rate itself is Azure's default. Measured 16.5
Burmese characters per second across five beats. `rate` is already plumbed
through `AzureVoiceParams` if that needs to move.

## 2026-09-16 — Bug fixed: Contain was never saved

**Bug:** picking "Contain" in the customize step did nothing — the render still
cropped, and reopening the project showed "Cover" selected again.

**Cause:** `fitMode` was missing from the step-3 save payload in
`MovieRecapWizard`. The picker wrote it to local state, the PATCH route accepted
it, and the render honoured it (`scaleFilter`), so every part of the chain worked
except the one that put it on the wire. Nothing failed or logged; the value was
simply dropped between the click and the request.

**Worth noting for the next field:** that payload is a hand-written list of keys.
Every control added to step 3 has to be added to it by hand, and forgetting costs
a setting that appears to work in the UI and silently reverts. Check it whenever
a control is added, and be suspicious of "the UI shows my choice but the output
ignores it" — that is this shape of bug.

## 2026-09-16 — 16:9 caption size down again: 6.5% -> 3.4%

Landscape captions read large at 6.5% (47px), 4.8% (35px) and 4% (29px). Settled
at 3.4% — 24px, or 2% of the frame's width.

**This is below the comfortable floor for Burmese at 720p** and is a deliberate
call, not an oversight: at 24px the marks stacked above and below a letter start
closing into it, and the 0.14em outline (~3px here) does most of the work
separating the caption from the picture. The fix for wanting it smaller again is
not a smaller number — it is raising `TARGET_DIMENSIONS` to 1920x1080 so the same
relative size has more pixels to draw with (deferred; see "Output stays 1280x720
for now"). Portrait was checked at the same time and left at 2.5% — it
reads correctly in a real render.

The two ratios are now far apart as a fraction of width (2% landscape, 4.4%
portrait), which is right rather than sloppy: a portrait video is watched at arm's
length on a phone and a landscape one is not. The width rule stays as the starting
point for a NEW aspect ratio; for these two, the burned frame decided.

**Two process failures happened here, both worth avoiding.** The first attempt at
this change used a string replace whose anchor did not match, with no assertion,
so it reported success and changed nothing — twice in a row. Any scripted edit to
a constant needs an assert on the anchor and a read-back of the result.

The second: the no-op was "confirmed applied" by measuring a screenshot and
comparing against an ink-height estimate of 1.68x the font size. That ratio came
from a different sample string; this one runs about 1.46x, because how far Burmese
ink exceeds the font size depends entirely on which marks stack in that particular
line. Ink height is not a reliable way to infer font size across strings — read
the constant, or measure the same string both times.

## 2026-09-16 — Copyright-free is a per-project toggle again (supersedes)

Supersedes "Copyright-free transformation is mandatory, not optional", which
removed this toggle and dropped its column. Reinstating it was flagged as
contradicting that entry and approved before any code was written.

**Decision:** `copyright_free` is back as a boolean on the project row, editable
from a switch in the Customize Video tab's aspect section, defaulting to TRUE —
unlike the original column's `false`, because every existing project was created
under the "always transform" rule and true is what they were promised.

**What it does NOT do yet:** nothing branches on it. The render logs the value and
carries on. There is no distinct copyright-free step to skip, because the transform
was never built as its own stage — what the export does today is trim each scene to
a slot much shorter than itself, which breaks source continuity as a side effect of
pacing rather than as a rule. A separate finding, recorded here for whoever builds
it: **nothing tracks contiguous source footage**, so consecutive adjacent scenes
played near their own length would reproduce the original continuously, and a
`MAX_CONTINUOUS_SOURCE_S` guard does not exist.

**The old entry's objection still stands and is now a live risk:** a column that
nothing reads is dead weight, and that is exactly what this is until the transform
is defined. It is intentional and short-lived — the behaviour is being specified
next — but if that specification does not arrive, this should come back out rather
than sit as a switch that changes nothing.

## 2026-09-16 — The copyright-free transform, and where it lives

**Decision:** the transform is a filter chain built per shot in
`lib/movie-recap-transform.ts`, gated entirely on `project.copyrightFree`. With
the toggle off, the output is byte-for-byte what it was before this existed.

Four steps, all mild on purpose — the aim is that the export is not a
frame-for-frame copy, not that it looks processed:

| Step | What | Scope |
| --- | --- | --- |
| zoom | centre crop by `copyrightZoom`, seeded from the fit mode | both ratios |
| framing | blurred copy of the clip behind the letterbox bars | `contain` only |
| mirror | `hflip` | 16:9 only |
| colour | `eq` contrast 1.06, saturation 1.08, gamma 0.98 | both ratios |

**Why a separate module rather than growing `scaleFilter`:** the render decides
WHICH source plays and for HOW LONG; the transform decides what it looks like.
Splitting them means a new visual step is one entry in one file, and the builder
is a pure string function, so it is tested without ffmpeg.

**The boundary that matters:** `ShotFilterContext` deliberately excludes the
shot's timing. Any transform that changes a shot's DURATION — a forced speed
change, a freeze cadence, a source-continuity limit — cannot live here, because
the planner has to know about it to keep the picture aligned with the narration.
That is the line to check before adding the next one.

**Blurred backfill is gated on the toggle too,** at the user's instruction. The
argument for leaving it always-on for `contain` (black bars just look worse) was
raised and set aside: with the toggle off, `contain` letterboxes in black exactly
as it did before.

**Zoom was 1.08 first and read as no change at all** — on `cover` the framing
barely moves, because cover already crops to fill. 1.2 keeps the middle ~83% of
the frame. Much past that softens visibly at 720p, since a smaller kept region is
stretched further to reach full width.

**Two consequences worth stating:** mirroring reverses any text in frame — signs,
phone screens, burned-in captions from a source that already had them. And the
backfill encodes two scaled copies per shot, so `contain` renders cost roughly
1.3-1.6x the ffmpeg time of `cover` ones.

Verified by running both chains — cover and contain, with `setpts` appended as
the render appends it — through ffmpeg against a real file.

## 2026-09-16 — Zoom is a project value seeded from the fit mode, not a constant

**Decision:** `copyright_zoom` (real, 1-2, default 1) lives on the project row and
is set from a slider in the customize step. It is a DIVISOR on the source crop, so
**1 means no zoom** and higher is tighter; a project with the transform off carries
1, and the render skips the crop entirely at that value.

**Seeding:** turning the transform on, or changing the fit mode while it is on,
sets the recommended value — `contain` 1.56, `cover` 1.5. Turning it off returns
to 1.

**Why seeding is tied to fit mode and nothing else:** the recommendation depends
on the fit mode, so a fit-mode change is the one edit that should overwrite a
hand-set zoom. Everything else leaves it alone. The slider labels itself
"recommended" only while it matches, so a hand-set value is visibly not the
default.

**Range stops at 2.** Past that the kept region is under half the frame, and
upscaling it to 1280 wide is visibly soft.

**Reminder that keeps being needed:** a centre crop preserves the source's aspect
ratio, so zoom does not shrink the letterbox bars on `contain`. It tightens the
subject inside them. Wanting the bars gone means `cover`, or a crop that changes
aspect — which this is not.

**The temporary preview-only slider added an hour earlier is gone**, replaced by
this one. The preview still shows zoom, mirror and colour as CSS, which is an
approximation: ffmpeg crops then upscales from source pixels, the browser scales
what it already drew, so the export is sharper than the preview at the same
number.

## 2026-09-16 — Zoom "unset" is null, and step payloads are field lists

**Bug:** a project arriving with copyright-free already on showed zoom 1.00x and
stayed there until the fit mode was switched back and forth. Seeding only ran on
explicit actions — the toggle, or a fit-mode change — and every existing row had
`copyright_free = true` with `copyright_zoom = 1` from two separate column
defaults, so nothing ever fired.

**Cause, underneath:** `1` meant two things — "no zoom, deliberately" and "never
chosen". No amount of seeding logic fixes an ambiguous value.

**Fix:** `copyright_zoom` is nullable. NULL means unchosen: the UI shows the
recommendation for the fit mode and the render uses it, via
`effectiveMovieRecapZoom()`. Toggling the transform, and changing fit mode while
it is on, now write NULL rather than a number — so the value tracks the fit mode
until someone moves the slider, and stays put afterwards. 1.00x is a real choice
again. Existing rows were reset to NULL by the migration.

**Rejected:** seeding on page load when zoom equals 1. It makes a deliberate 1.00x
impossible to keep — every reload would overwrite it — and writes to the user's
data without them touching anything.

**Separately: the step save payloads are now field lists** (`STEP_2_FIELDS`,
`STEP_3_FIELDS`) with a `satisfies readonly PatchableField[]` check, instead of
hand-copied object literals. The literal is what silently dropped `fitMode`: the
control worked, the value never left the browser, nothing errored. A name that is
not a patchable field is now a compile error, and adding a control means adding
one word.

**React Hook Form was considered for this and set aside.** The defect was the
hand-maintained payload, which a five-line field list fixes. RHF earns its place
when there is client-side validation, dirty-field tracking or an unsaved-changes
guard to build — none of which exist here — and it fits this component badly
today, because the project object is replaced wholesale by every server response
(`setProject(result.data)`), which would mean `reset()` on each one.

## 2026-09-16 — The source's own dimensions choose the framing

**Decision:** the browser already reads the source's dimensions when it reads the
duration, so they are now stored (`source_width`, `source_height`, both nullable)
and used once, at upload, to seed `aspect_ratio` and `fit_mode`: portrait source
-> 9:16, landscape -> 16:9, and `cover` either way, since the orientations match
by construction.

**Why seed only at upload:** a new project has no configuration worth protecting,
and re-seeding later fights the user — the mistake the zoom default made an hour
earlier. Nothing re-runs it. Replacing the source creates the values again because
that is a new upload.

**Why `cover` and not `contain`:** cover fills the frame by cropping, which is
correct exactly when the output orientation matches the source's.

**No warning when they later disagree.** A banner for "portrait source, landscape
output" was built and then removed: the ratio and fit controls sit next to a live
preview, so a user who does not like the result changes it there. A warning about
something visible, next to the control that fixes it, is noise. The helper behind
it went with it rather than sitting unused.

**Known limitation, deliberately not solved here:** `videoWidth`/`videoHeight` in
the browser ignore rotation metadata. A phone video shot in portrait commonly
reports 1920x1080 with a 90-degree flag, and the browser does not expose the flag,
so the suggestion can be exactly wrong for that file. It is a default the user can
change, and the honest fix is an `ffprobe` pass server-side after upload, where
the rotation IS visible. Worth doing when phone footage becomes a real input.

**Columns are nullable** because rows created before this, and any file whose
metadata cannot be read, legitimately have no dimensions — `movieRecapOrientationMismatch()`
stays quiet rather than guessing for those.
