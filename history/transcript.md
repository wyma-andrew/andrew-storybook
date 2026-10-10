# Transcript

Covers: `app/(app)/(transcript)/**`, `app/api/(transcript)/**`,
`components/transcript/**`, `lib/transcript-*.ts`, `workers/whisper-mm/**`,
and the `transcript_projects` migration.

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
