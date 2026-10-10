import { describe, expect, it } from "vitest";
import { formatSiteMap, parseSiteMap } from "./site-map";

describe("parseSiteMap", () => {
  it("returns null for a chapter with no stored map", () => {
    expect(parseSiteMap(null)).toBeNull();
    expect(parseSiteMap(undefined)).toBeNull();
    expect(parseSiteMap("{}")).toBeNull();
    expect(parseSiteMap({ places: [], connections: [] })).toBeNull();
  });

  it("keeps well-formed places and connections", () => {
    const map = parseSiteMap({
      places: [{ location: "Nori's Yard", sceneSlugs: ["EXT. YARD — DAY"], note: "she waits" }],
      connections: [
        { from: "Nori's Yard", to: "Nori's House", via: "front stair", screenDirection: "exits frame right" },
      ],
    });
    expect(map).toEqual({
      places: [{ location: "Nori's Yard", sceneSlugs: ["EXT. YARD — DAY"], note: "she waits", stations: [] }],
      connections: [
        { from: "Nori's Yard", to: "Nori's House", via: "front stair", screenDirection: "exits frame right" },
      ],
    });
  });

  it("drops malformed entries instead of throwing", () => {
    const map = parseSiteMap({
      places: [{ location: "Market", sceneSlugs: ["EXT. MARKET — DAY", 7] }, { note: "no place" }, null],
      connections: [{ from: "Market" }, { from: "Market", to: "Road" }],
    });
    expect(map).toEqual({
      places: [{ location: "Market", sceneSlugs: ["EXT. MARKET — DAY"], note: "", stations: [] }],
      connections: [{ from: "Market", to: "Road", via: "", screenDirection: "" }],
    });
  });
});

describe("formatSiteMap", () => {
  it("renders places and connections for the regeneration prompt", () => {
    const text = formatSiteMap({
      places: [
        { location: "Nori's Yard", sceneSlugs: ["EXT. YARD — DAY", "EXT. YARD — NIGHT"], note: "she waits", stations: [] },
        { location: "", sceneSlugs: ["EXT. ROAD — DAY"], note: "", stations: [] },
      ],
      connections: [
        { from: "Nori's Yard", to: "Nori's House", via: "front stair", screenDirection: "exits frame right" },
        { from: "Nori's House", to: "Nori's Yard", via: "", screenDirection: "" },
      ],
    });
    expect(text).toBe(
      [
        "PLACES:",
        '- Nori\'s Yard: "EXT. YARD — DAY", "EXT. YARD — NIGHT" — she waits',
        '- (no location asset): "EXT. ROAD — DAY"',
        "CONNECTIONS:",
        "- Nori's Yard → Nori's House via front stair — exits frame right",
        "- Nori's House → Nori's Yard",
      ].join("\n")
    );
  });

  it("omits an empty section", () => {
    expect(formatSiteMap({ places: [{ location: "Hut", sceneSlugs: [], note: "", stations: [] }], connections: [] })).toBe(
      "PLACES:\n- Hut: no scene heading"
    );
  });
});

describe("camera stations", () => {
  it("keeps stations with a key and a view, lowercasing and de-duplicating keys", () => {
    const map = parseSiteMap({
      places: [
        {
          location: "Trail",
          sceneSlugs: ["EXT. TRAIL — DAY"],
          note: "",
          stations: [
            { key: "Reference", label: "Reference", view: "From the town end looking north." },
            { key: "reverse", label: "", view: "From past the boulder looking back south." },
            { key: "reverse", label: "Dup", view: "x" },
            { key: "empty", label: "No view", view: " " },
          ],
        },
      ],
      connections: [],
    });
    expect(map?.places[0].stations).toEqual([
      { key: "reference", label: "Reference", view: "From the town end looking north." },
      { key: "reverse", label: "reverse", view: "From past the boulder looking back south." },
    ]);
  });

  it("lists stations under their place for scene regeneration", () => {
    const text = formatSiteMap({
      places: [
        {
          location: "Trail",
          sceneSlugs: ["EXT. TRAIL — DAY"],
          note: "",
          stations: [{ key: "reverse", label: "Reverse", view: "Looking back south." }],
        },
      ],
      connections: [],
    });
    expect(text).toBe('PLACES:\n- Trail: "EXT. TRAIL — DAY"\n  - station "reverse" (Reverse): Looking back south.');
  });
});
