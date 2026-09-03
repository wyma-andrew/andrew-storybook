"use client";

import { useParams, useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, Sparkles } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Card, CardHeader, CardFooter } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { MatchBadge, InjectRow } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button, MiniButton } from "@/components/ui/Button";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import type { ChapterAsset } from "@/lib/api/types";

function AssetCard({ asset }: { asset: ChapterAsset }) {
  const { trigger: promote, loading } = useWrite((api) => api("chapter-assets/:id/promote").POST());

  const borderClass = asset.matchStatus === "new" ? "border-[#3a3226]" : "";

  return (
    <Card className={borderClass}>
      <CardHeader>
        <Avatar>{asset.name.slice(0, 2).toUpperCase()}</Avatar>
        <div>
          <div className="font-semibold">{asset.name}</div>
          <div className="text-[11.5px] text-fg-3">{asset.meta}</div>
        </div>
        {(asset.matchStatus === "matched" || asset.matchStatus === "new") && <MatchBadge status={asset.matchStatus} />}
      </CardHeader>

      <InjectRow kind={asset.kind} />

      <div className="p-3.5 pt-2.5 font-mono text-[12.5px] whitespace-pre-wrap text-[#c6c6c6]">{asset.realPrompt}</div>

      <CardFooter>
        <MiniButton onClick={() => navigator.clipboard.writeText(asset.realPrompt)}>Copy prompt</MiniButton>
        {asset.matchStatus === "new" && (
          <MiniButton className="ml-auto text-accent" onClick={() => promote({ params: { id: asset.id } })} disabled={loading}>
            {loading ? "Adding…" : "+ Add to bible"}
          </MiniButton>
        )}
      </CardFooter>
    </Card>
  );
}

export default function AssetsPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  const router = useRouter();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: assets, trigger: refetchAssets } = useRead((api) =>
    api("chapters/:id/assets").GET({ params: { id: chapterId } })
  );
  const { trigger: analyze, loading: analyzing } = useWrite((api) => api("chapters/:id/analyze").POST());

  const characters = assets?.filter((a) => a.kind === "character") ?? [];
  const locations = assets?.filter((a) => a.kind === "location") ?? [];
  const matched = assets?.filter((a) => a.matchStatus === "matched").length ?? 0;
  const isNew = assets?.filter((a) => a.matchStatus === "new").length ?? 0;

  async function reanalyze() {
    await analyze({ params: { id: chapterId } });
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
        <span className={toolbarSep}></span>
        <ToolbarButton onClick={() => router.push(`/stories/${id}/chapters/${chapterId}/storyboard`)}>
          Continue to Storyboard <ArrowRight size={13} />
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
                  count={`${characters.length} detected · ${matched} matched · ${isNew} new`}
                />
                <div className="mb-4 text-[12.5px] text-fg-3">
                  Matched entries reuse the bible&apos;s locked prompt — edits apply to this episode only
                  unless promoted.
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
                  {characters.map((a) => (
                    <AssetCard key={a.id} asset={a} />
                  ))}
                </div>
              </section>

              <section className="mb-11">
                <SectionHead title="Location Prompts" count={`${locations.length} detected`} />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
                  {locations.map((a) => (
                    <AssetCard key={a.id} asset={a} />
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
