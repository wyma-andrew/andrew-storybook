// Renders each Azure voice's own sample line to a static file under
// `public/movie-recap/voices/`, so the wizard's play button costs nothing at
// runtime. Run it after changing a voice's `sampleText`, its `params`, or after
// adding an Azure voice to the catalog:
//
//   node --experimental-strip-types --env-file=.env scripts/generate-voice-previews.ts
//
// Only voices whose `previewUrl` points at a file this script writes are worth
// regenerating; the self-hosted VoxCPM2 voices are not synthesized here because
// the lab is where those are evaluated.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSsml } from "../lib/tts/ssml.ts";
import { VOICES } from "../lib/tts/voices.ts";

// MP3 rather than the WAV the render pipeline asks for: this file ships in the
// repo and is only ever played in a browser, so size wins over being readable
// without a decoder.
const OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";
const OUT_DIR = path.join(process.cwd(), "public", "movie-recap", "voices");

const key = process.env.TTS_AZURE_KEY?.trim();
const region = process.env.TTS_AZURE_REGION?.trim();
if (!key || !region) {
  console.error("Set TTS_AZURE_KEY and TTS_AZURE_REGION (pass --env-file=.env).");
  process.exit(1);
}

const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
await mkdir(OUT_DIR, { recursive: true });

for (const voice of VOICES) {
  if (voice.providerId !== "azure") continue;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml; charset=utf-8",
      "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
      "User-Agent": "ai-storybook",
    },
    body: buildSsml(voice.params, voice.sampleText),
  });
  if (!response.ok) {
    console.error(`${voice.id}: Azure returned ${response.status}. ${await response.text().catch(() => "")}`);
    process.exit(1);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  const file = path.join(OUT_DIR, `${voice.id}.mp3`);
  await writeFile(file, audio);
  console.log(`${voice.id} -> ${path.relative(process.cwd(), file)} (${(audio.length / 1024).toFixed(1)} KB)`);
}
