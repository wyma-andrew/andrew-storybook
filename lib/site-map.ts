// Chapter geography. The asset table stores each location on its own — its
// shell, its fixed layout, its views — but nothing stores how the locations
// relate: which script scene plays in which of them, and how a character gets
// from one to the next. The storyboard pass derives that once per chapter,
// and single-scene regeneration reads it back instead of re-deriving chapter
// geography from the one scene it is re-shooting.
// A camera position this chapter shoots the place from. Each one needs its own
// empty plate image; one reference image cannot show the far side of a path.
// See history/camera-stations.md.
export type SiteMapStation = {
  key: string;
  label: string;
  view: string;
};

// The location reference image's own camera position. Its plate already
// exists — it is the reference image — so the UI asks for no copy of it.
export const REFERENCE_STATION = "reference";

export type SiteMapPlace = {
  location: string;
  sceneSlugs: string[];
  note: string;
  stations: SiteMapStation[];
};

export type SiteMapConnection = {
  from: string;
  to: string;
  via: string;
  screenDirection: string;
};

export type SiteMap = {
  places: SiteMapPlace[];
  connections: SiteMapConnection[];
};

export const EMPTY_SITE_MAP: SiteMap = { places: [], connections: [] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseStations(value: unknown): SiteMapStation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const stations: SiteMapStation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const key = asString(raw.key).trim().toLowerCase();
    const view = asString(raw.view).trim();
    if (!key || !view || seen.has(key)) continue;
    seen.add(key);
    stations.push({ key, label: asString(raw.label).trim() || key, view });
  }
  return stations;
}

// The column is jsonb and rows predate it, so every read goes through this
// rather than a cast — a malformed or partial map degrades to "no map", which
// the prompts already handle, instead of throwing mid-generation.
export function parseSiteMap(value: unknown): SiteMap | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { places?: unknown; connections?: unknown };
  const places = Array.isArray(raw.places)
    ? raw.places
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p) => ({
          location: asString(p.location),
          sceneSlugs: asStringArray(p.sceneSlugs),
          note: asString(p.note),
          stations: parseStations(p.stations),
        }))
        .filter((p) => p.location || p.sceneSlugs.length)
    : [];
  const connections = Array.isArray(raw.connections)
    ? raw.connections
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({
          from: asString(c.from),
          to: asString(c.to),
          via: asString(c.via),
          screenDirection: asString(c.screenDirection),
        }))
        .filter((c) => c.from && c.to)
    : [];
  if (!places.length && !connections.length) return null;
  return { places, connections };
}

// Rendered back as the same shape the model emitted it in, so a regenerated
// scene reads its geography in the vocabulary the full pass wrote it in.
export function formatSiteMap(map: SiteMap): string {
  const places = map.places.map((place) => {
    const scenes = place.sceneSlugs.length ? place.sceneSlugs.map((s) => `"${s}"`).join(", ") : "no scene heading";
    const note = place.note ? ` — ${place.note}` : "";
    const stations = place.stations.map((st) => `\n  - station "${st.key}" (${st.label}): ${st.view}`).join("");
    return `- ${place.location || "(no location asset)"}: ${scenes}${note}${stations}`;
  });
  const connections = map.connections.map((c) => {
    const via = c.via ? ` via ${c.via}` : "";
    const direction = c.screenDirection ? ` — ${c.screenDirection}` : "";
    return `- ${c.from} → ${c.to}${via}${direction}`;
  });
  return [
    places.length ? `PLACES:\n${places.join("\n")}` : "",
    connections.length ? `CONNECTIONS:\n${connections.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
