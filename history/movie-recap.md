# Movie Recap

Covers: `app/(app)/(movie-recap)/movie-recap/**`,
`app/api/(movie-recap)/movie-recaps/**`, `components/movie-recap/**`,
`lib/constants/movie-recap.ts`, `lib/movie-recap.ts`,
`lib/movie-recap-render.ts`, `lib/prompts/movie-recap-narration.ts`,
`lib/r2.ts`, `lib/spoosh.ts`, `lib/tts/**`, and the `movie_recap_projects`
migrations.

## 2026-09-14 — Phase one is a resumable configuration project, not a render job (SUPERSEDED 2026-09-18 — the Generate button is removed; phase two shipped)

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

## 2026-09-16 — Output stays 1280×720 for now (9:16 raised to 1080×1920 on 2026-09-18, below; 16:9 unchanged)

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
| zoom | magnify the FITTED picture by `copyrightZoom`, then clip to frame | both ratios |
| framing | blurred copy of the clip behind the letterbox bars | `contain` only |
| mirror | `hflip` | both ratios |
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

**Seeding:** turning the transform on, or changing the fit mode or aspect ratio
while it is on, sets the recommended value. It is keyed by fit mode AND aspect ratio, and only portrait
gets a real zoom: `9:16` is 1.56 contained and 1.05 covered, `16:9` is 1 in both.
Landscape cover already crops a landscape source to fill, and landscape contain
holds a portrait source in a narrow centre strip that zooming only eats into —
the bars stay the same width either way, because a centre crop preserves the
source's aspect ratio. Changing either driver returns the zoom to unset. Turning it off returns
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

## 2026-09-16 — Bug fixed: the preview grew the letterbox strip when zooming

**Bug:** with `contain` and a zoom set, the step-3 preview and the rendered output
disagreed — the render looked like no zoom had been applied, the preview like a
lot had. Reported the other way round ("preview zoomed, render did not"), which is
what made it worth measuring: on a 1722x720 source in a 9:16 frame, the preview's
strip measured 355px where 224px was correct, a factor of 1.58 against a zoom of
1.56.

**Cause:** the preview scaled the whole `<video>` element with CSS `transform`.
That enlarges the LETTERBOXED STRIP along with the picture. The render crops the
source before fitting it, and a centre crop preserves the source's aspect ratio,
so the strip's size never changes — only how much of the picture survives inside
it. The render was right.

**Fix at the time:** the preview drew a box at the SOURCE's aspect ratio, clipped
it, and scaled the video inside — what crop-then-fit looks like.

**Then reverted the same day**, because the RENDER changed instead: zoom now
magnifies the fitted picture (see the entry below), so a plain CSS transform on
the fitted video is the correct emulation again — the strip grows, the bars
shrink, the sides leave the frame. The source-aspect box held the bars still and
cropped all four sides, which was right for the old render and wrong for the new
one.

**The lesson worth keeping:** the preview emulates the render, so it has to be
re-derived every time the render's filter ORDER changes, not just its values. Two
renderers expressing one rule in different tools will drift silently otherwise —
and both times here, the drift looked like "zoom is broken" rather than "the
preview is stale".

**The general shape of this:** the preview is CSS and the render is ffmpeg, so
every visual rule has to be expressed twice, in tools that do not agree. When they
disagree, measure a burned frame against the preview rather than deciding from
memory which one looks right — the render is the output, so it wins by default,
but only measurement says which one moved.

## 2026-09-16 — Zoom magnifies the fitted picture, not the source (supersedes)

**Decision:** zoom is applied AFTER framing, not before. The earlier version
cropped the source and then fitted it, which is why a zoomed `contain` render
looked untouched: a centre crop preserves the source's aspect ratio, so the
letterbox bars stay exactly as wide however far you zoom — the picture just loses
its edges inside unchanged bars.

Scaling the fitted result instead makes the picture grow into the frame and the
bars shrink, which is what the preview already showed and what was wanted.
Measured on a 1722x720 source in a 720x1280 frame:

| zoom | picture inside the frame |
| --- | --- |
| 1.00 | 720x301 |
| 1.56 | 720x468 |
| 3.00 | 720x902 |

Width clamps at the frame (`crop=min(iw,W):min(ih,H)`), so a large enough zoom
becomes a full-bleed crop — the sensible end state rather than an error.

**Trap that nearly shipped:** those `min()` expressions contain commas, and
ffmpeg reads an unescaped comma in a filter chain as a filter separator — it
fails with `No such filter: '720):min(ih'`. The escape has to survive the
template literal, where `\,` COLLAPSES to a bare comma; it needs `\\,` in
source to emit `\,`. The first version emitted bare commas and would have broken
every render with the transform on. Caught by printing the generated string and
running it through ffmpeg, not by reading it.

**Worth repeating:** a string that is correct in the editor is not a filter that
runs. Print it, then run it.

## 2026-09-16 — Speed is an input, so no shot plays at the source's own speed

**Decision:** with the transform on, every shot plays at a speed drawn from
`MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` (0.94, 0.96, 1.05, 1.07) — never 1.0.

**The inversion that makes it cheap:** duration matching used to DERIVE the speed
from how long a shot had to last, which left most shots at the source's own speed
(the trim and freeze-pad branches both play at 1.0). Now the speed is chosen
first and the LENGTH OF SOURCE TAKEN absorbs it:

```
window = slot x speed      seconds of source taken
setpts = PTS/speed         played at that speed
output = window / speed = slot
```

The output is still exactly the slot, so the planner, `beatDurations` and the
narration track are all untouched. That is why this needed no timing work.

**Deterministic, not random.** `pickShotSpeed()` hashes the project id and the
shot's position, so a re-render of the same project produces the same file — the
same reason the voice profiles carry fixed seeds. Neighbouring shots land on
different speeds, and both directions appear, so a render never comes out
uniformly faster than its source.

**Trap, caught by measuring rather than reading:** `-ss`/`-t` after `-i` are
OUTPUT options, applied after the filter chain — so `setpts` has already re-timed
the stream and the window means something else. A 1.4s slot came out 1.30s at
0.94 and 1.47s at 1.07. The fix is input-side seeking (`-ss`/`-t` before `-i`),
plus a `tpad` hold and an output `-t` that cuts back to exactly the slot; that
also absorbs the frame of rounding a speed change leaves at 30fps. Verified at all
four speeds: 1.400 every time.

**Only the copyright-free path changed.** With the toggle off the original hybrid
— speed-ramp inside the band, else trim or freeze — is untouched.

**Side effect worth knowing:** this partly covers the unbuilt source-continuity
item. A run of adjacent scenes is no longer a faithful copy of the original once
each one plays at a different speed.

## 2026-09-17 — The thumbnail is grabbed from the SOURCE, and the button is a shuffle

**SUPERSEDED the same day — see "Hook titles replace the thumbnail" below. The
reasoning is kept because the mechanism is sound and will be the starting point
if cover art comes back alongside the frame-design work.**

**Decision:** the Review tab has a "Grab Thumbnail" button that pulls one frame
from the uploaded source video, runs it through the render's own filter chain,
and stores it on the project as `thumbnail_url` / `thumbnail_object_key` /
`thumbnail_at_seconds` / `thumbnail_attempt`. Pressing again grabs a different
frame. `POST movie-recaps/:id/thumbnail` takes no body.

**Why the source and not the render output:** cover art is wanted long before a
render exists, and a render costs minutes of local CPU plus Whisper and GPT
spend. The source is `ready` at the end of step one, so this button works from
then on. Taking the frame from the finished export was considered and rejected
for that reason alone — it would have been slightly more accurate (it would
carry burned subtitles) at the price of making a picture as expensive as a video.

**Why it still looks like the export:** the grabbed frame is passed through
`buildShotFilter(shotFilterContext(project))` — the same chain the render uses
per shot — so it comes out at the output aspect ratio with the copyright-free
zoom, blurred backfill, mirror and colour grade already applied. A thumbnail
showing the raw source would advertise a video that does not look like it. This
is the payoff for `lib/movie-recap-transform.ts` being a pure string builder with
no timing in it: a second consumer needed no changes to it.

**Why the source is not downloaded:** `-ss` placed BEFORE `-i` on an http(s)
input makes ffmpeg seek with HTTP range requests. Measured against a 149MB
source in R2: 1.7s wall clock, a few MB transferred, a 44KB JPEG out. The render
pipeline downloads the whole object because it reads all of it; this must not,
or the button inherits the render's cost profile.

**Why a shuffle rather than a fixed frame or a scrubber:** a fixed timestamp
picks a fade or an ident often enough to look broken, and a scrubber is a
control to build and explain before the user has seen a single frame. The button
re-presses instead. `thumbnailTimeFor()` steps by the golden-ratio conjugate, a
low-discrepancy sequence, so the FIRST FEW presses already sample the beginning,
middle and end — measured on a 131s source, presses one to four land at 65.7s,
20.5s, 93.6s and 48.4s. A linear step would have returned four near-identical
frames from the opening minutes. The first and last 5% are excluded, which is
where idents, fades from black and credits live.

**Why `thumbnail_attempt` is a position and not a success counter:** it is the
input to that sequence, so the stored value reproduces the frame on screen and
the next press is guaranteed to move somewhere else. A counter of successes
would repeat frames after any failed press.

**Consequences a future reader should not mistake for bugs:**
- The thumbnail does NOT carry subtitles or the logo. Those are applied by the
  render in a final pass over the whole video, not per shot, and are not part of
  `buildShotFilter`.
- The old R2 object is deleted only AFTER the new one uploads, so a failed press
  leaves the previous thumbnail intact. The key is a fresh uuid every time,
  which is also what stops the browser serving a cached previous frame.
- A press that cannot decode a frame returns 502 and changes nothing — including
  `thumbnail_attempt`, so the same bad position is retried rather than skipped.
  If that turns out to be annoying on damaged sources, advancing the attempt on
  failure is the fix.
- The columns are server-written and deliberately absent from
  `MovieRecapProjectPatch`.

## 2026-09-17 — Hook titles replace the thumbnail, generated at the end of a render (SUPERSEDED 2026-09-18 — hook titles removed entirely; the thumbnail removal stands)

**Decision:** the source-frame thumbnail is removed — code, route, UI and
columns — and replaced by generated Burmese hook titles. At the end of a
successful render the pipeline writes five title options to `hook_titles` from
the narration it just produced; the Review tab lists them and the user's pick is
stored in `hook_title`.

**Why it replaced rather than joined the thumbnail:** requested directly, one
day after the thumbnail shipped and before anyone had used it. The columns were
dropped rather than left in place precisely because nothing depended on them
yet; dead schema outlives the memory of why it is dead. The forward migration is
kept and a second migration drops the columns, because the first had already
been pushed — an applied migration is walked back, not deleted.

