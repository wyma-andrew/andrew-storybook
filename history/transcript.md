# Transcript

Covers: `app/(app)/(transcript)/**`, `app/api/(transcript)/**`,
`components/transcript/**`, `lib/transcript-*.ts`, `workers/whisper-mm/**`,
and the `transcript_projects` migration.

## 2026-11-13 — whisper-mm takes an optional `language` query

**Decision:** the worker reads `?language=`; absent means `my`, so this feature
is unchanged, and `auto` lets Whisper detect the language. Movie Recap's
"Other language" read sends `auto` (see history/movie-recap.md, same date). The
response's `language` is now the detected or requested one, not always `my`.

**Consequence:** the deployed worker must be redeployed (`modal deploy
workers/whisper-mm/modal_app.py`) before Movie Recap's Other read works; an old
deployment ignores the query and transcribes as Burmese.

**Trap:** the image no longer sets `XDG_CACHE_HOME=/cache`. With it, the
redeploy failed at container start with "cannot mount volume on non-empty path:
/cache" — something in the image build wrote there. The model already loads
with `download_root` under the volume, so nothing else needed that variable.

## 2026-11-05 — The poller reads progress columns, not the whole row

**Decision, approved by the user:** the editor's tick reads
`GET transcript-projects/:id/progress` every 10 seconds, down from the full row
every 2. When the job leaves `running` it fetches the full row once and adopts it.
A tick that finds the row orphaned by `TRANSCRIPT_STALE_JOB_MS` stops the timer.

**Why:** Fast Origin Transfer; see `history/recap-v2.md` 2026-11-05 for the usage
numbers. The full row carries `transcript_text`, including the previous transcript
during "Transcribe again".

**Consequences:** the stage label can lag by up to 10 seconds. The button stays
"Transcribing…" after the timer stops on an orphaned row, until a reload.

## 2026-10-09 — Burmese video to plain text, on Whisper large-v3 (Modal)

**Decision, by the user:** a separate "Transcript" menu: upload a Burmese
video, press Transcribe, read the result in a Transcript tab. Output is plain
text only — no timestamps, no SRT.

**Model, by the user:** Whisper `large-v3` self-hosted on Modal
(`workers/whisper-mm`), chosen over OpenAI `gpt-4o-transcribe` and `whisper-1`
to keep OpenAI spend at zero. FunASR (the existing worker) is Mandarin-only.

- `large-v3`, not `turbo`: turbo loses the most accuracy on low-resource
  languages, and Burmese is one. Expect errors on names and colloquial speech;
  that was accepted with the model choice.
- `language="my"` is fixed; detection is skipped. `condition_on_previous_text`
  is off, as in the earlier Whisper worker (history/movie-recap.md, 2026-10-01):
  conditioning on its own output is how one invented line repeats across a
  quiet stretch. `dropUnreliableSegments` drops Whisper's low-confidence and
  repetition-loop segments.
- Same Modal sizing as the other workers (T4, one container, short scaledown)
  to stay inside the $30 credit.
- Segments are joined into running text; a ≥2s pause starts a new paragraph.
- Gated by `movie_recap`, like Recap V2 and Video Cutter.
- `maxDuration` 300 is committed; a long video needs the local 3600 override.
