"use client";

import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Sparkles, ListPlus, Trash2 } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Card, CardHeader, CardFooter } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { MatchBadge, InjectRow } from "@/components/ui/Badge";
import { Button, MiniButton } from "@/components/ui/Button";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { ConfirmDialog } from "@geckoui/geckoui";
import { useRead, useWrite, useQueue } from "@/lib/spoosh";
import { withAssetContext } from "@/lib/prompt-copy";
import type { ChapterAsset } from "@/lib/api/types";

function AssetCard({
  asset,
  systemPrompt,
  styleContext,
}: {
  asset: ChapterAsset;
  systemPrompt?: string | null;
  styleContext?: string | null;
}) {
  const { trigger: promote, loading } = useWrite((api) => api("chapter-assets/:id/promote").POST());
  const { trigger: regenerate, loading: regenerating } = useWrite((api) => api("chapter-assets/:id/regenerate").POST());
  const { trigger: removeAsset, loading: removing } = useWrite((api) => api("chapter-assets/:id").DELETE());

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

  return (
    <Card className={borderClass}>
      <CardHeader>
        <div>
          <div className="font-semibold">{asset.name}</div>
          <div className="text-[11.5px] text-fg-3">{asset.meta}</div>
        </div>
        {asset.matchStatus !== "local" && <MatchBadge status={asset.matchStatus} />}
      </CardHeader>

      <InjectRow kind={asset.kind} />

      <div className="p-3.5 pt-2.5 font-mono text-[12.5px] whitespace-pre-wrap text-[#c6c6c6]">{asset.realPrompt}</div>

      <CardFooter>
        {asset.matchStatus === "stale" ? (
          <MiniButton className="flex-1 justify-center text-danger" onClick={confirmRemove} disabled={removing}>
            <Trash2 size={12} /> {removing ? "Removing…" : "Remove from chapter"}
          </MiniButton>
        ) : (
          <>
            <MiniButton
              className="flex-1 justify-center"
              onClick={() => navigator.clipboard.writeText(withAssetContext(asset.realPrompt, systemPrompt, styleContext))}
            >
              Copy prompt
            </MiniButton>
            <MiniButton className="flex-1 justify-center" onClick={confirmRegenerate} disabled={regenerating}>
              <RefreshCw size={12} /> {regenerating ? "Regenerating…" : "Regenerate"}
            </MiniButton>
            {asset.matchStatus === "new" && (
              <MiniButton
                className="flex-1 justify-center text-accent"
                onClick={() => promote({ params: { id: asset.id }, invalidate: `chapters/${asset.chapterId}/assets` })}
                disabled={loading}
              >
                {loading ? "Adding…" : "+ Add to bible"}
              </MiniButton>
            )}
          </>
        )}
      </CardFooter>
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
  const { data: systemPrompts } = useRead((api) => api("system-prompts").GET());
  const { trigger: analyze, loading: analyzing } = useWrite((api) => api("chapters/:id/analyze").POST());
  const { trigger: sync, loading: syncing } = useWrite((api) => api("chapters/:id/sync").POST());

  const characterPreset = systemPrompts?.find((p) => p.kind === "character")?.prompt;
  const locationPreset = systemPrompts?.find((p) => p.kind === "location")?.prompt;

  const characters = assets?.filter((a) => a.kind === "character") ?? [];
  const locations = assets?.filter((a) => a.kind === "location") ?? [];
  const matched = characters.filter((a) => a.matchStatus === "matched").length;
  const isNew = characters.filter((a) => a.matchStatus === "new").length;
  const staleCharacters = characters.filter((a) => a.matchStatus === "stale").length;
  const staleLocations = locations.filter((a) => a.matchStatus === "stale").length;

  async function reanalyze() {
    await analyze({ params: { id: chapterId } });
    refetchAssets();
  }

  async function resync() {
    await sync({ params: { id: chapterId } });
    refetchAssets();
  }

  if (!story || !chapter) return null;

  return (
    <Frame>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="assets"
        styleName={story.visualStyleName ?? "None"}
      />

      <Toolbar>
        <span className="mr-1.5 text-fg-3">Extracted from script:</span>
        <ToolbarButton onClick={reanalyze} disabled={analyzing}>
          <RefreshCw size={13} /> {analyzing ? "Re-analyzing…" : "Re-analyze"}
        </ToolbarButton>
        <ToolbarButton onClick={resync} disabled={syncing} title="Add script's new characters/locations without touching existing prompts">
          <ListPlus size={13} /> {syncing ? "Syncing…" : "Re-Sync with story"}
        </ToolbarButton>
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
              Run analysis on the script to extract characters and locations.
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
                      styleContext={story?.visualStyleDescription}
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
                      systemPrompt={locationPreset}
                      styleContext={story?.visualStyleDescription}
                    />
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
