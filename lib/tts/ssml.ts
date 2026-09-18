import type { AzureVoiceParams } from "./types";

// Burmese. Azure requires a locale on the SSML root even though the voice
// already implies one.
const LOCALE = "my-MM";

function escapeSsml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Kept in its own module with no runtime imports so the preview-generation
// script can reuse it under `node --experimental-strip-types`, which cannot
// resolve the extensionless imports the app code uses.
//
// Azure answers a malformed envelope with a 400 and an EMPTY body, which looks
// identical to a bad voice name, a bad output format, or a bad key — so this is
// the part of the request worth testing (see lib/tts/ssml.test.ts).
export function buildSsml({ voiceName, rate, pitch }: AzureVoiceParams, text: string) {
  const prosodyAttrs = [rate ? `rate="${rate}"` : "", pitch ? `pitch="${pitch}"` : ""].filter(Boolean).join(" ");
  const spoken = escapeSsml(text.trim());
  return (
    // The namespace is lowercase `synthesis`. Capitalising the S is exactly the
    // 400 described above.
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE}">` +
    `<voice name="${voiceName}">` +
    (prosodyAttrs ? `<prosody ${prosodyAttrs}>${spoken}</prosody>` : spoken) +
    `</voice></speak>`
  );
}
