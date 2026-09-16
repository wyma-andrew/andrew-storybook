# Movie Recap voice assets

`<voice-id>.mp3` is the preview clip the Settings tab plays for that voice. The
files are generated from the voice catalog (`lib/tts/voices.ts`) — each one is
that voice speaking its own `sampleText` — so don't record or edit them by hand:

```bash
node --experimental-strip-types --env-file=.env scripts/generate-voice-previews.ts
```

Rerun that after changing a voice's `sampleText` or `params`, or after adding an
Azure voice. Nothing checks that a file matches the catalog, so a stale clip just
keeps playing the old reading.

A voice with no file here falls back to `POST voices/preview`, which synthesizes
on demand.
