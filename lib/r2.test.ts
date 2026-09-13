import { describe, expect, it } from "vitest";
import { nextFreeName, naturalCompare } from "./r2";

const CH = "ch1";

describe("nextFreeName", () => {
  it("keeps the file's own name when nothing has claimed it", () => {
    expect(nextFreeName(CH, "1.2.png", new Set())).toEqual({
      displayName: "1.2.png",
      objectKey: "chapters/ch1/1.2.png",
    });
  });

  it("counts up instead of overwriting an existing name", () => {
    const taken = new Set(["chapters/ch1/1.2.png"]);
    expect(nextFreeName(CH, "1.2.png", taken).displayName).toBe("1.2-2.png");
    // and again, now that -2 is taken too
    expect(nextFreeName(CH, "1.2.png", taken).displayName).toBe("1.2-3.png");
  });

  it("separates two same-named files inside one batch", () => {
    const taken = new Set<string>();
    const a = nextFreeName(CH, "scene1/1.2.png", taken);
    const b = nextFreeName(CH, "scene2/1.2.png", taken);
    expect(a.objectKey).not.toBe(b.objectKey);
    expect(b.displayName).toBe("1.2-2.png");
  });

  it("keeps the original spelling in the display name and sanitizes only the key", () => {
    const { displayName, objectKey } = nextFreeName(CH, "ကောင်လေး ၁.png", new Set());
    expect(displayName).toBe("ကောင်လေး ၁.png");
    expect(objectKey).toMatch(/^chapters\/ch1\/[\w.\-]+$/);
  });

  it("counts up when two different originals sanitize to the same key", () => {
    const taken = new Set<string>();
    const a = nextFreeName(CH, "က.png", taken);
    const b = nextFreeName(CH, "ခ.png", taken);
    expect(a.objectKey).not.toBe(b.objectKey);
    expect(b.displayName).toBe("ခ-2.png");
  });

  it("handles a name with no extension", () => {
    const taken = new Set(["chapters/ch1/render"]);
    expect(nextFreeName(CH, "render", taken).displayName).toBe("render-2");
  });
});

describe("naturalCompare", () => {
  it("puts 1.2 before 1.10", () => {
    expect(["1.10.png", "1.2.png", "1.1.png"].sort(naturalCompare)).toEqual(["1.1.png", "1.2.png", "1.10.png"]);
  });
});
