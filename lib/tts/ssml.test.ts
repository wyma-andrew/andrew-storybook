import { describe, expect, it } from "vitest";
import { buildSsml } from "./ssml";
import { VOICES } from "./voices";

const thiha = { voiceName: "my-MM-ThihaNeural" };

describe("buildSsml", () => {
  it("uses the lowercase synthesis namespace", () => {
    // Azure rejects `.../2001/10/Synthesis` with a bodyless 400 that names no
    // cause, so this one character is worth a test.
    expect(buildSsml(thiha, "hello")).toContain('xmlns="http://www.w3.org/2001/10/synthesis"');
    expect(buildSsml(thiha, "hello")).not.toContain("Synthesis");
  });

  it("names the voice and the Burmese locale", () => {
    const ssml = buildSsml(thiha, "မင်္ဂလာပါ");
    expect(ssml).toContain('xml:lang="my-MM"');
    expect(ssml).toContain('<voice name="my-MM-ThihaNeural">');
    expect(ssml).toContain("မင်္ဂလာပါ");
  });

  it("escapes text that would otherwise break the envelope", () => {
    expect(buildSsml(thiha, 'a & b <c> "d"')).toContain("a &amp; b &lt;c&gt; &quot;d&quot;");
  });

  it("only emits prosody when a voice asks for it", () => {
    expect(buildSsml(thiha, "hello")).not.toContain("<prosody");
    expect(buildSsml({ ...thiha, rate: "-8%" }, "hello")).toContain('<prosody rate="-8%">hello</prosody>');
  });
});

describe("the Movie Recap voices' delivery rate", () => {
  it("speaks both Azure voices faster than Azure's default", () => {
    // The rate is not cosmetic: beat durations are MEASURED from the synthesized
    // audio, so losing it silently makes every future render longer and slower
    // than the one before it, with nothing failing to say so.
    const azure = VOICES.filter((voice) => voice.providerId === "azure");
    expect(azure.length).toBeGreaterThan(0);
    for (const voice of azure) {
      expect(voice.params.rate).toBe("+15%");
      expect(buildSsml(voice.params, "hello")).toContain(`<prosody rate="+15%">`);
    }
  });

  it("speaks them at the SAME rate", () => {
    // Switching voice must not change the export's length as a side effect.
    const rates = new Set(VOICES.filter((v) => v.providerId === "azure").map((v) => v.params.rate));
    expect(rates.size).toBe(1);
  });
});
