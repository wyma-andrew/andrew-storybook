"use client";

import { useState } from "react";
import { Camera, Copy } from "lucide-react";
import { MiniButton } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { AttachedImages } from "@/components/AttachedImages";
import { withAssetContext } from "@/lib/prompt-copy";
import { copyText } from "@/lib/copy";
import { locationStationPreset } from "@/lib/constants/system-prompts";
import { REFERENCE_STATION, type SiteMap } from "@/lib/site-map";
import type { ChapterAsset, ChapterImage } from "@/lib/api/types";

// The empty plate each non-reference camera station needs before its shots can
// be generated. Lives on the storyboard because stations come from the
// storyboard pass, not from extraction. See history/camera-stations.md.
export function CameraPlates({
  chapterId,
  siteMap,
  assets,
  images,
  styleContext,
  onUploaded,
}: {
  chapterId: string;
  siteMap: SiteMap | null;
  assets: ChapterAsset[];
  images: ChapterImage[];
  styleContext: string | null;
  onUploaded: () => void;
}) {
  const places = (siteMap?.places ?? [])
    .map((place) => ({
      place,
      asset: assets.find((a) => a.kind === "location" && a.name === place.location),
      stations: place.stations.filter((st) => st.key !== REFERENCE_STATION),
    }))
    .filter((p) => p.asset && p.stations.length);

  const total = places.reduce((n, p) => n + p.stations.length, 0);
  const done = places.reduce(
    (n, p) =>
      n + p.stations.filter((st) => images.some((i) => i.chapterAssetId === p.asset!.id && i.stationKey === st.key)).length,
    0
  );
  const [open, setOpen] = useState(done < total);

  if (!places.length) return null;

  return (
    <section className="mb-4.5 rounded-xl border border-line bg-panel-2 p-3 md:p-4.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full cursor-pointer flex-wrap items-center gap-2 text-left ${open ? "mb-3.5" : ""}`}
      >
        <Camera size={15} className="text-accent" />
        <h2 className="text-[14px] font-semibold">Camera plates</h2>
        <Tag>
          {done}/{total} uploaded
        </Tag>
        <span className="w-full text-[11.5px] text-fg-3 md:ml-auto md:w-auto">
          Attach the location reference and its site plan when generating each plate
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4">
          {places.map(({ place, asset, stations }) => (
            <div key={place.location}>
              <div className="mb-2 text-[13px] font-semibold">{place.location}</div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {stations.map((station) => (
                  <div key={station.key} className="flex flex-col gap-2 rounded-lg border border-line-2 bg-sunken p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold">{station.label}</div>
                        <div className="mt-0.5 text-[12px] leading-relaxed text-fg-3">{station.view}</div>
                      </div>
                      <MiniButton
                        className="shrink-0"
                        onClick={() =>
                          copyText(
                            withAssetContext(asset!.realPrompt, locationStationPreset(station.view), styleContext),
                            `${place.location} ${station.label} plate prompt`
                          )
                        }
                      >
                        <Copy size={12} /> Copy plate
                      </MiniButton>
                    </div>
                    <AttachedImages
                      chapterId={chapterId}
                      link={{ chapterAssetId: asset!.id, stationKey: station.key }}
                      images={images.filter((i) => i.chapterAssetId === asset!.id && i.stationKey === station.key)}
                      onUploaded={onUploaded}
                      label={`${place.location} ${station.label} plate`}
                      max={1}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
