// Chapter geography. The asset table stores each location on its own — its
// shell, its fixed layout, its views — but nothing stores how the locations
// relate: which script scene plays in which of them, and how a character gets
// from one to the next. The storyboard pass derives that once per chapter,
// and single-scene regeneration reads it back instead of re-deriving chapter
// geography from the one scene it is re-shooting.
export type SiteMapPlace = {
  location: string;
  sceneSlugs: string[];
  note: string;
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
    return `- ${place.location || "(no location asset)"}: ${scenes}${note}`;
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
