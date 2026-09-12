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
      places: [{ location: "Nori's Yard", sceneSlugs: ["EXT. YARD — DAY"], note: "she waits" }],
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
      places: [{ location: "Market", sceneSlugs: ["EXT. MARKET — DAY"], note: "" }],
      connections: [{ from: "Market", to: "Road", via: "", screenDirection: "" }],
    });
  });
});

describe("formatSiteMap", () => {
  it("renders places and connections for the regeneration prompt", () => {
    const text = formatSiteMap({
      places: [
        { location: "Nori's Yard", sceneSlugs: ["EXT. YARD — DAY", "EXT. YARD — NIGHT"], note: "she waits" },
        { location: "", sceneSlugs: ["EXT. ROAD — DAY"], note: "" },
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
    expect(formatSiteMap({ places: [{ location: "Hut", sceneSlugs: [], note: "" }], connections: [] })).toBe(
      "PLACES:\n- Hut: no scene heading"
    );
  });
});
