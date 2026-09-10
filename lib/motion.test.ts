import { describe, expect, it } from "vitest";
import { resolveMotionMode, hasDialogLine } from "./motion";
import { resolveMotionText, DEFAULT_MOTION_STYLE_ID, MOTION_STYLES } from "./constants/motion-styles";

describe("resolveMotionMode", () => {
  it("takes the model's mode when the style allows it", () => {
    expect(resolveMotionMode("normal", "She walks to the gate.", "sacred-cinematic")).toBe("normal");
    expect(resolveMotionMode("emotional", "Her expression changes.", "sacred-cinematic")).toBe("emotional");
  });

  it("falls back to the style's default for an unknown mode", () => {
    expect(resolveMotionMode("cinematic", "She waits.", "sacred-cinematic")).toBe("micro");
    expect(resolveMotionMode(null, "She waits.", "natural")).toBe("normal");
  });

  it("forces dialogue when the video prompt quotes a spoken line", () => {
    const prompt = 'The monk speaks, in Burmese Dialog: "သတိရှိပါ"';
    expect(resolveMotionMode("micro", prompt, "sacred-cinematic")).toBe("dialogue");
  });

  it("downgrades a dialogue tag with no line to speak", () => {
    expect(resolveMotionMode("dialogue", "He watches the road.", "sacred-cinematic")).toBe("micro");
    expect(resolveMotionMode("dialogue", null, "natural")).toBe("normal");
  });

  it("treats an unresolvable style id as the default style", () => {
    expect(resolveMotionMode("dialogue", "He waits.", "deleted-style")).toBe("normal");
  });
});

describe("hasDialogLine", () => {
  it("matches the prompt's mandated quoting format", () => {
    expect(hasDialogLine('in English Dialog: "Come inside."')).toBe(true);
    expect(hasDialogLine("in Burmese Dialog: “လာပါ”")).toBe(true);
    expect(hasDialogLine("He gestures toward the dialog on the wall.")).toBe(false);
  });
});

describe("resolveMotionText", () => {
  it("returns the style's default text for a shot with no mode", () => {
    expect(resolveMotionText("sacred-cinematic", null)).toContain("Micro-motion only");
    expect(resolveMotionText("natural", null)).toContain("One primary action");
  });

  it("never returns another style's wording", () => {
    for (const style of MOTION_STYLES) {
      for (const mode of style.allowedModes) {
        expect(resolveMotionText(style.id, mode)).toBe(style.text[mode]);
      }
    }
  });

  it("falls back to the default style, not array position", () => {
    expect(resolveMotionText("nope", "micro")).toBe(
      MOTION_STYLES.find((s) => s.id === DEFAULT_MOTION_STYLE_ID)!.text.micro
    );
  });
});
