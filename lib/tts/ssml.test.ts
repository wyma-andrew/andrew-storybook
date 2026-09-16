import { describe, expect, it } from "vitest";
import { buildSsml } from "./ssml";

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