**Why the render writes them, not a button:** the input is the narration script,
which only exists once a render has run, and the render already has it in
memory. Generating at the end of the pipeline costs one small GPT call at a
moment the user is already waiting, instead of a press that would have to reload
the script to do the same thing.

**Why five options rather than one:** a hook is judged by comparison, and asking
for five costs the same single request as asking for one. The prompt explicitly
demands different ANGLES — a question, a stake, a twist, a character, a
consequence — because the observed failure mode is five rewordings of one
sentence, which defeats the point of returning several. It also forbids
revealing the ending, which the model otherwise does reliably; a title that
gives away the twist replaces the video instead of selling it.

**Why `hook_titles` and `hook_title` are separate columns:** the generated set is
server-written and replaced by each render, while the choice is the user's and
must survive a re-render that produces a different set. Collapsing them into an
index into the array would break the moment the array changed.

**Consequences a future reader should not mistake for bugs:**
- A failed title call leaves `hook_titles` UNTOUCHED rather than blanking it.
  Re-rendering is currently the only way to get titles, so a transient GPT
  failure must not destroy the set from the previous render. The render itself
  still succeeds — the video is the deliverable and it is already uploaded by
  this point.
- A cancel during the title call is re-thrown rather than swallowed, or
  "Cancel" would report a finished render.
- Choosing a title does NOT set `changesConfiguration` in the PATCH handler, so
  it cannot demote a `ready_for_generation` project back to `draft`. It does not
  change what the render would produce.
- A mock render writes `MOVIE_RECAP_MOCK_HOOK_TITLES` and spends nothing, the
  same contract as its canned narration.
- Length is clamped in code, not trusted from the model: a strict JSON schema
  guarantees an array of strings but not how many or how long. Measured output
  clusters at 44-52 Burmese characters against a stated 20-45 preference and a
  55 hard cap, so the cap is what actually holds the line.

## 2026-09-17 — Reverted: the +10% speech rate and the 30fps segment resample

**PARTLY UNDONE the same day — the 30fps resample was re-applied, see "Re-applied"
below. Only the +10% speech rate is still reverted.**

**Decision:** `c18d550` (Azure narration at `+10%`) and `cf79207` (resample every
segment to 30fps before concat) were both reverted at the user's request, as
`git revert`, so they remain in history and can be re-applied. The reason for the
revert was not stated; do not assume either change was found to be wrong.

**State after the revert:** narration speaks at Azure's default rate, the
committed voice previews are the default-rate files again, and segments are
concatenated at whatever frame rate `setpts` leaves them with.

**The measurements are kept here, because they cost real work and the second one
describes a bug that is now present again:**

- **Rate.** The same Burmese line measured 6.825s at Azure's default and 6.204s
  at `+10%` — a 9.1% cut, exactly `1/1.1`. Azure treats the percentage as a rate
  multiplier, not a duration one. Changing the rate requires re-running
  `scripts/generate-voice-previews.ts`; the previews are committed files.

- **Stutter — re-fixed, see below; this described the branch between the revert
  and the re-apply.** `setpts` re-times frames without
  resampling them, so a shot played at 0.94 carries about 40 frames across a
  1.4s slot where a full-rate shot carries 42 (an average 28.57fps against 30).
  `concat -c copy` cannot reconcile two frame rates, so those frames are held for
  two frame periods. Measured by dumping `frame=pts_time` from the concatenated
  file: four double-length gaps (0.0667s against 0.0333s), all inside the two
  slowed segments — two stutters per slowed shot, on roughly half the shots
  whenever `copyright_free` is on. Appending `fps=30` after `setpts`/`tpad` on
  every segment branch fixed it completely (42 frames at 30fps for all four
  speeds, one uniform gap). `cf79207` has the implementation.

- **Diagnostic note:** `r_frame_rate` reports 30 for every segment and hides this
  entirely. Only `avg_frame_rate` and the raw frame timestamps show it.

## 2026-09-17 — Transcription audio is compressed, because WAV capped the feature at 13 minutes

**Bug, found before it was hit:** the render extracted 16kHz mono PCM for
Whisper. That is 32,000 bytes a second against Whisper's 25MB upload limit, so
any source longer than **about 13.6 minutes** failed the transcribe step. Every
test source so far had been 60-131 seconds, which is the only reason it had not
surfaced — and the feature exists to recap feature-length films, which are 7-11x
over the limit.

**Fix:** extract Opus at 16kbps mono instead (`-c:a libopus -b:a 16k`). Measured
on the same 131s source: 4,204,190 bytes of WAV against 245,693 of Opus, which is
1,870 bytes a second and puts the ceiling near **3.9 hours**.

**Why Opus and not MP3 or AAC**, projected to a two-hour film from the same
measurement: Opus 12.8MB, MP3 13.8MB, AAC 21.2MB. AAC was rejected for leaving no
margin. All three were confirmed to be *accepted* by Whisper — that was tested,
not assumed, by transcribing each.

**Quality cost, measured rather than asserted:** the same clip transcribed as
WAV, Opus and MP3 returned the same dialogue apart from one proper noun
("Anderton's" became "Hannityd's" under Opus and "Anna and his" under MP3).
Segment counts differed (60/43/54), so cue granularity shifts slightly. Accepted
because the narration prompt summarizes rather than quotes, and because the
alternative is the feature not working on a real film.

**A size check runs before the upload** and throws a message naming the limit.
The ceiling is wide but not infinite, and Whisper's own error for an oversized
upload does not say what to do about it.

**Not done — chunking.** Splitting the audio and stitching segment timings would
remove the ceiling entirely rather than raising it. It was not needed once the
ceiling passed any plausible film length, and the size check makes the failure
legible if one ever exceeds it.

**Host requirement:** the ffmpeg build now needs libopus. Verified present in
both Homebrew's plain `ffmpeg` and `ffmpeg-full`, so this adds no setup step;
noted in the README beside the libass check.

## 2026-09-17 — The source's own subtitle track is used instead of Whisper, when it has one

**Decision:** before extracting audio, the render probes the source for a text
subtitle stream (`lib/movie-recap-captions.ts`). If it finds a usable one, it
converts it to SRT, parses it into the same `{start, end, text}` shape Whisper
returns, and skips transcription entirely. Otherwise nothing changes.

**Why:** when a source carries captions they beat transcription on every axis —
exact wording, exact timings, no API call, no upload limit, no minutes of
waiting. Nothing downstream can tell the difference, because `dialogueForScene`
only ever saw that shape.

**It is an optimisation, never a replacement.** Most sources have no subtitle
stream — a download or a cutter export usually strips it — so every path fails
soft and returns null rather than throwing. Verified both ways against real
files: a source with a muxed `mov_text` track returned 15 correctly timed cues
with markup stripped and the language detected, and the same source without one
returned null and transcribed as before.

**What is deliberately rejected, and why each would otherwise look like it
worked:**
- **Bitmap subtitles** (`dvd_subtitle`, `hdmv_pgs_subtitle`, `dvb_subtitle`) are
  pictures of words. ffmpeg cannot convert them to text; asking it to would
  produce an empty file rather than an error. Reading those needs OCR.
- **Forced tracks** translate isolated foreign lines, so they are not the film's
  dialogue. Used as if they were, they would hand the narration model a few
  percent of the runtime while appearing to have succeeded.
- **Burned-in subtitles** cannot be detected at all — they are pixels, not a
  stream.
- **Tracks that cover almost nothing.** A second net behind the forced check:
  under 10 cues or under 5% of the runtime falls back to transcription.

**Stream choice:** a stream marked `default` wins, then the first text stream —
the order a player would pick in. Language is logged but not filtered on, since
dialogue in any language is equally useful as context to the narration model.

**Cue text is stripped of styling** (`{\\an8}`, `<i>`, `<font>`) before it reaches
the model, and a cue's internal line breaks become spaces — those are
typesetting, not sentence structure. A cue whose timing will not parse is
dropped rather than guessed at: a wrong timestamp attaches dialogue to the wrong
scene, silently.

**Also in this change:** the Whisper path moved into `transcribeSource()` so the
pipeline reads as the single choice it now is — use the source's captions, or
listen to it.

**Consequence:** caption timings are the distributor's, not measured from the
audio, and some tracks run a little ahead or behind the speech. That is well
inside the tolerance here, since cues are only matched to scene ranges.

## 2026-09-17 — Re-applied: the 30fps segment resample, confirmed against a real export

**Decision:** `cf79207` is back (cherry-picked onto the caption work). The +10%
speech rate stays reverted; the two were reverted together but only this half was
wanted back.

**What settled it:** a rendered export from the app, measured rather than
watched. 1,987 frames over 33.9s with the gap histogram
`[(0.01667, 1936), (0.03333, 50)]` — **50 held frames**, every one exactly 2.0x a
frame period. That is the same defect the original entry describes, in real
output rather than a reconstruction.

**New information the export added:** the source was **60fps**, not 30. The
original diagnosis was made on a 30fps source, so this confirms the problem is
not tied to a particular source rate — any source whose frames do not survive
`setpts`/`tpad` at a constant rate produces it, and the output had inherited
59.98fps (`avg_frame_rate` 39740/679) where `r_frame_rate` claimed a flat 60.

**Also established, and worth not re-investigating:** everything else in that
export measured clean, so the stutter was the whole of the reported "glitching".
Narration silence was 2.33s of 33.95s (6.9%) in eight even 0.27s beat gaps;
median shot length 1.21s against 26 planned shots in 33.95s; subtitles, colour
grade, zoom and the region blur all correct.

**Method warning — scene detection on the OUTPUT is not a measurement.** At
`gt(scene,0.35)` it reported a 0.47s median shot and dozens of sub-0.1s "cuts",
which read as a second defect and is not one: sampling the frames around one
such "cut" showed a smooth continuous shot, the detector firing on fast motion.
At 0.6 it under-detects instead, missing real cuts between shots taken from
adjacent source. The trustworthy source of shot structure is the project's own
`render_script` column, which states the beats and their source spans outright.

**Consequence noticed while measuring, not a bug:** shots within a beat are cut
from ADJACENT source (beat 1 starts at 0s, 2.3s and 5.0s), so several cuts do not
read as cuts and the export shows 4-5s stretches that look continuous despite
three cuts. Each shot still takes only ~1.3s of continuous source, far inside the
5s ceiling, but the footage reads as less cut-up than the shot count implies.

## 2026-09-17 — REJECTED: shortening the narration lines in code

**Built, measured, and removed the same day at the user's direction: "prev beat
is more correct. we just only need to speed up the narrative speaking."** The
longer lines are the wanted content; the pace is a DELIVERY problem, not a script
problem. Do not rebuild this without asking.

