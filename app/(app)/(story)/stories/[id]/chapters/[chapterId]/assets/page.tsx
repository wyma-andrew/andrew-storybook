"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Sparkles, ListPlus, Trash2, Grid2x2, Camera, Columns2, Image as ImageIcon, Pencil, MoreVertical, Loader2, User, MapPin, Package, Eye, Copy, X, ChevronLeft, ChevronRight, ImagePlus, Paperclip, Telescope, ListPlus as AddToBible } from "lucide-react";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Card, CardHeader, CardFooter, CardFooterWithMenu } from "@/components/ui/Card";
import { useChapterImageUpload, useImagePickers } from "@/components/ChapterImageUpload";
import { showImagePreview } from "@/components/ImagePreviewDialog";
import { SectionHead } from "@/components/ui/SectionHead";
import { MatchBadge } from "@/components/ui/Badge";
import { Button, LoadingButton, MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { PromptHint } from "@/components/ui/PromptHint";
import { Toolbar, ToolbarLoadingButton } from "@/components/ui/Toolbar";
import { Body, Wrap } from "@/components/ui/Layout";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog, Dialog, Input, Textarea, Menu, MenuItem, MenuTrigger, toast } from "@geckoui/geckoui";
import { useRead, useWrite, useQueue } from "@/lib/spoosh";
import { withAssetContext } from "@/lib/prompt-copy";
import {
  SYSTEM_PROMPTS,
  locationViewPreset,
  locationPlanPreset,
  locationPlanLabel,
  hasMultipleViews,
  locationPromptHints,
} from "@/lib/constants/system-prompts";
import { copyText } from "@/lib/copy";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import type { ChapterAsset, ChapterImage } from "@/lib/api/types";
import { composeLookPrompt, findLook, type CharacterLook } from "@/lib/character-looks";

// Kind color lives on the icon tile alone. The three kinds are rendered as
// three separate grids, but a card scrolled away from its section head has
// nothing else to say which grid it came from. A tinted header BAND was tried
// and rejected — it colored the biggest surface on the card for the smallest
// piece of information on it.
const KIND_TILE: Record<"character" | "location" | "prop", string> = {
  character: "border-kind-character-border bg-kind-character-bg text-kind-character",
  location: "border-kind-location-border bg-kind-location-bg text-kind-location",
  prop: "border-kind-prop-border bg-kind-prop-bg text-kind-prop",
};

function CharacterInfoDialog({ asset, dismiss }: { asset: ChapterAsset; dismiss: () => void }) {
  const [info, setInfo] = useState(asset.meta ?? "");
  const [prompt, setPrompt] = useState(asset.realPrompt);
  const [looks, setLooks] = useState<CharacterLook[]>(asset.looks);
  const { trigger: updateInfo, loading } = useWrite((api) => api("chapter-assets/:id").PATCH());

  function setLookPrompt(key: string, value: string) {
    setLooks((prev) => prev.map((l) => (l.key === key ? { ...l, prompt: value } : l)));
  }

  async function save() {
    const updated = await updateInfo({
      params: { id: asset.id },
      body: { meta: info.trim(), realPrompt: prompt.trim(), looks: looks.map((l) => ({ ...l, prompt: l.prompt.trim() })) },
      invalidate: `chapters/${asset.chapterId}/assets`,
    });
    if (updated) dismiss();
  }

  return (
    <div className={`flex flex-col gap-4 ${looks.length ? "max-h-[85vh] overflow-y-auto" : ""}`}>
      <div>
        <h2 className="text-[16px] font-semibold text-fg">Edit character info</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          {asset.name} · The character name cannot be changed here.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
          Short info
        </label>
        <Input
          autoFocus
          value={info}
          onChange={(event) => setInfo(event.target.value)}
          placeholder="Role · age"
          aria-label={`Character info for ${asset.name}`}
          disabled={loading}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
          Character prompt
        </label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          aria-label={`Character prompt for ${asset.name}`}
          className="min-h-[260px] text-[14px] leading-relaxed"
          disabled={loading}
        />
      </div>

      {looks.map((look) => (
        <div key={look.key}>
          <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
            Look · {look.label}
          </label>
          <Textarea
            value={look.prompt}
            onChange={(event) => setLookPrompt(look.key, event.target.value)}
            aria-label={`${look.label} look prompt for ${asset.name}`}
            className="min-h-[160px] text-[14px] leading-relaxed"
            disabled={loading}
          />
        </div>
      ))}

      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss} disabled={loading}>
          Cancel
        </Button>
        <LoadingButton
          variant="primary"
          onClick={save}
          loading={loading}
          disabled={!prompt.trim() || looks.some((l) => !l.prompt.trim())}
        >
          Save
        </LoadingButton>
      </div>
    </div>
  );
}

