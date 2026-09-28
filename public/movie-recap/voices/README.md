# Movie Recap voice assets

`<voice-id>.mp3` is an Azure preview clip generated from the voice catalog
(`lib/tts/voices.ts`). `waiyan-reference.wav` and `yuzana-reference.wav` are the
user-provided recordings used as static previews and VoxCPM2 reference sources.
The static profile preview buttons play these files directly; they do not call
the model.

Regenerate Azure clips after changing their `sampleText` or `params`, or after
adding an Azure voice:

```bash
node --experimental-strip-types --env-file=.env scripts/generate-voice-previews.ts
```

Nothing checks that an Azure file matches the catalog, so a stale clip keeps
playing the old reading.