The measurements below stand and are why the rate change exists, so they are kept
rather than deleted. The implementation is in git (a `shortenLongNarrationLines`
pass with two bounded rounds); it worked — 643 characters to 480, nine lines over
the cap down to two, speech 36.1s to 26.9s — it was simply not what was wanted,
because it bought that speed by throwing away narration.

## 2026-09-17 — (superseded) The narration length cap measurements

**Problem:** the finished recap still felt slow. Measured on a real ten-beat
export, the cause was the SCRIPT, not the delivery:

- Delivery was **17.83 characters a second** at Azure's default rate, against the
  16.5 recorded earlier as the baseline — if anything slightly fast, and that
  figure includes intra-line pauses, so the true articulation rate is higher.
- Line length was **49, 64, 58, 65, 65, 62, 68, 69, 72, 71** — mean 64.3 against
  a stated cap of 50. Nine of ten lines broke it.

Line length is what decides how long a beat stays on screen, so those lines were
the whole of the slowness: at 17.83 chars/sec, 64 characters is 3.6s against 2.8s
for 50.

**Why the prompt was not the fix:** it already said the right number. Asked for
60 the model wrote 63-70; the cap was lowered to 50 (2026-09-16) and it wrote
58-72. Two attempts at asking more firmly had already failed, so a third was not
tried.

**Decision:** `shortenLongNarrationLines()` runs after generation and sends back
only the lines that break the cap, asking for them shorter. The cap itself is one
exported constant the prompt interpolates and the check reads, so the two cannot
drift — which is how the cap quietly stopped meaning anything in the first place.

**Two rounds, because one is measurably not enough.** Measured on the real
script: one pass took nine over-long lines to five still over (643 to 536
characters); two passes reached **480 characters with only two lines over**, and
speech from **36.1s to 26.9s — a 25% cut**. It is bounded rather than looped to
convergence because the model plateaus, and spending calls to chase the last few
characters is worse than accepting a line that is close.

**For comparison:** the +10% Azure rate that was reverted was worth 9%. This is
worth 25%, and costs nothing in delivery quality. They compose if both are wanted.

**Guards, each protecting against a specific way the pass could make things
worse:**
- A rewrite is kept only if it is actually SHORTER. One that came back longer,
  empty, or unchanged is discarded — it has lost wording to no purpose.
- An index the model invented, or was never given, is ignored rather than
  clamped. Writing a shortened line onto the wrong beat would put narration over
  someone else's shots.
- A compliant script costs nothing: with no line over the cap, no call is made.
- The shorten prompt is told not to merge lines, drop them, or add information —
  a "shortened" line that loses the event its beat exists to narrate leaves those
  shots playing over something else.

**Unchanged and deliberately so:** the mock render still uses canned narration and
never calls this, so mock remains free.

## 2026-09-17 — Render progress is a stepper, and the failing stage is kept

**Decision:** the Review tab shows the render's progress as a seven-step bar
(`MovieRecapRenderProgress`) instead of one line of changing text. Steps fill
green as they complete, the running one spins, and a failed one turns red. The
detailed sub-label ("Describing scene 12/40") stays underneath, since the bar
shows WHERE the render is and the label shows how far through that step.

**Why the thirteen stages are grouped into seven steps** — both reasons would
otherwise put steps on screen that never happen:
- `reading_captions` and `extracting_audio`/`transcribing` are ALTERNATIVES, not
  a sequence: a source with subtitles never transcribes, one without never reads
  captions. As a single "Dialogue" step, either path fills it.
- Thirteen dots is a wall of text, not a progress bar.

`MOVIE_RECAP_RENDER_STEPS` is the single source of order, and a test asserts
every stage the pipeline can report belongs to a group — an ungrouped new stage
would silently read as "not started" while it ran.

**A mock render's skipped steps are shown as SKIPPED, not done.** A mock uses
canned narration and touches no model, so Source/Scenes/Dialogue/Script/Narration
genuinely do not run. They stay struck through even once the render finishes:
a bar claiming a mock "transcribed the dialogue" would be a lie told by a
progress bar.

**Consequence — `markFailed` no longer clears `render_stage`.** It is the only
record of where a render failed, and the bar marks that step red. Clearing it
left a failed render showing a bar where nothing had started. The progress
COUNTERS are still cleared, because "scene 12 of 40" is meaningless once the run
is over.

**An unrecognised stage marks everything pending rather than guessing.** A bar
that has not started is better than one claiming work that never happened.

**Not verified in a browser:** the Chrome extension was not connected, so the
layout was checked by build and unit tests only. The state logic is pure and
tested (`lib/movie-recap-steps.test.ts`); the visual arrangement was not.

## 2026-09-17 — Re-applied: +10% narration rate, and why not more

**Raised to +15% the same day — see the entry below. The table here is still the
method; only the chosen row changed.**

**Decision:** `AZURE_NARRATION_RATE = "+10%"` is back (the half of `c18d550`
that was reverted in `d7ab62d`). The narration lines are left exactly as the
model writes them — the recap is paced by speaking faster, not by saying less.

**Why +10% and not more, measured rather than guessed.** Running the real
`planBeatShots()` over the ten beat durations from the last export shows where
raising the rate starts costing scenes:

| rate | speech | shots | scenes dropped |
|------|--------|-------|----------------|
| +0%  | 36.1s  | 27    | 2 |
| +10% | 32.8s  | 27    | 2 |
| +15% | 31.4s  | 25    | 4 |
| +20% | 30.1s  | 24    | 5 |
| +30% | 27.7s  | 22    | 7 |

**+10% is free.** It is the last rate that changes nothing about the edit: the
same 27 shots, the same 2 scenes dropped as at Azure's default. Past it, shot
count is `ceil(beatDuration / SHOT_TARGET_S)` and shorter beats buy their speed
by discarding scenes the narration model deliberately chose — +15% buys only
1.4s more than +10% and costs two of them.

This supersedes the earlier "+10% and not more" reasoning, which guessed at
"around +15% that starts biting". The guess was roughly right; this is the
measurement, and it also gives the method for re-deciding if `SHOT_TARGET_S`,
`MIN_SHOT_S` or typical line length ever change.

**Still true from the first attempt:** Azure treats the percentage as a rate
multiplier, so `+10%` is a 9.1% duration cut (measured 6.825s against 6.204s on
the same line), and the committed voice previews must be regenerated with
`scripts/generate-voice-previews.ts` or the play button demonstrates a delivery
the render no longer produces.

## 2026-09-17 — Narration rate raised to +15%, spending two cuts for the pace

**Decision:** `AZURE_NARRATION_RATE = "+15%"`, chosen over the "free" +10% after
being shown what the extra costs. Measured on the same line: 6.825s at Azure's
default, 6.204s at +10%, **5.933s at +15%** — a 13.1% cut, exactly `1/1.15`.

**What it costs, from the table in the entry above:** shots over ten real beats
go from 27 to 25. Two beats hold one scene fewer.

**What it does NOT cost, which is the distinction that made the choice easy:**
no narration is lost. Every line is still spoken in full — that was the whole
point of rejecting the line-shortening pass. Raising the rate only reduces how
many visual cuts a beat can afford, because shot count is
`ceil(beatDuration / SHOT_TARGET_S)` and the beat is shorter.

**So the trade is picture, not script:** a faster read against slightly longer
holds per shot. +10% was the last rate that changed nothing about the edit; +15%
is the first that spends something, and it was judged worth it. +20% was
available and declined — it buys only 1.3s more than +15% and costs another cut.

**Unchanged:** the previews are committed files and were regenerated again
(`scripts/generate-voice-previews.ts`), shrinking a further ~4%.

## 2026-09-17 — Hard rule: no source footage on screen for more than 3.0s (SCOPED to 9:16 on 2026-09-17, below — 16:9 uses 4.0s; the invariant and its three enforcement points are unchanged)

**Requirement, stated by the user as non-negotiable:** no source clip may appear
for more than 3.0 seconds continuously in the final recap. The pacing targets
(`SHOT_TARGET_S` 1.4, `MIN_SHOT_S` 1.0, `MAX_SHOT_S` 2.4) are explicitly NOT the
lever and are unchanged — so the measured `+15%` narration-rate table in the
entry above still stands.

**The old planner had a target, not a rule, and two things got past it:**

1. **Supply ran out.** `planBeatShots` capped its count at `shots.length`, and
   the borrowing pass topped a beat up only while `spareScenes` had entries. An
   empty pool meant one scene carried the whole beat — the previous tests
   asserted a 6s and a 7s hold as correct behaviour.
2. **Source-contiguous shots played back to back**, which no per-shot cap can
   see. Borrowing took the spare NEAREST in time, which is usually the
   immediately adjacent scene; shots then sort chronologically, so scene A
   played to its end and scene B started exactly there. Two "cuts", one
   unbroken run of footage. The user confirmed this counts as continuous.

**Decision: `MAX_CONTINUOUS_SOURCE_S = 3` is an invariant on a RUN of shots**, not
on one shot, and it lives with the planner in the new `lib/movie-recap-shots.ts`
(extracted from the render, which is why `movie-recap-shots.test.ts` had that
name already). Enforced in three places:

- **Borrowing prefers a non-adjacent spare.** Nearest-in-time still decides, but
  a spare that butts up against footage the beat already holds is skipped while
  a non-touching one exists.
- **Cut count is floored** at `ceil(targetS / MAX_CONTINUOUS_SOURCE_S)`.
  `MIN_SHOT_S` never fights it: `floor(t/1) >= ceil(t/3)` for every `t >= 1`.
- **A continuous run is pulled apart** by moving a window INSIDE its own scene —
  start the later shot further in, or end the earlier one sooner — never by
  reordering. This preserves "cuts play in the order they happen in the film"
  (2026-09-16), which was the alternative and was rejected again here.

**Continuity is measured on played source, not on the slot.** A trimmed shot
shows less of its scene than the slot suggests, a freeze-padded or speed-ramped
one shows all of it, and the copyright-free transform takes `slot * speed`.
`playedSourceSeconds()` mirrors the render's four ffmpeg branches, and
`SPEED_RAMP_MIN/MAX` moved into the planner so the two cannot disagree. Getting
this wrong in either direction is invisible: too strict and it cuts footage
apart that already had a jump in it; too loose and the invariant silently fails.
It is also why the planner takes the speed callback rather than assuming 1.0.

**Supersedes:** *"If the pool is empty the hold stands: repeating footage inside
one beat looks worse than a long shot"* (2026-09-16). The hold no longer stands.
But the reason it was written still holds, so the fallback is NOT reuse:

**Fallback is sub-splitting one scene into non-contiguous windows.** A scene of
length D yields k windows of one slot each, spread evenly with at least
`MIN_JUMP_S` (0.5s) skipped between them — different footage each time, so
nothing is shown twice, and it reads as a jump cut rather than a hold. Reusing a
scene from elsewhere in the film was offered and declined for the recorded
reason.

