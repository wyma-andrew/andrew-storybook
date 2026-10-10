import { describe, expect, it } from "vitest";
import { composeLookPrompt, findLook, parseLooks } from "./character-looks";
import { buildAssetContext, cleanShotAssets } from "./storyboard-assets";
import { locationStationPreset, SYSTEM_PROMPTS } from "./constants/system-prompts";

const looks = [
  { key: "student", label: "Student", scenes: ["2 EXT. TOWN - DAY"], prompt: "LOOK: Student\n\nWARDROBE LOCK:\n- White cloth" },
  { key: "bandit", label: "Bandit", scenes: ["3 EXT. FOREST - NIGHT"], prompt: "LOOK: Bandit\n\nWARDROBE LOCK:\n- Brown waistcloth" },
];

describe("parseLooks", () => {
  it("treats a single look as no split", () => {
    expect(parseLooks([looks[0]])).toEqual([]);
  });

  it("slugs and de-duplicates keys and drops empty prompts", () => {
    const parsed = parseLooks([
      { key: "Wild Man", label: "Wild", scenes: [], prompt: "a" },
      { key: "wild-man", label: "Wild 2", scenes: [], prompt: "b" },
      { key: "x", label: "Empty", scenes: [], prompt: "  " },
    ]);
    expect(parsed.map((l) => l.key)).toEqual(["wild-man", "wild-man-2"]);
  });

  it("returns [] for anything that is not an array", () => {
    expect(parseLooks(null)).toEqual([]);
    expect(parseLooks({})).toEqual([]);
  });
});

describe("composeLookPrompt", () => {
  it("is the bare prompt for a character without looks", () => {
    expect(composeLookPrompt("CHARACTER: A", [], null)).toBe("CHARACTER: A");
  });

  it("adds only the look for the base look", () => {
    expect(composeLookPrompt("CHARACTER: A", looks, "student")).toBe(`CHARACTER: A\n\n${looks[0].prompt}`);
  });

  it("anchors a later look to the base sheet", () => {
    const text = composeLookPrompt("CHARACTER: A", looks, "bandit");
    expect(text).toContain('in their "Student" look');
    expect(text.endsWith(looks[1].prompt)).toBe(true);
  });

  it("falls back to the base look for an unknown key", () => {
    expect(findLook(looks, "gone")).toBe(looks[0]);
  });
});

describe("storyboard assets", () => {
  const rows = [
    { kind: "character", name: "ANGULIMALA", meta: "Killer", real_prompt: "CHARACTER: ANGULIMALA", looks },
    { kind: "location", name: "FOREST", meta: "Exterior", real_prompt: "LOCATION: FOREST", looks: [] },
  ];

  it("lists a character's looks under it in Known Assets", () => {
    const context = buildAssetContext(rows);
    expect(context).toContain('look "bandit" (Bandit; scenes 3 EXT. FOREST - NIGHT)');
    expect(context).toContain("Location — FOREST (Exterior): LOCATION: FOREST");
  });

  it("keeps only real look keys on shot assets", () => {
    expect(
      cleanShotAssets(
        [
          { name: "ANGULIMALA", kind: "character", look: "bandit" },
          { name: "ANGULIMALA", kind: "character", look: "invented" },
          { name: "FOREST", kind: "location", look: "", station: "reverse" },
          { name: "FOREST", kind: "location", look: "", station: "invented" },
        ],
        rows,
        {
          places: [
            {
              location: "FOREST",
              sceneSlugs: [],
              note: "",
              stations: [
                { key: "reference", label: "Reference", view: "a" },
                { key: "reverse", label: "Reverse", view: "b" },
              ],
            },
          ],
          connections: [],
        }
      )
    ).toEqual([
      { name: "ANGULIMALA", kind: "character", look: "bandit" },
      { name: "ANGULIMALA", kind: "character" },
      { name: "FOREST", kind: "location", station: "reverse" },
      { name: "FOREST", kind: "location" },
    ]);
  });

  it("fills the alt-angle view slot from the station", () => {
    const preset = locationStationPreset("From past the boulder, looking back toward the town end.");
    expect(preset).not.toBe(SYSTEM_PROMPTS.locationAltAngle);
    expect(preset).toContain("View to render: From past the boulder, looking back toward the town end. ");
    expect(preset).not.toContain("<paste");
  });
});
