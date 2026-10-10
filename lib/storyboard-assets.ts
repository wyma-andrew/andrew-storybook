import { parseLooks } from "./character-looks";
import type { AssetKind, ShotAsset } from "./api/types";
import type { SiteMap } from "./site-map";

type AssetRow = { kind: string; name: string; meta: string | null; real_prompt: string; looks?: unknown };

const KIND_LABEL: Record<string, string> = { character: "Character", location: "Location", prop: "Prop" };

// The Known Assets block both storyboard passes send the model.
export function buildAssetContext(rows: AssetRow[]): string {
  return rows
    .map((a) => {
      const line = `${KIND_LABEL[a.kind] ?? "Prop"} — ${a.name} (${a.meta}): ${a.real_prompt}`;
      const looks = a.kind === "character" ? parseLooks(a.looks) : [];
      if (!looks.length) return line;
      return [
        line,
        `  LOOKS of ${a.name} (set assetsUsed.look to one of these keys on every shot of this character):`,
        ...looks.map((l) => `  - look "${l.key}" (${l.label}; scenes ${l.scenes.join(", ") || "unspecified"}): ${l.prompt}`),
      ].join("\n");
    })
    .join("\n");
}

// Keeps a look or station only where it names a real one; the model sends ""
// for everything else, and an invented key would point a chip at a sheet or
// plate that does not exist.
export function cleanShotAssets(assetsUsed: ShotAsset[], rows: AssetRow[], siteMap: SiteMap | null): ShotAsset[] {
  const lookKeys = new Map<string, Set<string>>();
  for (const a of rows) {
    if (a.kind !== "character") continue;
    const looks = parseLooks(a.looks);
    if (looks.length) lookKeys.set(a.name, new Set(looks.map((l) => l.key)));
  }
  const stationKeys = new Map<string, Set<string>>();
  for (const place of siteMap?.places ?? []) {
    if (place.location && place.stations.length) {
      stationKeys.set(place.location, new Set(place.stations.map((st) => st.key)));
    }
  }
  return assetsUsed.map(({ name, kind, look, station }) => {
    const asset: ShotAsset = { name, kind: kind as AssetKind };
    if (kind === "character" && look && lookKeys.get(name)?.has(look)) asset.look = look;
    if (kind === "location" && station && stationKeys.get(name)?.has(station)) asset.station = station;
    return asset;
  });
}