**When it is arithmetically impossible** — one short scene under a long line,
nothing to borrow, nothing long enough to split — the plan carries a `warning`
and the render logs it per beat. It does not pretend. Measured over a 540-case
grid this is ~5% of synthetic combinations and all of them are 1-second scenes;
with `detectScenes` keeping up to 300 scenes and a recap using ~30, it should not
occur on a real source.

**Consequence a future reader will mistake for a bug:** breaking a run by ending
the earlier shot sooner shortens its window below its slot, so that shot gains
freeze-padding it did not have before. That is deliberate — the freeze is bounded
by the slot, which is bounded by 3s, and a held frame with a cut after it beats
an unbroken 4s of source.

## 2026-09-17 — Speed set narrowed to 0.96-1.07, and the dead zone widened to +-3% (superseded by the slow-only set 2026-09-17, below; the dead zone and the +-7% bound stand)

**Decision:** `MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` is `[0.96, 0.97, 1.04, 1.07]`,
was `[0.94, 0.96, 1.05, 1.07]`. The rule it serves is unchanged and is the point
of the whole list: **no shot ever plays at the source's own speed** (2026-09-16,
"Speed is an input").

**Why narrower:** 0.94 is a 6% slowdown, which is the most visible value in the
old set and the one most likely to read as a slow-motion shot rather than as
nothing in particular. The range now sits inside 0.96-1.07 — still nowhere near
1.0, still invisible per shot.

**Why not 0.98, which was proposed:** it is inside the dead zone. 2% at 30fps is
under one frame of drift a second, so it is "not 1.0" on paper and untouched in
the picture — it spends a slot in the list without doing the job the list exists
for. The dead zone is recorded as +-3% now rather than +-2% for the same reason,
so the next edit does not re-argue it.

**Unchanged:** `pickShotSpeed()` and its hashing, the +-7% outer bound, and the
reasoning for both. This is a values change, not a behaviour one.

**Consequence:** speed decides how much source a shot consumes
(`slot * speed`), so it also feeds the continuity check in
`lib/movie-recap-shots.ts`. Narrowing the set slightly reduces how far a shot
runs into the footage after it. Nothing to tune — the planner reads the same
constant.

## 2026-09-17 — A shot plays the moment its scene was DESCRIBED from, not the head

**Problem, reported off a render:** "main part is cut out" — the shot is the
right scene but the wrong moment of it. The action the line is about happens
after what is on screen.

**Cause, and it predates the 3s work:** the render's trim branch took the HEAD of
a scene — `-to sourceStartS + slot`. Scene detection keeps scenes of at least 2s
and many run much longer, so a 6s scene under a 1.4s slot showed 0-1.4s. But
`extractKeyframes()` takes each scene's representative frame **a third of the way
in**, the vision pass describes THAT frame, and the narration model picks the
scene from that description. The pipeline was choosing scenes by one moment and
playing a different one.

**Decision:** the planner narrows each scene to the piece that will actually play
(`focusWindow()`), centred on the described moment and clamped inside the scene.
Everything downstream — the continuity check and all four ffmpeg branches — works
on that piece. `KEYFRAME_FRACTION` in the planner and the `/ 3` in
`lib/movie-recap-scenes.ts` are the same number and have to move together; a
comment on each says so.

**Consequences a future reader would otherwise read as bugs:**
- A window is now usually exactly its slot long, so `ratio` is 1 and the render
  takes the speed-ramp branch with `setpts=PTS*1.0000` where it used to trim.
  Same output.
- The "extreme duration mismatch" warning effectively only fires now for a scene
  SHORTER than its slot. The long-scene half of it was the case this fixed.
- Breaking a continuous run now prefers SLIDING a window inside its scene (it is
  only a slot-sized view of a longer scene, so sliding costs nothing) over
  shortening one, which was the previous first move.

**Bug caught while writing this, worth keeping:** a run's length is counted in
SCREEN seconds, not source seconds. A scene shorter than its slot is
freeze-padded, so 1s of source can occupy 1.7s of recap — two adjacent 1s scenes
are 3.4s of unbroken footage, not 2s. Counting source seconds silently let that
through, and the property test caught it on exactly that case.

## 2026-09-17 — Shots land in a 1.5-2.5s band: MIN_SHOT_S 1.5, SHOT_TARGET_S 2.0 (SCOPED to 9:16 on 2026-09-17, below — still the measured, authoritative short-form numbers)

**Measured, on the export the complaint came from** (19.7s, 720x1280, detected
with `detect-adaptive --min-scene-len 0.3s`):

```
20 shots, mean 0.98s, max 1.27s, nothing over 3s
[0.97, 0.97, 1.27, 1.03, 1.0, 1.0, 1.13, 1.13, 0.93, 1.17,
 1.0, 1.0, 1.17, 1.27, 1.23, 0.83, 0.3, 1.17, 0.93, 0.2]
```

So the file never had a hold problem — it had the opposite one. Almost every
shot sat on the `MIN_SHOT_S` floor, and an action or a line of dialogue does not
land in one second. (The 0.3 and 0.2 entries are cuts inside the source that
detection missed, per 2026-09-16 — not ours.)

**Cause of the clustering at 1.0s:** `shotCount = ceil(targetS / SHOT_TARGET_S)`
clamped by `floor(targetS / MIN_SHOT_S)`. At 1.4 and 1.0 the ceiling almost
always asked for one more cut than the beat could pay for, so the floor decided
the length and every beat came out at 1.0s.

**Decision, user's call:** `MIN_SHOT_S` 1.0 -> **1.5**, `SHOT_TARGET_S` 1.4 ->
**2.0**. Every beat length now lands in 1.5-2.5s:

| beat | shots | slot | | beat | shots | slot |
|------|-------|------|-|------|-------|------|
| 2.0s | 1 | 2.00s | | 4.5s | 3 | 1.50s |
| 2.5s | 1 | 2.50s | | 5.0s | 3 | 1.67s |
| 3.0s | 2 | 1.50s | | 6.0s | 3 | 2.00s |
| 3.5s | 2 | 1.75s | | 7.0s | 4 | 1.75s |
| 4.0s | 2 | 2.00s | | 9.0s | 5 | 1.80s |

**`MAX_SHOT_S` (2.4) is unchanged and is now only a borrowing target.** With the
floor at 1.5 it no longer binds the slot — a 2.5s beat gets one 2.5s shot,
because `floor(2.5 / 1.5) = 1`. The cap that actually binds is
`MAX_CONTINUOUS_SOURCE_S`, and the test that used to assert 2.4 now asserts 3.0.

**Supersedes** the 2026-09-16 "Left at 1.0s" reasoning. That entry was answering
"raise the minimum to 0.8 because the output has sub-second cuts" and was right
that the floor was not the cause of those. It did not consider raising the floor
to make shots longer, which is what was actually wanted.

**Invalidates the +15% narration-rate table** (2026-09-17, two entries up). That
table measured how many shots each rate costs, and its own text says to re-run it
if `SHOT_TARGET_S` or `MIN_SHOT_S` change — both did. The rate is left at +15%:
its trade was about narration delivery, not about cut count, and shot count is
now set by this band rather than by how long the speech runs. Re-measure before
moving the rate again.

**Consequence:** fewer shots per beat, so more of the scenes the narration model
picked get dropped (they are dropped from the END of the beat, chronologically).
That is the price of the longer hold and was accepted knowingly.

## 2026-09-17 — A shot never plays across one of the film's own cuts

**Measured, on the export rendered with the 1.5-2.5s band in place** (20.57s):
detection found **21 cuts in a video the planner cut 11 times**. Merging the
detections back up to the 1.5s floor recovers the planner's own structure
exactly — `1.64, 1.63, 1.70, 1.70, 1.80, 1.80, 2.07, 2.07, 2.70, 1.83, 1.63` —
so the band was working. The other ~10 cuts came from the source: nearly half the
shots contained an edit from the original film, and a planned 1.7s hold arrived
as two pieces of ~0.85s. That is what still read as "too fast, the action is cut
out" after the pacing change.

**Cause:** `detectScenes` asked PySceneDetect for `--min-scene-len 2s` and
`condense()` merged anything shorter into the preceding scene. Both were right
for the CONSUMER of that list — one keyframe and one vision description per
scene, and a recap beat is never half a second long — but the merge threw the
cut list away, and the shot planner was handed 2s+ "scenes" that were not
unbroken footage.

**Decision: detect fine, merge for the model, keep the cuts for the planner.**
`detectScenes` now runs at `RAW_MIN_SCENE_S` (0.8s) and returns
`{ scenes, cuts }`: `scenes` is the same merged, `MAX_SCENES`-capped list the
vision pass and the narration model always got, and `cuts` is every boundary
detection found. Nothing about the scene list's shape changed — only that the
information thrown away is now also returned.

**`focusWindow()` splits its scene into uncut runs and plays inside ONE of them.**
It prefers the run holding the described frame — the same `/ 3` point
`extractKeyframes` samples, so the shot shows the moment the scene was chosen
for — and otherwise the nearest run long enough for the slot. The run is also
what `breakContinuity` may slide the window within, so opening a gap cannot push
a shot across a cut either.

**When no run is long enough, the shot plays across a cut anyway.** The
alternative was a shorter window freeze-padded out to its slot, and an original
edit inside a shot still looks like film while a held frame looks like a bug.
The described moment wins in that case.

**Not done:** `subSplit()` (the dry-spare-pool fallback) still ignores cuts, so
its sub-windows can straddle one. It is the rare path and its windows are short;
worth fixing if that path ever becomes common.

**How to re-measure this**, since the number only shows up in the finished file:

```bash
.venv-scenedetect/bin/scenedetect -i recap.mp4 -o /tmp/check \
  detect-adaptive --min-scene-len 0.3s list-scenes -f cuts.csv
```

Detected cuts materially above what the render logged (`beat=N ... -> K shot(s)`)
means source edits are leaking into shots again.

## 2026-09-17 — A shot lands on its liveliest second, and what "freeze" turned out to be

**False alarm first, because the method matters.** A render was reported as
freezing at 0:10 and 0:11. Measuring duplicate frames on a 64x48 greyscale
downscale found 9 frozen spans totalling 6.17s — 29% of the file. **All of it was
an artefact.** At 240x180 the same file has **zero** duplicate frames: no
`tpad` freeze-padding happened at all. A coarse downscale turns near-static
FOOTAGE into identical bytes. Measure freezes at 240x180 or finer, and treat a
scattering of single duplicate frames as the `fps=30` resample of 24fps source,
which is what it is.