// The prompt is long, every card carries one, and it is read only occasionally —
// on a grid it was most of the page's height for something nobody was looking at.
// It lives behind "View prompt" now; editing is still the pencil in the header.
function AssetPromptDialog({
  asset,
  prompt,
  onCopy,
  dismiss,
}: {
  asset: ChapterAsset;
  prompt: string;
  onCopy: () => void;
  dismiss: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-fg">{asset.name}</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">{asset.meta}</p>
        </div>
        <MiniButton
          ghost
          className="!h-7 !w-7 !min-w-0 shrink-0 cursor-pointer justify-center !p-0"
          onClick={dismiss}
          aria-label="Close"
          title="Close"
        >
          <X size={15} />
        </MiniButton>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-line-2 bg-sunken p-3.5">
        <div className="text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">{prompt}</div>
      </div>
      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss}>
          Close
        </Button>
        <Button variant="primary" onClick={onCopy} className="flex items-center gap-1.5">
          <Copy size={13} /> Copy prompt
        </Button>
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  systemPrompt,
  styleContext,
  // Locations only. The wide view is copied with the (schematic) floor plan
  // attached, so `styleContext` there has the match-the-reference clause
  // dropped; an extra angle is copied with the finished wide view attached,
  // where that clause is exactly what should apply. See resolveStyleContext.
  angleStyleContext,
  chapterId,
  images: allImages,
  onImagesChanged,
}: {
  asset: ChapterAsset;
  systemPrompt?: string | null;
  styleContext?: string | null;
  angleStyleContext?: string | null;
  chapterId: string;
  // Already filtered to this asset by the page — one read of the chapter's
  // images serves every card, rather than a request per card.
  images: ChapterImage[];
  onImagesChanged: () => void;
}) {
  const { trigger: promote, loading } = useWrite((api) => api("chapter-assets/:id/promote").POST());
  const { trigger: regenerate, loading: regenerating } = useWrite((api) => api("chapter-assets/:id/regenerate").POST());
  const { trigger: removeAsset, loading: removing } = useWrite((api) => api("chapter-assets/:id").DELETE());

  const { trigger: removeImage } = useWrite((api) => api("chapter-images/:id").DELETE());
  const { upload, uploading, progress } = useChapterImageUpload(chapterId, onImagesChanged);

  const [lookKey, setLookKey] = useState<string | null>(null);
  const activeLook = findLook(asset.looks, lookKey);
  const isBaseLook = activeLook === asset.looks[0];
  // An image whose look was dropped by a regenerate falls back to the first
  // look, same as findLook does for an unknown key.
  // Station plates (uploaded from the storyboard) come after the location's own
  // renders, so the hero stays the reference view.
  const images = activeLook
    ? allImages.filter((image) => findLook(asset.looks, image.lookKey) === activeLook)
    : [...allImages.filter((image) => !image.stationKey), ...allImages.filter((image) => image.stationKey)];
  const promptText = activeLook ? composeLookPrompt(asset.realPrompt, asset.looks, activeLook.key) : asset.realPrompt;

  const { inputs, openFiles } = useImagePickers(
    (files) => void upload(files, { chapterAssetId: asset.id, lookKey: activeLook?.key ?? null })
  );

  // Slider position. Clamped on render rather than synced in an effect: deleting
  // the last image leaves the index past the end, and clamping is the whole fix.
  const [slide, setSlide] = useState(0);
  const index = images.length ? Math.min(slide, images.length - 1) : 0;
  const hero = images[index] ?? null;

  function step(delta: number) {
    // Wraps, so the arrows never dead-end on a short set.
    setSlide((prev) => {
      const from = Math.min(prev, images.length - 1);
      return (from + delta + images.length) % images.length;
    });
  }

  async function deleteImage(imageId: string) {
    const { error } = await removeImage({ params: { id: imageId } });
    if (error) toast.error(error.error);
    else onImagesChanged();
  }

  // Locations pick their own preset from spaceKind (interior view + floor plan,
  // or exterior view + site plan); `systemPrompt` is the character preset.
  const viewPreset = asset.kind === "location" ? locationViewPreset(asset.spaceKind) : systemPrompt;
  const hints = locationPromptHints(asset.spaceKind);

  // "new" carries no border tint: it is the default state of most cards, and
  // "Add to bible" in the card's menu already says it. Only "stale" is marked,
  // because that one is a warning.
  const borderClass = asset.matchStatus === "stale" ? "border-danger-border" : "";

  function confirmRegenerate() {
    ConfirmDialog.show({
      title: `Regenerate "${asset.name}"?`,
      content: "Replaces this prompt's current text with a new AI-generated one. Cannot be undone.",
      confirmButtonLabel: "Regenerate",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        regenerate({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` });
      },
    });
  }

  function confirmRemove() {
    ConfirmDialog.show({
      title: `Remove "${asset.name}"?`,
      content: "No longer found in this chapter's script. Removing only affects this chapter — its bible entry, if any, is untouched.",
      confirmButtonLabel: "Remove",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        removeAsset({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` });
      },
    });
  }

  // What the dialog's Copy does: for a location that is its wide view (the
  // same as "Copy view"), for everything else the single prompt copy.
  function copyDefaultPrompt() {
    copyText(withAssetContext(promptText, viewPreset, styleContext), `${asset.name} prompt`);
  }

  function openPromptDialog() {
    Dialog.show({
      className: "w-[calc(100vw-2rem)] max-w-[720px]",
      content: ({ dismiss }) => (
        <AssetPromptDialog asset={asset} prompt={promptText} onCopy={copyDefaultPrompt} dismiss={dismiss} />
      ),
    });
  }

  function openCharacterInfoDialog() {
    Dialog.show({
      className: "w-[calc(100vw-2rem)] max-w-[640px]",
      content: ({ dismiss }) => <CharacterInfoDialog asset={asset} dismiss={dismiss} />,
    });
  }

  return (
    <Card className={borderClass}>
      {/* Hero: the first render, above the title, so a grid of cards reads as
          the cast and the sets rather than as a list of names. Only the first —
          a carousel per card is a lot of chrome for something most assets have
          one or two of, and the preview dialog is where you look through them.
          With none, a placeholder keeps every card the same height, so adding
          one image does not reflow the grid. */}
      {inputs}

      <div className="group relative h-36 w-full shrink-0 overflow-hidden border-b border-line bg-sunken">
        {hero ? (
          <>
            <button
              type="button"
              onClick={() => showImagePreview(images, index, (image) => void deleteImage(image.id))}
              className="block size-full cursor-pointer"
              aria-label={`Preview ${hero.fileName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.url} alt={hero.fileName} className="size-full object-cover" loading="lazy" />
            </button>

            {images.length > 1 && (
              <>
                {/* Arrows appear on hover and on keyboard focus. Always-on
                    controls turn a grid of cards into a wall of chevrons, and
                    the dots below already say there is more than one. */}
                {(
                  [
                    ["prev", -1, "left-0.5", ChevronLeft],
                    ["next", 1, "right-0.5", ChevronRight],
                  ] as const
                ).map(([name, delta, side, Icon]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => step(delta)}
                    aria-label={`${name === "prev" ? "Previous" : "Next"} image for ${asset.name}`}
                    // text-white, not a theme token: this sits on top of an
                    // arbitrary render, not on a themed surface, so it has to
                    // read against whatever the image happens to be. The drop
                    // shadow is what carries it over a pale image.
                    className={`absolute top-1/2 ${side} grid size-8 -translate-y-1/2 cursor-pointer place-items-center text-white opacity-0 drop-shadow-md transition-opacity group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100`}
                  >
                    <Icon size={26} strokeWidth={2.25} />
                  </button>
                ))}

                <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
                  {images.map((image, i) => (
                    <span
                      key={image.id}
                      className={`size-1.5 rounded-full ${i === index ? "bg-fg" : "bg-fg-3/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          // The empty state IS the upload control, not a decorative tile with
          // the real button elsewhere in the footer: an empty slot the size of a
          // card header is the most obvious place to aim at, and the kind icon
          // alone said what the card was without offering anything to do.
          <button
            type="button"
            onClick={openFiles}
            disabled={uploading}
            // Inset dashed box, icon only — the same placeholder the storyboard
            // shot cards use, so an empty image slot looks the same wherever it
            // appears. No label: the icon says it, and a word inside a card
            // header competes with the asset's own name directly below.
            className="grid size-full cursor-pointer place-items-center p-3 disabled:cursor-default"
            aria-label={`Upload images for ${asset.name}`}
            title="Upload images"
          >
            <span className="grid size-full place-items-center rounded-lg border border-dashed border-line-2 text-accent">
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
            </span>
          </button>
        )}
      </div>

      <CardHeader divider={false}>
        {/* Kind icon: the three grids are far apart on a long page, so a card
            scrolled past its section head no longer says what it is. */}
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${KIND_TILE[asset.kind]}`}>
          {asset.kind === "character" ? (
            <User size={14} />
          ) : asset.kind === "location" ? (
            <MapPin size={14} />
          ) : (
            <Package size={14} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {/* leading-normal, not leading-tight: Burmese stacks marks above and below
              the baseline, and truncate's overflow-hidden clips them off a tight line
              box. Latin looks the same either way. */}
          <div className="flex min-w-0 items-center gap-1">
            <div className="truncate text-[13.5px] leading-normal font-semibold">{asset.name}</div>
            <MiniButton
              ghost
              className="!h-5 !w-5 !min-w-0 shrink-0 justify-center !p-0 text-fg-3"
              onClick={() => copyText(asset.name, `${asset.name} name`)}
              aria-label={`Copy ${asset.name}`}
              title="Copy name"
            >
              <Copy size={11} />
            </MiniButton>
          </div>
          <div className="truncate text-[11.5px] leading-normal text-fg-3">{asset.meta}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Only a bible-backed asset is badged. "New" needed no badge: it is the
              default state of most cards, and "Add to bible" in the menu already
              says it. "Stale" keeps its badge — that one is a warning. */}
          {(asset.matchStatus === "matched" || asset.matchStatus === "stale") && (
            <MatchBadge status={asset.matchStatus} />
          )}
          {asset.kind === "character" && (
            <MiniButton
              ghost
              className="!h-7 !w-7 !min-w-0 justify-center !p-0"
              onClick={openCharacterInfoDialog}
              aria-label={`Edit character info for ${asset.name}`}
              title="Edit character info"
            >
              <Pencil size={13} />
            </MiniButton>
          )}
        </div>
      </CardHeader>

      {activeLook && (
        <div className="px-3.5 pt-2">
          <div role="tablist" aria-label={`Looks of ${asset.name}`} className="flex gap-1 overflow-x-auto">
            {asset.looks.map((look) => (
              <MiniButton
                key={look.key}
                role="tab"
                aria-selected={look === activeLook}
                ghost={look !== activeLook}
                className="shrink-0 !rounded-full !px-2.5 whitespace-nowrap"
                onClick={() => {
                  setLookKey(look.key);
                  setSlide(0);
                }}
                title={look.scenes.join(", ")}
              >
                {look.label}
              </MiniButton>
            ))}
          </div>
          {/* The base sheet is what keeps the face the same person across looks;
              without it attached, each later sheet invents a new face. */}
          {!isBaseLook && (
            <div className="mt-1.5 flex gap-1.5 text-[11px] text-fg-3">
              <Paperclip size={12} className="mt-[2px] shrink-0" />
              <span>Attach the {asset.looks[0].label} sheet when generating this look.</span>
            </div>
          )}
        </div>
      )}

      {asset.matchStatus === "stale" ? (
        <CardFooter>
          <MiniLoadingButton className="justify-center text-danger" onClick={confirmRemove} loading={removing}>
            <Trash2 size={12} /> Remove from chapter
          </MiniLoadingButton>
        </CardFooter>
      ) : (
        <>
          {asset.kind === "location" ? (
            // Site plan and view are the two copies a location is actually
            // reached for; the sheet, the extra angle and the mutating actions
            // are occasional, and four copy buttons plus two action buttons made
            // the card a wall of equally-weighted choices.
            <CardFooterWithMenu>
              <PromptHint hint={hints.plan}>
                <MiniButton
                  className="!min-w-0 justify-center overflow-hidden"
                  onClick={() =>
                    // No styleContext: the plan is a flat schematic, and rendering it
                    // in the story's visual style would make it decorative, not spatial.
                    copyText(
                      withAssetContext(asset.realPrompt, locationPlanPreset(asset.spaceKind), null),
                      `${asset.name} ${locationPlanLabel(asset.spaceKind).toLowerCase()} prompt`
                    )
                  }
                >
                  <Grid2x2 size={12} className="shrink-0" />
                  <span className="truncate">Copy {locationPlanLabel(asset.spaceKind).toLowerCase()}</span>
                </MiniButton>
              </PromptHint>
              <PromptHint hint={hints.view}>
                <MiniButton
                  className="!min-w-0 justify-center overflow-hidden"
                  onClick={() =>
                    copyText(withAssetContext(asset.realPrompt, viewPreset, styleContext), `${asset.name} prompt`)
                  }
                >
                  <ImageIcon size={12} className="shrink-0" />
                  <span className="truncate">Copy view</span>
                </MiniButton>
              </PromptHint>
              {/* Upload sits with the other card actions rather than as its own
                  strip: it is one more thing you do to this asset, and the
                  slider above is where the results show. */}
              <MiniButton
                ghost
                className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                onClick={openFiles}
                disabled={uploading}
                aria-label={`Upload images for ${asset.name}`}
                title="Upload images"
              >
                {uploading ? (
                  <span className="flex items-center gap-0.5 text-[9px] text-fg-3">
                    <Loader2 size={12} className="animate-spin" />
                    {progress.done}/{progress.total}
                  </span>
                ) : (
                  <ImagePlus size={14} />
                )}
              </MiniButton>
              <MiniButton
                ghost
                className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                onClick={openPromptDialog}
                aria-label={`View prompt for ${asset.name}`}
                title="View prompt"
              >
                <Eye size={14} />
              </MiniButton>
              {/* Card is overflow-hidden (for its rounded corners), which clips an
                  open menu at the card's edge — floatingStrategy="fixed" takes the
                  dropdown out of that clipping context. */}
              <Menu
                floatingStrategy="fixed"
                placement="bottom-end"
                menuClassName="w-[200px] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)] py-1"
              >
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <MiniButton
                      ghost
                      className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                      onClick={toggleMenu}
                      disabled={regenerating || loading}
                      aria-label={`More actions for ${asset.name}`}
                      title="More actions"
                    >
                      {regenerating || loading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <MoreVertical size={14} />
                      )}
                    </MiniButton>
                  )}
                </MenuTrigger>
                {hasMultipleViews(asset.realPrompt) && (
                  <MenuItem
                    onClick={() =>
                      copyText(
                        withAssetContext(asset.realPrompt, SYSTEM_PROMPTS.locationViewsSheet, styleContext),
                        `${asset.name} views sheet prompt`
                      )
                    }
                  >
                    <span className="flex items-center gap-2 text-[13px]">
                      <Columns2 size={14} /> Copy views sheet
                    </span>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() =>
                    copyText(
                      withAssetContext(
                        asset.realPrompt,
                        SYSTEM_PROMPTS.locationAltAngle,
                        angleStyleContext ?? styleContext
                      ),
                      `${asset.name} angle prompt`
                    )
                  }
                >
                  <span className="flex items-center gap-2 text-[13px]">
                    <Camera size={14} /> Copy angle
                  </span>
                </MenuItem>
                <MenuItem
                  onClick={() =>
                    copyText(
                      withAssetContext(
                        asset.realPrompt,
                        SYSTEM_PROMPTS.locationDistantView,
                        angleStyleContext ?? styleContext
                      ),
                      `${asset.name} distant view prompt`
                    )
                  }
                >
                  <span className="flex items-center gap-2 text-[13px]">
                    <Telescope size={14} /> Copy distant view
                  </span>
                </MenuItem>
                <MenuItem disabled={regenerating} onClick={confirmRegenerate}>
                  <span className="flex items-center gap-2 text-[13px]">
                    <RefreshCw size={14} /> Regenerate
                  </span>
                </MenuItem>
                {asset.matchStatus === "new" && (
                  <MenuItem
                    disabled={loading}
                    onClick={() =>
                      promote({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` })
                    }
                  >
                    <span className="flex items-center gap-2 text-[13px] text-accent">
                      <AddToBible size={14} /> Add to bible
                    </span>
                  </MenuItem>
                )}
              </Menu>
            </CardFooterWithMenu>
          ) : (
            <CardFooterWithMenu actions={1}>
              <MiniButton
                className="!min-w-0 justify-center overflow-hidden"
                onClick={copyDefaultPrompt}
              >
                <span className="truncate">{activeLook ? `Copy ${activeLook.label}` : "Copy prompt"}</span>
              </MiniButton>
              {/* Upload sits with the other card actions rather than as its own
                  strip: it is one more thing you do to this asset, and the
                  slider above is where the results show. */}
              <MiniButton
                ghost
                className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                onClick={openFiles}
                disabled={uploading}
                aria-label={`Upload images for ${asset.name}`}
                title="Upload images"
              >
                {uploading ? (
                  <span className="flex items-center gap-0.5 text-[9px] text-fg-3">
                    <Loader2 size={12} className="animate-spin" />
                    {progress.done}/{progress.total}
                  </span>
                ) : (
                  <ImagePlus size={14} />
                )}
              </MiniButton>
              <MiniButton
                ghost
                className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                onClick={openPromptDialog}
                aria-label={`View prompt for ${asset.name}`}
                title="View prompt"
              >
                <Eye size={14} />
              </MiniButton>
              {/* Card is overflow-hidden (for its rounded corners), which clips an
                  open menu at the card's edge — floatingStrategy="fixed" takes the
                  dropdown out of that clipping context. */}
              <Menu
                floatingStrategy="fixed"
                placement="bottom-end"
                menuClassName="w-[200px] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)] py-1"
              >
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <MiniButton
                      ghost
                      className="!w-8 !min-w-0 cursor-pointer justify-center !p-0"
                      onClick={toggleMenu}
                      disabled={regenerating || loading}
                      aria-label={`More actions for ${asset.name}`}
                      title="More actions"
                    >
                      {regenerating || loading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <MoreVertical size={14} />
                      )}
                    </MiniButton>
                  )}
                </MenuTrigger>
                <MenuItem disabled={regenerating} onClick={confirmRegenerate}>
                  <span className="flex items-center gap-2 text-[13px]">
                    <RefreshCw size={14} /> Regenerate
                  </span>
                </MenuItem>
                {asset.matchStatus === "new" && (
                  <MenuItem
                    disabled={loading}
                    onClick={() =>
                      promote({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` })
                    }
                  >
                    <span className="flex items-center gap-2 text-[13px] text-accent">
                      <AddToBible size={14} /> Add to bible
                    </span>
                  </MenuItem>
                )}
              </Menu>
            </CardFooterWithMenu>
          )}
        </>
      )}
    </Card>
  );
}

function RegenerateAllButton({ assets, chapterId }: { assets: ChapterAsset[]; chapterId: string }) {
  const { trigger, stats } = useQueue((api) => api("chapter-assets/:id/regenerate").POST(), { concurrency: 3 });
  const regenerable = assets.filter((a) => a.matchStatus !== "stale");
  const busy = stats.pending > 0 || stats.running > 0;

  function confirmAll() {
    if (!regenerable.length) return;
    ConfirmDialog.show({
      title: `Regenerate all ${regenerable.length} prompts?`,
      content: "Replaces each prompt's current text with a new AI-generated one. Cannot be undone.",
      confirmButtonLabel: "Regenerate all",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        regenerable.forEach((a) => trigger({ params: { id: a.id }, invalidate: `chapters/${chapterId}/assets` }));
      },
    });
  }

  return (
    <MiniButton onClick={confirmAll} disabled={busy || !regenerable.length}>
      <RefreshCw size={12} /> {busy ? `Regenerating ${stats.settled}/${stats.total}…` : "Regenerate all"}
    </MiniButton>
  );
}

export default function AssetsPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: assets, trigger: refetchAssets } = useRead((api) =>
    api("chapters/:id/assets").GET({ params: { id: chapterId } })
  );

  // One read for the whole page; each card gets its own slice. An image whose
  // asset was deleted has had its link nulled by the FK, so it simply stops
  // appearing here and shows as unused in the chapter gallery.
  const { data: chapterImages, trigger: refetchImages } = useRead((api) =>
    api("chapters/:id/images").GET({ params: { id: chapterId } })
  );
  const imagesByAsset = new Map<string, ChapterImage[]>();
  for (const image of chapterImages ?? []) {
    if (!image.chapterAssetId) continue;
    const list = imagesByAsset.get(image.chapterAssetId) ?? [];
    list.push(image);
    imagesByAsset.set(image.chapterAssetId, list);
  }
  const { trigger: analyze, loading: analyzing } = useWrite((api) => api("chapters/:id/analyze").POST());
  const { trigger: sync, loading: syncing } = useWrite((api) => api("chapters/:id/sync").POST());

  const characterPreset = SYSTEM_PROMPTS.character;
  const propPreset = SYSTEM_PROMPTS.prop;

  const characters = assets?.filter((a) => a.kind === "character") ?? [];
  const locations = assets?.filter((a) => a.kind === "location") ?? [];
  const props = assets?.filter((a) => a.kind === "prop") ?? [];
  const matched = characters.filter((a) => a.matchStatus === "matched").length;
  const isNew = characters.filter((a) => a.matchStatus === "new").length;
  const staleCharacters = characters.filter((a) => a.matchStatus === "stale").length;
  const staleLocations = locations.filter((a) => a.matchStatus === "stale").length;
  const staleProps = props.filter((a) => a.matchStatus === "stale").length;

  async function reanalyze() {
    await analyze({ params: { id: chapterId } });
    refetchAssets();
  }

  // The empty-state CTA calls `reanalyze` directly — nothing to lose yet. Only
  // the toolbar button, which runs against existing assets, confirms first.
  function confirmReanalyze() {
    ConfirmDialog.show({
      title: "Re-analyze this chapter?",
      content:
        "Rebuilds every character, location, and prop from the script. All current prompts, edits, and attached reference images for this chapter are deleted. Cannot be undone.",
      confirmButtonLabel: "Re-analyze",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        reanalyze();
      },
    });
  }

  async function resync() {
    await sync({ params: { id: chapterId } });
    refetchAssets();
  }

  // Blank until story+chapter land is a white screen on every navigation into
  // this tab; the grids below have a known shape, so show it.
  if (!story || !chapter) {
    return (
      <>
        <Body>
          <Wrap wide>
            <div className="pt-6">
              <SkeletonCards label="Loading assets" />
            </div>
          </Wrap>
        </Body>
      </>
    );
  }

  const styleContext = resolveStyleContext(story.region, story.visualStyleId);
  // A location's wide view is copied with its floor plan attached, and the plan
  // is a schematic, not a render of the finished room — so the style's
  // "match the reference image" clause has to come off, or the copy asks for
  // the plan's look back.
  const locationStyleContext = resolveStyleContext(story.region, story.visualStyleId, {
    referenceImageAttached: false,
  });

  return (
    <>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="assets"
        styleName={story.visualStyleName ?? "None"}
        storyAspectRatio={story.aspectRatio}
        chapterAspectRatio={chapter.aspectRatio}
      />

      <Toolbar>
        <ToolbarLoadingButton onClick={confirmReanalyze} loading={analyzing}>
          <RefreshCw size={13} /> Re-analyze
        </ToolbarLoadingButton>
        <ToolbarLoadingButton onClick={resync} loading={syncing} title="Add script's new characters, locations, and props without touching existing prompts">
          <ListPlus size={13} /> Re-Sync with story
        </ToolbarLoadingButton>
      </Toolbar>

      <Body>
        <Wrap wide>
          {!assets?.length && !analyzing && (
            <EmptyCta
              title="No assets yet"
              icon={<Sparkles size={19} />}
              action={
                <Button variant="primary" onClick={reanalyze} className="flex items-center gap-1.5">
                  Analyze script <ArrowRight size={15} />
                </Button>
              }
            >
              Run analysis on the script to extract characters, locations, and props.
            </EmptyCta>
          )}

          {!!assets?.length && (
            <>
              <section className="mb-11">
                <SectionHead
                  title="Character Prompts"
                  count={`${characters.length} detected · ${matched} matched · ${isNew} new${staleCharacters ? ` · ${staleCharacters} stale` : ""}`}
                  action={!!characters.length && <RegenerateAllButton assets={characters} chapterId={chapterId} />}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {characters.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      systemPrompt={characterPreset}
                      styleContext={styleContext}
                      chapterId={chapterId}
                      images={imagesByAsset.get(a.id) ?? []}
                      onImagesChanged={refetchImages}
                    />
                  ))}
                </div>
              </section>

              <section className="mb-11">
                <SectionHead
                  title="Location Prompts"
                  count={`${locations.length} detected${staleLocations ? ` · ${staleLocations} stale` : ""}`}
                  action={!!locations.length && <RegenerateAllButton assets={locations} chapterId={chapterId} />}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {locations.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      styleContext={locationStyleContext}
                      angleStyleContext={styleContext}
                      chapterId={chapterId}
                      images={imagesByAsset.get(a.id) ?? []}
                      onImagesChanged={refetchImages}
                    />
                  ))}
                </div>
              </section>

              <section className="mb-11">
                <SectionHead
                  title="Prop Prompts"
                  count={`${props.length} detected${staleProps ? ` · ${staleProps} stale` : ""}`}
                  action={!!props.length && <RegenerateAllButton assets={props} chapterId={chapterId} />}
                />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {props.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      systemPrompt={propPreset}
                      styleContext={styleContext}
                      chapterId={chapterId}
                      images={imagesByAsset.get(a.id) ?? []}
                      onImagesChanged={refetchImages}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </Wrap>
      </Body>

    </>
  );
}
