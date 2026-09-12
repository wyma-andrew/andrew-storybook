import { describe, expect, it } from "vitest";
import { withAssetContext, withFrameDescription, withStyle } from "./prompt-copy";

describe("withStyle", () => {
  it("orders shot content, then style, then lighting, then framing", () => {
    expect(
      withStyle("Nori turns toward the doorway.", "3D animation", "late afternoon sun, warm", "shallow depth of field")
    ).toBe(
      [
        "Nori turns toward the doorway.",
        "[Style] 3D animation",
        "[Lighting] late afternoon sun, warm",
        "[Framing] shallow depth of field",
      ].join("\n\n")
    );
  });

  it("omits the tags it has no value for", () => {
    expect(withStyle("Nori turns.", null, null)).toBe("Nori turns.");
    expect(withStyle("Nori turns.", "3D animation")).toBe("Nori turns.\n\n[Style] 3D animation");
  });
});

describe("withAssetContext", () => {
  it("keeps style ahead of the reference-sheet preset and the entity's facts", () => {
    expect(withAssetContext("CHARACTER: Nori", "Reference sheet, neutral background", "3D animation")).toBe(
      "[Style] 3D animation\n\nReference sheet, neutral background\n\nCHARACTER: Nori"
    );
  });
});

describe("withFrameDescription", () => {
  it("keeps the video prompt next to its frame, then style, lighting, motion", () => {
    expect(
      withFrameDescription(
        "She steps forward.",
        "Nori at the doorway.",
        "3D animation",
        "Hold the camera still.",
        "lamp light, warm",
        "shallow depth of field"
      )
    ).toBe(
      [
        "Nori at the doorway.",
        "She steps forward.",
        "[Style] 3D animation",
        "[Lighting] lamp light, warm",
        "[Framing] shallow depth of field",
        "Hold the camera still.",
      ].join("\n\n")
    );
  });

  it("still composes when the story has no lighting or motion text", () => {
    expect(withFrameDescription("She steps forward.", "Nori at the doorway.", null, null, null, null)).toBe(
      "Nori at the doorway.\n\nShe steps forward."
    );
  });
});