**What was actually wrong:** motion, not freezing. Per-shot mean frame difference
on that export ran 10.6 and 12.1 for the opening two shots and 2.1-3.9 for the
rest. A 1.8s shot at a third of the opening's motion reads as frozen next to it.
The scenes were not static throughout — the window had simply been centred on the
described moment, which landed on a dead stretch of an otherwise moving scene.

**Decision:** the planner places a shot on the liveliest window inside its uncut
run. `focusWindow()` scores every candidate start on mean motion relative to the
RUN's own average, minus `MOTION_DRIFT_PENALTY` (0.15) per second of drift from
the described moment. Relative, so a quiet scene uses its own best second rather
than being written off against a loud one; penalised, so a marginal gain a long
way off is not worth leaving the described action for.

**The motion track is free.** PySceneDetect already decodes every frame to find
cuts; `-s stats.csv` makes it write the per-frame `content_val` it computed on
the way, and `parseMotionCsv()` averages that into 0.25s buckets. A separate
ffmpeg pass would have meant decoding a feature film a second time. It fails
soft: no stats file means no motion-aware framing, not a failed render, and the
scene log says `(no motion track)` when that happens.

**Order of authority, unchanged by this:** the uncut run is chosen first (by the
described moment, see the entry above), and motion only decides where to sit
INSIDE it. Motion can never pull a shot across one of the film's own cuts.

**Rejected:** shortening the slot for low-motion shots. It would have fought the
1.5-2.5s band chosen the same day, and the problem was where the window sat, not
how long it was.

## 2026-09-17 — Motion picks which scene, not just where inside it

**Correction to the entry above, and to how these files get measured.** The
"freeze" reports were real observations with three wrong diagnoses in a row:

- 64x48 greyscale, exact-duplicate test: 9 spans, 6.17s. Artefact.
- 240x180, exact-duplicate test: zero spans. Also wrong — `tpad` clones go
  through libx264 and do not decode back byte-identical, so an exact test misses
  real padding.
- 240x180 with a threshold: 9 spans, 7.47s, and the SAME answer at thresholds
  from 0.05 to 0.6. Still an artefact.

**The test that actually distinguishes them is full-resolution mean frame
difference.** Inside those spans it reads 2.4-5.8 against 9.6 for moving
footage; a real `tpad` clone reads ~0 even at full resolution. Downscaling
averages low-motion detail away, so slow footage and frozen footage become the
same number. **Do not measure freezing on a downscale.**

So nothing was being freeze-padded. The shots carried 25-60% of the opening's
motion and were held for a full 1.5-2s slot, which is what "not moving, then it
switches" was.

**Decision, two changes, both using the motion track:**

- **Borrowing picks the liveliest of the nearest spares.** The nearest
  `BORROW_CANDIDATES` (6) are taken by proximity — borrowed footage still has to
  belong to this stretch of the film (2026-09-16) — and motion only chooses
  between those. A lively scene an hour away can never be pulled in, and there
  is a test for that.
- **A beat that cannot afford all its scenes drops the deadest**, not the last
  one. `slice(0, shotCount)` dropped chronologically from the end, which meant
  the beat always lost the end of its own line — usually the payoff.

**Why this and not window placement alone:** the previous entry moves the window
to the liveliest second INSIDE a scene, which cannot help when the whole scene is
static. Choosing the scene is the lever that can.

**Not done, offered and declined for now:** rejecting a scene outright when its
motion falls below a fraction of the film's average. It is the strongest version
of this and also the one that can silently discard a scene the narration is
about.

**Both fail soft:** with no motion track (a mock render, or an unreadable stats
file) borrowing is nearest-first and dropping is last-first, exactly as before.

## 2026-09-17 — Bug fixed: motion-aware placement was hunting for cuts

**Reported:** "the freeze on shot is still happening, and the video got longer —
the worst generation since all the changes". Measured on that export (36.17s):

- **No freezing.** Zero clone frames at full resolution, and per-shot motion ran
  2.7-17.2 with one shot under 3.0. Nothing static enough to explain it.
- **Length is narration, not planning.** Beats are sized by measured TTS and the
  model writes a fresh script every render; 36.17s against the previous 20.97s is
  script variance. Nothing in the planner changes total length.
- **Source-cut leakage roughly tripled**: ~11 film cuts inside shots, against ~4
  the render before. That one was real, and mine.

**Cause:** the motion track is PySceneDetect's `content_val` — the metric it
THRESHOLDS TO FIND CUTS. It peaks hardest exactly at an edit. Inside a clean
uncut run that is harmless, but on the fallback path, where `room` is a whole
scene because no run was long enough, the candidate search could see cuts and was
drawn straight onto them. The scorer was rewarding the thing the rest of the
module exists to avoid.

**Fix, two parts:**
- `motionMean()` skips any bucket containing a cut. A cut is not movement.
- A candidate window pays `CUT_PENALTY` per cut inside it, so a cut-free
  placement always wins; when none is cut-free the penalty is what makes the
  search take the placement with the FEWEST cuts rather than the loudest one.

**Worth keeping in mind for any future use of this signal:** anything derived
from a cut detector's own metric carries cut spikes, and they will dominate any
average taken over a span that contains one.

## 2026-09-17 — "Freeze" means the picture holds still, and how to measure that

**What the word meant, after several wrong readings on my part:** not duplicate
frames, not `tpad` padding — the shot simply does not move. Both are worth being
able to measure, and they need OPPOSITE methods:

- **Freeze-padding (cloned frames):** full-resolution mean frame difference. A
  clone reads ~0; slow footage reads 2.4-5.8. Downscaling collapses the two.
- **"Nothing visibly moves":** DOWNSCALED difference (160x120 or so). Grain and
  compression noise average away and only gross motion survives. At full
  resolution grain keeps every frame "different" and hides it.

Measured the reported export both ways: **zero cloned frames, and 11.0s of 36.1s
(30%) with no visible motion**, in runs up to 1.30s — several whole shots still
for their entire length. The complaint was right; the first three measurements
were not.

**`content_val` can see it.** Cross-checked against the pixels on that export:
stretches the pixels call still read 0.08-3.8, moving ones 5.6-11.5, against a
film median around 4.2. Well separated, so the signal was fine and the scorer was
not.

**Cause: the window score was a MEAN.** A window that sat still for 1.5s and
twitched once for 0.3s scored the same as one that moved throughout. Fixed by
scoring `movingFraction()` — the share of a window's buckets at or above
`STILL_FLOOR_FRACTION` (0.8) of the film's median — with mean motion kept at
`MEAN_MOTION_WEIGHT` (0.25) only to break ties between windows that move for
equally long.

**Why the floor is relative to the film's own median** rather than absolute: a
grainy print and a clean one sit at different absolute levels, and an all-quiet
scene should still get its best second rather than being written off against the
rest of the film. There is a test for exactly that.

**Still open, and it is the ceiling on all of this:** placement can only move a
shot WITHIN its scene. When the scene the narration model picked is static end to
end, nothing here helps — that needs rejecting the scene and swapping in a spare,
which was offered and declined earlier because it can discard a scene the line is
about.

## 2026-09-17 — ROOT CAUSE: condense() never guaranteed a scene was long enough

**Symptom, reported precisely enough to find it:** "almost every shot becomes
frozen just before it switches." That is the signature of `tpad=stop_mode=clone`,
which pads the TAIL of a shot when its window is shorter than its slot.

**Proof, on the reported export.** The shot at 18.07-19.97 is 58 frames: 18 of
them move (cumulative difference from the first frame rises 0 -> 16.6), then 39
frames sit at exactly 16.6 — **1.30s of one held frame** — then the cut. 0.6s of
footage stretched across a 1.9s slot.

**Root cause, in `condense()`:**

```ts
if (previous && row.end - previous.start < MIN_SCENE_S) previous.end = row.end;
```

That measures the span from the PREVIOUS SCENE'S START, not the scene's own
length, so it never guaranteed what its name and comment claimed. It was
harmless for as long as detection ran at `--min-scene-len 2s`, because every raw
row already cleared the bar and the branch never fired. **Lowering
`RAW_MIN_SCENE_S` to 0.8s for cut-awareness turned a latent bug into a live one**:
raw rows became 0.8s, and merged scenes came out at 0.8-2.0s. Reproduced from the
rule alone — raw rows of 0.8s produce scenes of 0.9s, 1.4s and 1.6s.

**Fix:** test the merged scene's own length, and fold a short final scene back
into the one before it, since nothing follows it to merge in. Every scene is now
at least `MIN_SCENE_S`.

**Guards added, because this shipped silently:**
- Borrowing prefers a spare that can fill the slot before motion gets a say.
- A beat that cannot afford all its scenes drops the ones too short to fill the
  slot first, whatever their motion — a held frame is worse than a quiet one.
- `planBeat` totals how much of a beat has no footage behind it and returns a
  warning, which the render logs per beat.

**How the measurement went wrong four times, and what to trust.** Freezing was
measured as duplicate frames, first on a 64x48 downscale, then 240x180, then at
"full resolution" with `crop=iw:ih*0.72` — 1280 * 0.72 = 921.6, ffmpeg emits 921
or 922 rows, and the reader assumed 920. **Every frame was byte-misaligned, so
everything looked like motion and the conclusion was "no freezing at all."** Use
a crop whose height is an exact even integer, or scale to an explicit size, and
verify the frame count against the duration before believing any of it. The
`cumulative difference from the first frame of the shot` view is what finally
made the hold obvious, because a held frame shows as a dead flat line.

## 2026-09-17 — Render history is per-shot, and lives in localStorage

**Want:** a record, per generation, of how long each shot ran and how it compares
to the original — kept per project, listed under the rendered video, newest
first, deletable.

**Decision: the browser stores it, not the database.** A table was started and
stopped at the user's direction. This is a record of how one RUN turned out,
used to compare against the last one while iterating on settings; it is not
project data, nobody else needs to read it, and keeping it local means no
migration, no RLS policy, and no rows to clean up when a project is deleted.

**Consequence, stated because it will surprise someone:** the history is per
browser. It does not follow the user to another machine and clearing site data
clears it. Capped at 20 entries per project.

**So the shot log has to ride back on the render response.** `runMovieRecapRender`
now RETURNS it and the render route sends `{ ...project, renderLog }`. That
response is the only time the browser ever sees this data — nothing on the row
holds it, so a missed append is gone for good.

**What each shot records, and why these fields:** `slotS` (time on screen),
`sourceStartS`/`sourceEndS`/`sourceS` (which part of the original, and how much
of it), `speed`, `skipS` (source seconds jumped since the previous shot), and
**`padS` — seconds with no footage behind them, filled by holding a frame.**
`padS` is the reason the feature is worth having: the bug fixed earlier today
held a frame for 1.3s at the end of most shots and nothing in the product said
so. It is red in the table when above 0.1s.

