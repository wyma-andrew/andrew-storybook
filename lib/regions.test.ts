import { describe, expect, it } from "vitest";
import { REGIONS, isRegion } from "./constants/regions";
import { VISUAL_STYLES, resolveStyleContext } from "./constants/visual-styles";
import { extractAssetsSystemPrompt } from "./prompts/extract-assets";
import { regenerateAssetSystemPrompt } from "./prompts/regenerate-asset";
import { storyboardSystemPrompt } from "./prompts/storyboard";
import { withAssetContext } from "./prompt-copy";

const BUDDHA_HEADING = "BUDDHA-ERA VISUAL ADAPTATION";
const MYANMAR_HEADING = "MYANMAR VISUAL ADAPTATION";

describe("story regions", () => {
  it("recognizes and lists Buddha as a supported region", () => {
    expect(isRegion("buddha")).toBe(true);
    expect(REGIONS).toContainEqual({ value: "buddha", label: "Buddha" });
    expect(isRegion("unsupported")).toBe(false);
  });

  it("injects Buddha-era guidance into every visual generation prompt", () => {
    expect(extractAssetsSystemPrompt(null, "buddha")).toContain(BUDDHA_HEADING);
    expect(regenerateAssetSystemPrompt("character", null, "buddha")).toContain(BUDDHA_HEADING);
    expect(storyboardSystemPrompt(null, "16:9", "buddha")).toContain(BUDDHA_HEADING);
  });

  it("keeps the three adaptation modes isolated", () => {
    const english = extractAssetsSystemPrompt(null, "english");
    const myanmar = extractAssetsSystemPrompt(null, "myanmar");
    const buddha = extractAssetsSystemPrompt(null, "buddha");

    expect(english).not.toContain(MYANMAR_HEADING);
    expect(english).not.toContain(BUDDHA_HEADING);
    expect(myanmar).toContain(MYANMAR_HEADING);
    expect(myanmar).not.toContain(BUDDHA_HEADING);
    expect(buddha).toContain(BUDDHA_HEADING);
    expect(buddha).not.toContain(MYANMAR_HEADING);
  });

  it("gives every visual style an explicit Buddha variant", () => {
    for (const style of VISUAL_STYLES) {
      expect(style.text.buddha).toBeDefined();
      expect(resolveStyleContext("buddha", style.id)).toBeTruthy();
    }
  });

  it("makes the Buddha recognizable without assigning his marks to every monk", () => {
    const prompt = extractAssetsSystemPrompt(null, "buddha");

    expect(prompt).toContain("KNOWN IDENTITY: Siddhartha Gautama (Gautama Buddha)");
    expect(prompt).toContain("never rename the extracted asset");
    expect(prompt).toContain("ushnisha-shaped cranial prominence");
    expect(prompt).toContain("subtle urna centered between the brows");
    expect(prompt).toContain("elongated earlobes");
    expect(prompt).toContain("Do not give the Buddha's ushnisha, urna, canonical curls, or halo to disciples or ordinary monks");
    expect(prompt).toContain("Do not describe him with a receding hairline");
  });

  it("keeps the script name while allowing canonical identity context", () => {
    const prompt = extractAssetsSystemPrompt(null, "english");

    expect(prompt).toContain("CHARACTER: <exact name from the script>");
    expect(prompt).toContain("KNOWN IDENTITY: <established real or canonical name in English");
    expect(prompt).toContain("must never replace or translate CHARACTER or the extracted asset name");
  });

  it("keeps Buddha's Mythic style South Asian and adds one Style marker at copy time", () => {
    const style = resolveStyleContext("buddha", "mythic-fantasy-painting");

    expect(style).toContain("sacred ancient South Asian Buddha-era aesthetic");
    expect(style).toContain("clearly stylized and non-photorealistic");
    expect(style).toContain("avoid live-action realism and photographic appearance");
    expect(style).not.toContain("Hyper-realistic");
    expect(style).not.toContain("Southeast Asian");
    expect(style).not.toContain("[Style]");

    const copied = withAssetContext("CHARACTER: Buddha", "Character reference sheet", style);
    expect(copied.match(/\[Style\]/g)).toHaveLength(1);
  });
});
