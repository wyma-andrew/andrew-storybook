"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Sparkles, ListPlus, Trash2, Grid2x2, Camera, Columns2, Image as ImageIcon, Pencil } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Card, CardHeader, CardFooter, CardActions } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { MatchBadge, InjectRow } from "@/components/ui/Badge";
import { Button, LoadingButton, MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { PromptHint } from "@/components/ui/PromptHint";
import { Toolbar, ToolbarLoadingButton } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { ConfirmDialog, Dialog, Input, Textarea } from "@geckoui/geckoui";
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
import type { ChapterAsset } from "@/lib/api/types";

function CharacterInfoDialog({ asset, dismiss }: { asset: ChapterAsset; dismiss: () => void }) {
  const [info, setInfo] = useState(asset.meta ?? "");
  const [prompt, setPrompt] = useState(asset.realPrompt);
  const { trigger: updateInfo, loading } = useWrite((api) => api("chapter-assets/:id").PATCH());

  async function save() {
    const updated = await updateInfo({
      params: { id: asset.id },
      body: { meta: info.trim(), realPrompt: prompt.trim() },
      invalidate: `chapters/${asset.chapterId}/assets`,
    });
    if (updated) dismiss();
  }

  return (
    <div className="flex flex-col gap-4">
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
          className="min-h-[260px] font-mono text-[12.5px]"
          disabled={loading}
        />
      </div>

      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss} disabled={loading}>
          Cancel
        </Button>
        <LoadingButton variant="primary" onClick={save} loading={loading} disabled={!prompt.trim()}>
          Save
        </LoadingButton>
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
}: {
  asset: ChapterAsset;
  systemPrompt?: string | null;
  styleContext?: string | null;
  angleStyleContext?: string | null;
}) {
  const { trigger: promote, loading } = useWrite((api) => api("chapter-assets/:id/promote").POST());
  const { trigger: regenerate, loading: regenerating } = useWrite((api) => api("chapter-assets/:id/regenerate").POST());
  const { trigger: removeAsset, loading: removing } = useWrite((api) => api("chapter-assets/:id").DELETE());

  // Locations pick their own preset from spaceKind (interior view + floor plan,
  // or exterior view + site plan); `systemPrompt` is the character preset.
  const viewPreset = asset.kind === "location" ? locationViewPreset(asset.spaceKind) : systemPrompt;
  const hints = locationPromptHints(asset.spaceKind);

  const borderClass =
    asset.matchStatus === "new" ? "border-[#3a3226]" : asset.matchStatus === "stale" ? "border-danger-border" : "";

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

  function openCharacterInfoDialog() {
    Dialog.show({
      className: "w-[calc(100vw-2rem)] max-w-[640px]",
      content: ({ dismiss }) => <CharacterInfoDialog asset={asset} dismiss={dismiss} />,
    });
  }

  return (
    <Card className={borderClass}>
      <CardHeader>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{asset.name}</div>
          <div className="text-[11.5px] text-fg-3">{asset.meta}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {asset.matchStatus !== "local" && <MatchBadge status={asset.matchStatus} />}
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

      <InjectRow kind={asset.kind} />

      <div className="p-3.5 pt-2.5 font-mono text-[12.5px] whitespace-pre-wrap text-[#c6c6c6]">{asset.realPrompt}</div>

      {asset.matchStatus === "stale" ? (
        <CardFooter>
          <MiniLoadingButton className="justify-center text-danger" onClick={confirmRemove} loading={removing}>
            <Trash2 size={12} /> Remove from chapter
          </MiniLoadingButton>
        </CardFooter>
      ) : (
        <>
          <CardFooter>
            {asset.kind === "location" && (
              <PromptHint hint={hints.plan}>
                <MiniButton
                  className="justify-center"
                  onClick={() =>
                    // No styleContext: the plan is a flat schematic, and rendering it
                    // in the story's visual style would make it decorative, not spatial.
                    copyText(
                      withAssetContext(asset.realPrompt, locationPlanPreset(asset.spaceKind), null),
                      `${asset.name} ${locationPlanLabel(asset.spaceKind).toLowerCase()} prompt`
                    )
                  }
                >
                  <Grid2x2 size={12} /> Copy {locationPlanLabel(asset.spaceKind).toLowerCase()}
                </MiniButton>
              </PromptHint>
            )}
            {asset.kind === "location" ? (
              <PromptHint hint={hints.view}>
                <MiniButton
                  className="justify-center"
                  onClick={() =>
                    copyText(withAssetContext(asset.realPrompt, viewPreset, styleContext), `${asset.name} prompt`)
                  }
                >
                  <ImageIcon size={12} /> Copy view
                </MiniButton>
              </PromptHint>
            ) : (
              <MiniButton
                className="justify-center"
                onClick={() =>
                  copyText(withAssetContext(asset.realPrompt, viewPreset, styleContext), `${asset.name} prompt`)
                }
              >
                Copy prompt
              </MiniButton>
            )}
            {asset.kind === "location" && hasMultipleViews(asset.realPrompt) && (
              <PromptHint hint={hints.sheet}>
                <MiniButton
                  className="justify-center"
                  onClick={() =>
                    copyText(
                      withAssetContext(asset.realPrompt, SYSTEM_PROMPTS.locationViewsSheet, styleContext),
                      `${asset.name} views sheet prompt`
                    )
                  }
                >
                  <Columns2 size={12} /> Copy views sheet
                </MiniButton>
              </PromptHint>
            )}
            {asset.kind === "location" && (
              <PromptHint hint={hints.angle}>
                <MiniButton
                  className="justify-center"
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
                  <Camera size={12} /> Copy angle
                </MiniButton>
              </PromptHint>
            )}
          </CardFooter>

          <CardActions>
            <MiniLoadingButton className="justify-center" onClick={confirmRegenerate} loading={regenerating}>
              <RefreshCw size={12} /> Regenerate
            </MiniLoadingButton>
            {asset.matchStatus === "new" && (
              <MiniLoadingButton
                className="justify-center text-accent"
                onClick={() => promote({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` })}
                loading={loading}
              >
                + Add to bible
              </MiniLoadingButton>
            )}
          </CardActions>
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

  if (!story || !chapter) return null;

  const styleContext = resolveStyleContext(story.region, story.visualStyleId);
  // A location's wide view is copied with its floor plan attached, and the plan
  // is a schematic, not a render of the finished room — so the style's
  // "match the reference image" clause has to come off, or the copy asks for
  // the plan's look back.
  const locationStyleContext = resolveStyleContext(story.region, story.visualStyleId, {
    referenceImageAttached: false,
  });

  return (
    <Frame>
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
        <span className="mr-1.5 text-fg-3">Extracted from script:</span>
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
                  sub="Matched entries reuse the bible's locked prompt — edits apply to this episode only unless promoted."
                  action={!!characters.length && <RegenerateAllButton assets={characters} chapterId={chapterId} />}
                />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
                  {characters.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      systemPrompt={characterPreset}
                      styleContext={styleContext}
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
                  {locations.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      styleContext={locationStyleContext}
                      angleStyleContext={styleContext}
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
                  {props.map((a) => (
                    <AssetCard key={a.id} asset={a} systemPrompt={propPreset} styleContext={styleContext} />
                  ))}
                </div>
              </section>
            </>
          )}
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