**`useSyncExternalStore`, not an effect.** Reading localStorage into state in a
`useEffect` is what the lint rule `react-hooks/set-state-in-effect` exists to
stop, and it would have needed prop-drilling through `Review` as well. The store
in `lib/movie-recap-render-history.ts` keeps a cache keyed by project id — a
stable snapshot reference is what stops `getSnapshot` re-rendering forever — and
publishes to subscribers on append/delete/clear. `getServerSnapshot` returns a
shared empty array, since the store does not exist on the server.

**Every storage access is wrapped**, because `localStorage` throws in a private
window and returns nothing with site data blocked. A history that cannot be read
or written degrades to empty; it must never take a render down with it.

## 2026-09-17 — Narration is beat-level; it never scales per clip

**Principle, stated by the user and worth keeping at the top of any future
prompt work:** a narration line carries ONE story idea and its length comes from
that idea. Several clips may support the same line. The planner fits clips to
the narration — never the other way round.

**What was removed:**

> "A beat is cut into roughly 1.5-second shots, so a line spoken over four
> scenes wants about six seconds of speech — if a line is too short to give each
> of its scenes that long, the render drops the extra scenes."

It taught the model to budget narration by clip count. Its numbers were also
stale — shots are 1.5-2.5s now, not 1.5s.

**REJECTED, and this is the trap to avoid:** re-costing that sentence for the
current band, i.e. telling the model "each scene costs about 40 Burmese
characters, so write the line long enough to pay for the scenes you picked."
That was proposed here and turned down. It reads like a fix — the arithmetic is
correct, and it would make the model's scene choices survive instead of being
dropped — but it makes narration a function of clip count, which is precisely
the coupling that must not exist. A recap where every visual cut needs its own
chunk of narration is a list, not a story.

**What replaced it:**

> "Pick the scenes that show this beat. Supplying more than the render can use is
> fine — it keeps the ones that fit the line and drops the rest. Never lengthen a
> line to justify more scenes."

Over-supply was already absorbed — `keepLiveliest()` drops what a beat cannot
afford, by motion. The prompt now says so, so the model has no reason to pad.

**Accepted consequence:** a line under about 62 Burmese characters can only fund
ONE clip, so many beats are a single clip held up to `MAX_CONTINUOUS_SOURCE_S`.
That is within the rule and was accepted knowingly. **If more visual variety is
wanted, the lever is `MIN_SHOT_S`, not the narration** — lowering it lets a short
line carry more cuts. Do not reach for the prompt for this.

**Unchanged and still correct:** "the line's length decides how long its beat
stays on screen, so a rambling line makes the video drag." That couples length to
PACING, which is real, rather than to clip count.

## 2026-09-17 — A third of a second skipped is not a cut: continuity threshold 0.15s -> 0.5s

**Measured on a real export** (23.53s, 12 shots, 7 beats), three pairs played
near-adjacent footage back to back:

| pair | skipped | on screen together |
|------|---------|--------------------|
| 3.1 -> 3.2 | 0.47s | 3.54s |
| 4.1 -> 4.2 | 0.29s | 3.54s |
| 4.2 -> 5.1 | 0.42s | 3.41s |

Each PASSED the rule: `CONTINUITY_EPSILON_S` was 0.15s, so any gap above that
counted as a genuine cut. But skipping a third of a second inside the same scene
and carrying on does not read as a cut, it reads as one clip — and each of these
ran ~3.5s, over the 3.0s limit the rule exists to enforce.

**Decision:** `CONTINUITY_EPSILON_S` 0.15 -> **0.5**. The old value only ever
covered the 2dp rounding of scene boundaries; it was never chosen against how a
skip actually looks.

**`MIN_JUMP_S` 0.5 -> 0.75 comes with it, and has to.** It is the gap the
planner opens when it breaks a pair, so it must sit ABOVE the threshold that
decides whether a pair is joined — at 0.5 and 0.5, a freshly separated pair
lands exactly on the boundary it was trying to clear and the fix does nothing.
Keep that ordering if either value is tuned again.

**Cost:** sub-splitting a scene needs `k * slot + (k - 1) * 0.75`, so a scene has
to be slightly longer to be split. Borrowing also skips more spares as
"touching". Both are the intended trade.

## 2026-09-17 — Bug fixed: the fill test ignored playback speed

**Same export, 0.24s of held frames across two shots** — the class of bug
supposedly closed earlier the same day:

```
2.1: slot 2.92s needs 3.04s of footage at 1.04x, scene has 2.93s -> held 0.10s
7.1: slot 2.96s needs 3.17s of footage at 1.07x, scene has 3.03s -> held 0.13s
```

Off by exactly the speed multiplier. The "can this scene fill the slot?" guard
compared the scene against `slotS`, but the copyright-free transform plays
`slot * speed` seconds of source — up to 7% more. `footageFor()` now applies the
FASTEST speed the beat could be given, since which shot index gets which speed is
not known while scenes are being chosen.

**What this does NOT fix, deliberately:** the guard only runs while BORROWING. In
both shots above the beat had one scene and needed one shot, so nothing was
borrowed and the model's own too-short scene was used as-is. Closing that would
mean swapping out a scene the narration model chose to save about three frames of
held picture. Offered and declined.

## 2026-09-17 — The aspect ratio IS the format: pacing is per-ratio, not global

**Decision, the user's:** 9:16 goes to TikTok and Facebook, 16:9 goes to
YouTube, and **the aspect ratio alone selects between them.** No `format`
column, no migration, no wizard field. Both formats matter equally — this is not
a short-form product with a long-form mode, or the reverse.

`MOVIE_RECAP_PACING` in `lib/constants/movie-recap.ts` keys the shot band, the
continuity limit, the narration line budget, the beat cap and the subtitle
offset on the ratio:

| | 9:16 short | 16:9 long |
| --- | --- | --- |
| `minShotS` | 1.5 | 2 |
| `shotTargetS` | 2 | 3.5 |
| `maxShotS` | 2.4 | 4 |
| `maxContinuousSourceS` | 3 | 4 |
| `lineChars` | 25-45 (max 50) | 45-80 (max 90) |
| `maxSegmentS` | 3.5 | 6 |
| `subtitleOffsetPct` | 18 | 8 |

**Why the ratio and not a separate field:** a separate `format` column would
always move with the ratio, so it would be a second source of truth for one
decision. Considered and rejected by the user. The cost is recorded below.

**The four shot numbers stopped being module constants.** They arrive on
`planBeat` as `pacing`, so `lib/movie-recap-shots.ts` has no opinion about which
video it is planning. `shotsNeededFor`, `minShotsFor` and `breakContinuity` take
it too.

**THE INVARIANT any future profile must satisfy:** `floor(t / minShotS) >=
ceil(t / maxContinuousSourceS)`. It holds at 1.5/3 and at 2/4. It does NOT hold
at 2/3 — a 3.5s beat asks for 2 cuts and can afford 1 — which is why the
continuity limit moved to 4 in the same change rather than separately.
`movie-recap-shots.test.ts` now asserts this over every entry in the table, and
runs the 540-case continuity grid against both.

**`minShotS` is the split threshold, and it is the number that sets the feel of
the whole video.** `floor(t / 2)` is 1 until the beat reaches 4s, so a normal
16:9 line plays as ONE clip and only a long one is cut. `shotTargetS` only
decides how a beat already past that point is divided.

**Rejected: 3-4s shots on the old 1.5s floor.** Proposed first; the arithmetic
kills it. `floor(3.0 / 3.0)` = 1 makes EVERY beat one clip, so cutting inside a
line disappears and the narration prompt's 2-4 scenes per beat all fall through
to the spare pool unused. `minShotS = 2` is what makes a 3-4s target reachable
without that collapse.

**Longer 16:9 lines are not the old per-clip coupling coming back.** The prompt
used to quote shot lengths at the model, which was removed on purpose
(2026-09-16). `lineChars` bounds the IDEA, not the clip; the planner still fits
whatever the line turns out to be. But a 45-character line cannot hold a 4s clip
without the picture stalling, so the budget had to move with the band.

**Consequences a future reader will mistake for bugs:**

- **The 16:9 numbers are reasoned, not measured.** The 9:16 ones came out of real
  exports and four tuning passes; the 16:9 ones were derived from the arithmetic
  above and have never been rendered at length. Treat them as a first draft.
- **The 3.0s limit was recorded as non-negotiable and user-stated.** It still is
  — for 9:16. The user raised it to 4.0s for 16:9 only.
- **A 16:9 recap cannot be made to cut fast, and a 9:16 one cannot be made to
  hold**, without changing its frame shape. That is the accepted cost of keying
  on the ratio.
- **`subtitleOffsetPct` is seeded once, at project creation**, next to the
  framing. Changing the ratio later does NOT move a caption the user has since
  placed themselves — same rule the framing already follows.
- **18% for 9:16 is a starting guess, not a measurement.** TikTok and Facebook
  draw the post caption, the username and the audio ticker over the bottom of
  the frame, and at the old flat 8% the burned subtitle lands behind their UI.
  The number still needs eyeballing against a real post. The right-hand action
  column (`marginH`, a flat 6% both sides) has the same problem and is NOT
  addressed yet.

**Deferred, to be judged on a test render:** action/reaction shots at 2-3s
against 3-4s for normal ones. The motion track it needs already exists and
already places shots inside a scene; what is missing is the threshold that calls
a scene "action", and that is a number to pick by eye on a real export. Slow
zoom on a held frame is deferred with it.

## 2026-09-17 — Borrowing answers coverage, not just cut count

**The bug the per-ratio bands exposed:** every rule in `planBeat` sized a beat by
how many CUTS it needed. Nothing asked whether there was footage behind them. A
beat holding one scene shorter than its slot satisfies `minShotsFor`,
`shotsNeededFor` and `minShotS` alike at one shot, and arrives at the render
short — which the render answers with a held frame, while the spare pool sits
there untouched. Rare at 1.5-2.5s slots, because scenes are at least
`MIN_SCENE_S` (2s) and almost always filled them. Common at 2-4s slots.

**Decision: a second borrowing pass, driven by the freeze.** While the plan would
still hold a frame and the beat can afford another cut without falling under
`minShotS`, borrow another scene. Each extra shot shrinks the slot AND adds
footage, so the deficit falls from both ends. This can push the count past
`shotTargetS`'s `wanted` — deliberately: a cut the viewer did not expect beats a
picture that stops moving.

**`holdDeficit()` is what it measures, and it is not the padding warning.** It
counts only what the render would FREEZE, mirroring the four ffmpeg branches:
inside the speed-ramp band the render slows the clip, the scene still plays
whole, and there is nothing to buy a cut for. The `warning` below it still
reports the whole gap including the ramped part. Different questions — one
decides whether to spend a cut, the other tells a human the beat is thin.

