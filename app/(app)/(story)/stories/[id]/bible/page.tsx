"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Grid2x2, Camera, Columns2, Image as ImageIcon, Telescope } from "lucide-react";
import { Card, CardHeader, CardFooter } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { PromptHint } from "@/components/ui/PromptHint";
import { TopBar, Crumb, Body, Wrap } from "@/components/ui/Layout";
import { Textarea, Switch } from "@geckoui/geckoui";
import { useRead, useWrite } from "@/lib/spoosh";
import type { BibleEntry } from "@/lib/api/types";
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
import { composeLookPrompt, fullCharacterPrompt } from "@/lib/character-looks";
import { resolveStyleContext } from "@/lib/constants/visual-styles";

// `angleStyleContext` (locations only): the wide view is copied with the
// schematic plan attached, so `styleContext` has the match-the-reference
// clause dropped; an extra angle is copied with the finished wide view
// attached, where that clause is exactly what should apply.
function BibleCard({
  entry,
  styleContext,
  angleStyleContext,
}: {
  entry: BibleEntry;
  styleContext: string | null;
  angleStyleContext?: string | null;
}) {
  // Locations pick their preset from spaceKind: interior view + floor plan, or
  // exterior view + site plan.
  const viewPreset = entry.kind === "location" ? locationViewPreset(entry.spaceKind) : entry.kind === "prop" ? SYSTEM_PROMPTS.prop : SYSTEM_PROMPTS.character;
  const hints = locationPromptHints(entry.spaceKind);

  const [prompt, setPrompt] = useState(entry.realPrompt);
  const [editing, setEditing] = useState(false);
  const { trigger: patch, loading } = useWrite((api) => api("bible-entries/:id").PATCH());

  async function toggleLock() {
    await patch({ params: { id: entry.id }, body: { locked: !entry.locked } });
  }
  async function save() {
    await patch({ params: { id: entry.id }, body: { realPrompt: prompt } });
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <Avatar>{entry.name.slice(0, 2).toUpperCase()}</Avatar>
        <div>
          <div className="font-semibold">{entry.name}</div>
          <div className="text-[11.5px] text-fg-3">{entry.meta}</div>
        </div>
      </CardHeader>

      <div className="flex items-center gap-2 px-3.5 pt-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2 select-none">
          <Switch size="sm" checked={entry.locked} onChange={toggleLock} />
          <span className={`font-semibold ${entry.locked ? "text-accent" : ""}`}>{entry.locked ? "Locked" : "Unlocked"}</span>
        </label>
        {entry.seed && <span className="ml-auto text-[11.5px] text-fg-3">seed {entry.seed}</span>}
      </div>

      {editing ? (
        <div className="px-3.5 pt-2.5">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[90px] text-[14px] leading-relaxed" />
        </div>
      ) : (
        <div className="p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">
          {fullCharacterPrompt(entry.realPrompt, entry.looks)}
        </div>
      )}


      <CardFooter>
        {editing ? (
          <>
            <MiniLoadingButton onClick={save} loading={loading}>
              Save
            </MiniLoadingButton>
            <MiniButton
              ghost
              onClick={() => {
                setEditing(false);
                setPrompt(entry.realPrompt);
              }}
            >
              Cancel
            </MiniButton>
          </>
        ) : (
          <>
            {entry.kind === "location" && (
              <PromptHint hint={hints.plan}>
                <MiniButton
                  onClick={() =>
                    // No styleContext — see SYSTEM_PROMPTS.locationFloorPlan.
                    copyText(
                      withAssetContext(entry.realPrompt, locationPlanPreset(entry.spaceKind), null),
                      `${entry.name} ${locationPlanLabel(entry.spaceKind).toLowerCase()} prompt`
                    )
                  }
                >
                  <Grid2x2 size={12} /> {locationPlanLabel(entry.spaceKind)}
                </MiniButton>
              </PromptHint>
            )}
{entry.kind === "location" ? (
              <PromptHint hint={hints.view}>
                <MiniButton
                  onClick={() =>
                    copyText(withAssetContext(entry.realPrompt, viewPreset, styleContext), `${entry.name} prompt`)
                  }
                >
                  <ImageIcon size={12} /> View
                </MiniButton>
              </PromptHint>
            ) : entry.looks.length ? (
              entry.looks.map((look) => (
                <MiniButton
                  key={look.key}
                  onClick={() =>
                    copyText(
                      withAssetContext(composeLookPrompt(entry.realPrompt, entry.looks, look.key), viewPreset, styleContext),
                      `${entry.name} ${look.label} prompt`
                    )
                  }
                >
                  Copy {look.label}
                </MiniButton>
              ))
            ) : (
              <MiniButton
                onClick={() =>
                  copyText(withAssetContext(entry.realPrompt, viewPreset, styleContext), `${entry.name} prompt`)
                }
              >
                Copy prompt
              </MiniButton>
            )}
            {entry.kind === "location" && hasMultipleViews(entry.realPrompt) && (
              <PromptHint hint={hints.sheet}>
                <MiniButton
                  onClick={() =>
                    copyText(
                      withAssetContext(entry.realPrompt, SYSTEM_PROMPTS.locationViewsSheet, styleContext),
                      `${entry.name} views sheet prompt`
                    )
                  }
                >
                  <Columns2 size={12} /> Views sheet
                </MiniButton>
              </PromptHint>
            )}
            {entry.kind === "location" && (
              <PromptHint hint={hints.angle}>
                <MiniButton
                  onClick={() =>
                    copyText(
                      withAssetContext(
                        entry.realPrompt,
                        SYSTEM_PROMPTS.locationAltAngle,
                        angleStyleContext ?? styleContext
                      ),
                      `${entry.name} angle prompt`
                    )
                  }
                >
                  <Camera size={12} /> Angle
                </MiniButton>
              </PromptHint>
            )}
            {entry.kind === "location" && (
              <PromptHint hint={hints.distant}>
                <MiniButton
                  onClick={() =>
                    copyText(
                      withAssetContext(
                        entry.realPrompt,
                        SYSTEM_PROMPTS.locationDistantView,
                        angleStyleContext ?? styleContext
                      ),
                      `${entry.name} distant view prompt`
                    )
                  }
                >
                  <Telescope size={12} /> Distant
                </MiniButton>
              </PromptHint>
            )}
            <MiniButton ghost onClick={() => setEditing(true)}>
              Edit
            </MiniButton>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export default function BiblePage() {
  const { id } = useParams<{ id: string }>();
  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: bible } = useRead((api) => api("stories/:id/bible").GET({ params: { id } }));
  // Match the Assets page: what's copied is style + the kind's system preset +
  // realPrompt, not the bare realPrompt shown on the card.
  const styleContext = story ? resolveStyleContext(story.region, story.visualStyleId) : null;
  // See the Assets page: a location copy attaches the floor plan, so the
  // style's "match the reference image" clause is dropped for it.
  const locationStyleContext = story
    ? resolveStyleContext(story.region, story.visualStyleId, { referenceImageAttached: false })
    : null;

  const characters = bible?.filter((b) => b.kind === "character") ?? [];
  const locations = bible?.filter((b) => b.kind === "location") ?? [];
  const props = bible?.filter((b) => b.kind === "prop") ?? [];

  return (
    <>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <Link href={`/stories/${id}`}>{story?.title ?? "…"}</Link> /{" "}
          <span className="text-fg">Asset Bible</span>
        </Crumb>
      </TopBar>

      <Body>
        <Wrap wide>
          <section className="mb-11">
            <SectionHead title="Characters" count={`${characters.length} in bible`} />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Promoted from episode Assets steps. Editing here updates every episode that references this
              entry going forward.
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {characters.map((b) => (
                <BibleCard key={b.id} entry={b} styleContext={styleContext} />
              ))}
              {characters.length === 0 && <span className="text-[12.5px] text-fg-3">None yet.</span>}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="Locations" count={`${locations.length} in bible`} />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Environment plates reused as background reference wherever the scene occurs.
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {locations.map((b) => (
                <BibleCard key={b.id} entry={b} styleContext={locationStyleContext} angleStyleContext={styleContext} />
              ))}
              {locations.length === 0 && <span className="text-[12.5px] text-fg-3">None yet.</span>}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="Props" count={`${props.length} in bible`} />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Story-relevant objects with a stable visual identity, reused wherever they appear.
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {props.map((b) => <BibleCard key={b.id} entry={b} styleContext={styleContext} />)}
              {props.length === 0 && <span className="text-[12.5px] text-fg-3">None yet.</span>}
            </div>
          </section>
        </Wrap>
      </Body>

    </>
  );
}