**Sub-splitting cannot serve coverage, and the arithmetic is why:** splitting one
2.2s scene into two windows halves the slot too, so the deficit is identical
either way. It adds cuts, never footage. It stays where it was, serving the
continuity invariant only. This was checked rather than assumed — "prefer
sub-splitting over freezing" sounds right and does nothing.

**What is left, and is not a bug:** a beat under `minShotS * 2` cannot be split
at all, so a short scene under a short line still freezes and there is no cut to
buy. Borrowing cannot help a beat that cannot afford a second shot. The order is
therefore borrow (real footage) -> slow-fill (small gaps, inside the ramp band)
-> freeze (last resort), with sub-split outside that chain.

**`SPEED_RAMP_MAX` stays 1.15.** Raising it to 1.25 was proposed, to convert more
freezes into slow-fill, and declined by the user: 1.25 is ~0.8x playback, which
reads as deliberate slow motion rather than as nothing in particular. Slow-fill
is for small timing gaps only.

## 2026-09-17 — The copyright speed set is slow-only: [0.95, 0.96, 0.97] (supersedes)

**Decision:** `MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` no longer speeds any shot
up. Was `[0.96, 0.97, 1.04, 1.07]`.

**Why:** a shot running fast fights the slower pacing, and speed decides how much
source a shot consumes (`slot * speed`), so a slow-only set runs LESS far into
the footage after each shot — which gives the continuity invariant more room
rather than less.

**Why not 0.94, which was proposed:** it is the one value in the old set that
reads as deliberate slow motion rather than as nothing in particular (recorded
when the set was narrowed earlier today). In a mixed set of four it was an
outlier; in a slow-only set of three it would land on a third of the shots.

**Rejected, and this is the one worth keeping: "slow a shot only if it needs
it".** That is DERIVED speed, which is exactly the design the 2026-09-16
inversion replaced, and for exactly the recorded reason — the trim and
freeze-pad branches both play at 1.0, so deriving leaves most shots at the
source's own speed and the transform stops contributing to de-fingerprinting.

What the request was after already exists and is a different mechanism: the
speed **ramp**, which slows a clip to fill its slot when the gap is small
(`SPEED_RAMP_MIN/MAX`, 0.85-1.15). The two are named apart now to stop them
being merged again — **fill-speed** is derived and fills a gap; **transform-speed**
is an input and de-fingerprints. A ramped shot is not playing at 1.0 either, so
"no shot ever plays at the source's own speed" survives both.

## 2026-09-17 — Three frames per scene on 9:16, so the vision pass can describe an EVENT

**The limit, and it was never the prompt:** `extractKeyframes` took ONE still per
scene and the vision prompt asked for one sentence about it. A single frame
cannot show an event. "Two men argue across a table" is a frame; "he draws and
she runs for the door" is a change over time, and a fast-cut recap is mostly made
of the second kind. Wording the prompt harder could only ever get a richer
description of one moment.

**Decision:** `keyframesPerScene` joins MOVIE_RECAP_PACING — **3 on 9:16, 1 on
16:9**. The model is shown a scene's frames in order and asked what CHANGES
across them, not to describe each one.

**9:16 only is the user's call, not a technical boundary.** Nothing about
describing an event properly is format-specific; if it proves out on a reel it
should come to 16:9 too. Recorded so the asymmetry is not later mistaken for a
reasoned one.

**Cost is not tokens.** Frames go at `detail: "low"`, ~19 prompt tokens each, so
300 scenes x 3 is ~17k tokens. What it actually costs is ffmpeg extraction time
(three seeks per scene instead of one) and request size — `VISION_BATCH` is
counted in SCENES now (8) rather than frames (25), which keeps ~24 images per
request exactly as before.

**The coupling this would have broken, and what was done about it:** a shot plays
the moment its scene was DESCRIBED from (2026-09-17) — `focusWindow` anchors on
`KEYFRAME_FRACTION`, a fixed third. That constant only means anything while
there is exactly one frame. With three, there is no single described moment and
the anchor would have been silently wrong for every 9:16 shot.

So the model now returns **`peakFrame`** alongside the sentence: which frame
carries the thing it described. That becomes the scene's `keyframeFraction`,
which rides on `SourceWindow` through the planner into `focusWindow`. This is
strictly better than the old fixed third even at one frame, because the moment
is chosen rather than assumed — the "main part is cut out" bug that produced the
original rule came from exactly that assumption.

**Fallbacks, both deliberate:**

- A window the planner INVENTED — a sub-split piece, a separated pair — has no
  described moment and falls back to `KEYFRAME_FRACTION`. It is not a scene the
  vision pass ever saw, so there is nothing better to use.
- An out-of-range `peakFrame` falls back to the MIDDLE frame, not the last. It
  means the model lost count, not that it meant the end — the same reasoning as
  the out-of-range scene indexes in the narration pass, which are dropped rather
  than clamped.

**`SINGLE_KEYFRAME_FRACTION` is exported and tested at exactly 1/3.** The even
spread used for several frames is `(i + 0.5) / count`, which would give 0.5 for
one — tidier, and wrong. One frame keeps the third, because that value is
recorded, load-bearing and unchanged for 16:9. The test exists to stop the
tidying.

**Unchanged, and still for their original reasons:** no names, no mood, no
guessing at off-screen events. The narration model is the one that interprets; a
vision pass that speculates feeds it invented plot.

## 2026-09-18 — Longer 9:16 lines, and captions are cut with the picture

**Reported by the user, off a real render:**
"အဘွားကိုအလုပ်ခေါ်လာတဲ့ကောင်မလေးက အခြေနေကိုရှင်းပြရတယ်တဲ့" — awkward. Diagnosed
first as grammar (hearsay တဲ့, obligation ရ, a stacked pre-modifier) and
corrected by the user: **the problem is over-compression, not grammar.**

**Decision 1: 9:16 `lineChars` 25-45 (max 50) -> 40-70 (max 80).** At 40
characters a line has to carry who someone is, what they did and what they are
doing now, and the only way to fit that in Burmese is to stack it all into one
clause before the verb. That IS the awkward phrasing — it is what the budget
forces, so no amount of register wording fixes it.

**It costs nothing in pacing, which is why this is cheap on 9:16 specifically.**
A longer beat buys MORE cuts there, because `minShotS` is 1.5: a 45-character
line is ~3.5s and 2 shots, a 70-character one is ~5.5s and 3. The video gets
longer overall, which the user has said does not matter — a reel that runs long
is trimmed by hand.

**No grammar bans were added.** They were drafted (no sentence-final တဲ့, no ရ
obligation) and dropped once the cause turned out to be the budget. The
2026-09-16 decision — role framing instead of a grammar checklist — stands
untouched, and re-adding bans would have "fixed" a symptom while leaving the
line still trying to say three things in forty characters.

**Decision 2: one caption cue per SHOT.** The chunks that size a beat are split
on readability (`MAX_CUE_CHARS`) and their boundaries have nothing to do with
where the picture cuts, so one caption could sit across two or three shots. At
40-character lines that was survivable; at 70 it reads as a wall of text parked
over a sequence of cuts.

After planning, the line is re-divided into as many balanced pieces as the beat
has shots (`splitIntoNChunks`) and each cue is held for exactly its shot.
`spreadCuesOverShots` handles the case where it cannot divide that finely —
Burmese is written with spaces between phrases rather than every word, so a
short line can be one indivisible token. The extra shots go to the LONGEST
pieces, so a two-word chunk is never left up across three cuts.

**Beat length is still sized by the readability chunks, before planning.** That
is deliberate and not a leftover: subtitles decide the beat's length
(2026-09-15), and re-chunking after the fact must not feed back into it or the
two would chase each other.

**Consequence:** a cue's duration is now its shot's slot rather than its own
reading time. Slots within a beat are equal and the pieces are balanced by
length, so these are close — but a cue is no longer individually checked against
`MAX_CUE_CHARS_PER_SECOND`. The beat as a whole still is, upstream.

**Bug found and fixed on the way: the caption timeline drifted earlier by
`BEAT_GAP_S` every beat.** `cursor` advanced by the sum of the cue durations
(`timed.segmentS * stretch`), while the video advanced by `slotS * shotCount`,
which is `targetS` — and `targetS` includes the 0.15s breath between beats. So
every beat started its captions 0.15s before its picture, cumulatively: ~4.5s
out by beat 30 of a real render. The new path advances `cursor` by exactly
`slotS * shotCount`, so it cannot drift by construction. Mock renders were never
affected — `gapS` is 0 there.

## 2026-09-18 — 9:16 renders at 1080×1920; 16:9 stays at 720p

**Decision:** `MOVIE_RECAP_TARGET_DIMENSIONS["9:16"]` is `[1080, 1920]`, was
`[720, 1280]`. 16:9 is untouched at `[1280, 720]`.

**Why now, and only for 9:16:** the user moved from test-rendering reels to
publishing them. TikTok, Facebook and Reels all re-encode whatever they are
given, so a 720-wide source means their compression starts from an already-soft
picture. It shows worst on the burned Burmese captions — the caption-size entry
already recorded 720p as below the comfortable floor for Burmese, with stacked
marks closing into the letter and the outline doing most of the separating. 16:9
has still never been rendered at length and is a draft config; raise it when it
is actually being published.

**Cost is encode time, ~2.25x the pixels. Nothing else had to change** — every
size in the pipeline is a percentage of the frame (caption size, logo box and
margin, blur REGION geometry, subtitle offset), so they all scale by
construction.

**Except the two blur RADII, which are pixels, and this is the part worth
reading.** `MOVIE_RECAP_BLUR.radius` (region blur) and
`backfillBlurRadius` (letterbox fill) are absolute `boxblur` values. A fixed
radius blurs relatively LESS on a bigger frame, so a region blur that hid a
watermark at 720 would stop hiding it at 1080. That is a correctness bug, not a
cosmetic one, which is why they now scale with the output width.

**`BLUR_REFERENCE_WIDTH` is PER RATIO — 1280 for 16:9, 720 for 9:16 — and the
first attempt got this wrong.** A single shared reference of 720 was written
first; it scaled the 16:9 backfill from 20 to 36 as a side effect, silently
changing a ratio this change was supposed to leave alone. The transform test
caught it. Anchoring each ratio to the width its own radius was tuned at is what
keeps 16:9 byte-identical while 9:16 moves by 1.5x (20 -> 30, 12 -> 18).

**The preview converts from the RENDER's radius, not the reference one.**
`movieRecapBlurCssPx` takes the aspect ratio rather than a width now, and calls
the same scaling function the render does — otherwise the CSS preview and the
burned output drift apart the next time a resolution moves.

## 2026-09-18 — The last words were being cut off: frame rounding, then `-shortest`

**Bug:** a finished recap ended one or two words early. Everything up to the
final clip was fine; the picture ran out while the voice-over was still talking.

**Cause, in two parts.** Each shot is cut with `-t slot` and then resampled to
`MOVIE_RECAP_TARGET_FPS`, so what comes out is a whole number of frames — up to
33ms short of its slot, always short, never long. The narration track is padded
to `beatDurations`, which are those same slots as exact floats. So the audio was
genuinely longer than the picture, by roughly a frame per shot: about a second
over sixty shots. The final mux then passed `-shortest`, which resolved that
mismatch by truncating the audio. The last beat deliberately gets no
`BEAT_GAP_S` (a recap should not end on dead air — 2026-09-16), so it had no
slack to absorb the loss and the cut landed on its closing words.

**Fix, also two parts.**

- `slotS` is rounded onto the frame grid before anything uses it. The cut, the
  caption cues and the narration padding all read that one number, so the three
  stay on a single timeline instead of drifting apart. This is the part that
  matters: without it the captions drifted off the cuts by the same amount, in
  the same direction, whether or not the tail was fixed.
- The final pass probes the concatenated picture and the narration track and
  holds the last frame for the difference (`tpad` at the head of the overlay
  chain, so the held frame gets the same blur and logo). `-shortest` then trims
  that pad back off at the last spoken sample.

**Why the pad stays even with the rounding fix.** The rounding is what ffmpeg
*should* do with an on-grid `-t`, not a guarantee; a boundary frame either way
would put us back to silently truncating speech. The pad costs one ffprobe of a
local file and makes "the audio is never cut" true by construction rather than
by arithmetic.

**Consequence worth knowing:** the output is now exactly as long as the
narration, not as long as the sum of the beats. A render log line reports the
gap it covered — a large one there means the segment cutting has drifted for
some other reason and is worth chasing.

## 2026-09-18 — An edited script can be re-rendered without re-reading the source

**Problem:** the only way to fix one awkward narration line was to render the
whole project again — and a full render calls the script model again, so it came
back with a *different* script. The lines that were fine were rerolled along
with the one that was not. `render_script` was already written to the row, but
nothing ever read it back: no route, no UI.

**Decision: the script is the editable artefact of a render.** Step 4 lists the
beats, each line editable, with "Re-render this script". A re-render skips scene
detection, the vision pass, subtitle-reading/Whisper and the script model, and
runs TTS and ffmpeg on the words as written.

**Only the TEXT is editable.** The shot list under a beat is the planner's
output, timed against the source, and the browser has no way to judge it. PATCH
takes the text and keeps the stored shots, and rejects a script with a different
number of beats — dropping a beat would strand its footage with nothing to say
over it. Like `hookTitle`, this does not set `changesConfiguration`: re-rendering
the script is the point, not a reason to demote an approved project to draft.

**The analysis goes to R2, not a column.** The planner needs three things the
script does not carry: the spare scenes it may borrow from, the source's own
cuts, and the motion track. The motion track alone is one value per 0.25s of
source — hundreds of kilobytes for a feature — and the project row is re-read
every two seconds while a render runs, so a jsonb column would ride along on
every poll. The row stores `render_analysis_key`; values are rounded to two
decimals, which is far past what the planner can act on and roughly halves it.

**Written before the cut, not after.** The analysis and the script both land on
the row as soon as the script exists. A render that dies while cutting has
already paid for the vision pass and the script model; losing the words it
bought would mean buying them twice.

**Rejected: caching the transcript and scene descriptions too.** Nothing
downstream of the script reads them — they exist to write the script, and a
re-render does not write one. Storing them would be for a per-beat re-roll,
which is not built. Revisit when it is.

**Consequence:** a re-render still downloads the source (ffmpeg cuts every shot
from it) and still pays for TTS (the words changed). It is not free, just free
of the analysis. A missing or unreadable analysis blob fails the re-render with
"render again from the source" rather than planning against nothing.

**Deferred (2026-09-18): rebuilding a missing analysis from detection alone.**
Projects rendered before this existed have no analysis, so their stored script
cannot be re-rendered until one full render runs — which writes a new script and
discards the wording the user may have wanted to keep. A re-render could instead
re-run scene detection only (cuts and motion come straight from it, and spares
are the detected scenes no beat overlaps), costing one detection pass and no AI.
Not built: it only helps projects that predate the feature, and those spares
would carry no `keyframeFraction`, so borrowed footage would fall back to the
fixed one-third cut point. Build it if pre-existing projects turn out to matter.

## 2026-09-18 — Hook titles removed entirely

**Decision (user, overriding the 2026-09-17 entry above): hook titles are gone
— prompt, model call, render stage, columns and UI.** They were not useful in
practice. Nothing downstream consumed them: they were five strings shown in the
Review tab and copied out by hand, which is work the user was already doing
somewhere else with better context than the narration alone gives.

**What survives from the superseded entry:** the thumbnail removal. The
source-frame thumbnail is still gone and is not coming back — hook titles were
its replacement, not its justification.

**Columns dropped, not orphaned.** `hook_titles` and `hook_title` are gone from
the schema. Keeping them would have left two columns nothing writes and nothing
reads, and the only data in them was regenerable by rendering — which the render
no longer does.

**Consequence:** the `writing_hook_titles` render stage is gone with them, so
the Publish step of the progress stepper is now `uploading` alone, and a render
ends at the upload. One fewer GPT call per render.

## 2026-09-18 — The "Generate Recap Video" button is removed

**Decision:** it is gone, with its `ready_for_generation` toast. Phase two
shipped: the render buttons below it do the work, and a button promising a video
that only flipped a status column was a lie the UI told on every visit.

Its one visible effect was the green "Ready" badge on the project list card.
That badge now reads `renderStatus === "done"` and says "Rendered" — a project is
worth flagging when it has a video, not when its settings were approved by a
button nothing downstream consults.

**Kept:** the `status` column, its PATCH validation, and the `changesConfiguration`
demotion. Nothing sets `ready_for_generation` any more, so the demotion is inert,
but dropping a column is not undoable and this one costs nothing to leave. Drop
it if a later change needs the space.

## 2026-09-18 — "Render AI Preview" asks before it spends

**Decision:** the full render is behind a `ConfirmDialog`. It is the one button
here that both costs real money (vision pass, transcription, the script model,
TTS) and destroys work: it writes a NEW narration script over `render_script`,
so any hand edits go with it, and it replaces the output video.

The wording changes with the project: a first render is described as cost and
time, a re-render leads with what it overwrites.

"Re-render this script" confirms too, for the two things that are not obvious
from the button: TTS is re-synthesized for every beat, not just the edited ones,
and the current video is replaced. The mock stays unconfirmed — it spends
nothing.

**Trap:** both handlers are written `() => { run(); }` rather than `run`, which
looks like pointless indirection and is not. GeckoUI keeps the dialog open with
a loading button for as long as `onConfirm` returns a promise, and the render
request stays open for the whole pipeline — that would put a modal over the
progress bar for minutes. The render button does its own loading state, so the
dialog closes the moment it is confirmed.

## 2026-09-18 — The customize preview's controls move outside the picture

**Superseded:** the note that the native control bar was hidden because it sits
along the bottom of the frame, exactly where the subtitle renders, leaving a
corner play/pause badge as all a design preview needs. The badge had the same
problem in miniature — it was chrome drawn over the thing being designed — and a
design preview does need to reach a specific moment in the source, which
play/pause alone cannot do.

**Decision:** the frame holds the picture and the design layers only — video,
subtitle sample, logo, blur rectangle. Play/pause, a seek slider and a time
readout sit in a row underneath it, inside the same bordered box. The frame is
wrapped in a shrink-to-fit column so the control row is exactly as wide as the
frame: narrow under 9:16, 620px under 16:9.

**Rejected: a player library** (Plyr, Video.js, Vidstack). They wrap the video in
a container they own and draw their chrome inside it, which is the one place
nothing may be drawn here — and the CSS transform and filter that mirror the
ffmpeg chain have to stay on the video element itself, under three overlay
layers. Stripping their UI and pulling the scrubber out of their container is
more work than the state this needs. `media-chrome` is the one that would fit if
richer playback is ever wanted, since its parts can be composed outside the
picture; the finished-render player in step 4 is where it would earn its keep.

**Trap:** `timeupdate` fights the slider while it is being dragged. A ref
suppresses the update between pointer down and pointer up, so the thumb follows
the pointer rather than snapping back to where playback has reached.

## 2026-09-18 — The source preview waits for the upload to finish

**Decision:** step 1 plays the video only when `sourceUploadStatus` is `ready`.
While an upload is running, or after one that did not finish, the panel shows the
filename and says why there is nothing to play.

**Why:** it used to play the local blob the moment a file was chosen, which reads
as "done" while a multi-gigabyte multipart upload is still climbing. The progress
bar underneath said otherwise, and the picture won.

**The blob is still what plays.** It is preferred over the R2 URL once the upload
is ready, so the preview is instant and costs no download. Only the moment it
appears changed.

**Consequence:** reopening a project whose upload was interrupted shows the
placeholder rather than a player, next to the existing "Reselect the same local
file to continue this upload" prompt. That is the honest state — R2 holds parts,
not a playable object.

**Bug fixed with it (2026-09-18):** step 3 showed a black frame until the page
was reloaded. `MovieRecapSource` revoked the local blob URL on its own unmount,
which is exactly when step 1 is left — so the URL it had just handed up to the
wizard was dead before step 3 rendered it. A reload cleared the wizard's copy,
fell back to the R2 URL, and the picture came back, which is what made it look
like a loading problem rather than a lifetime one. The wizard owns the URL now
and revokes it when it is replaced or when the wizard itself unmounts.

## 2026-09-18 — Deleting a project deletes everything under its prefix

**Bug:** deleting a project removed the source object and the logo, and left
everything the renders had written. The finished video, its subtitles, the
analysis blob, and — worse — every SUPERSEDED render output, since each render
writes a new UUID key and only re-points the row. A project rendered ten times
left ten videos in the bucket, nine of them already unreachable before the
delete.

**Cause:** the cleanup deleted the keys the ROW holds. Most of a project's
objects are not in any column.

**Fix:** delete by prefix. Every object a project can own lives under
`movie-recaps/<id>/`, so `deletePrefix()` lists and removes the lot, paginated,
and cannot miss a kind of object added later — a new `kind` in
`movieRecapObjectKey` is cleaned up without touching this code.

**Order is unchanged and deliberate:** storage first, row second. A storage
failure returns 502 with the row intact, so the project can be deleted again.
The reverse would drop the row and strand the files with nothing left pointing
at them.

**Not fixed here:** a render still leaves its predecessor in the bucket while the
project lives. Deleting the old output on each successful render is the obvious
follow-up and is the real cost driver now that re-rendering from an edited
script is cheap.
