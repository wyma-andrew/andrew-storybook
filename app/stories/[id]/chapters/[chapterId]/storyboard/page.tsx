"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Clapperboard, Paperclip, User, MapPin, ChevronDown, Copy, Square, Loader2 } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, MiniButton } from "@/components/ui/Button";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, ToolbarLoadingButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { withStyle, withFrameDescription } from "@/lib/prompt-copy";
import { resolveStyleContext } from "@/lib/constants/visual-styles";

function PromptBox({ label, text, onCopy }: { label: string; text: string; onCopy: () => void }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">{label}</div>
      <div className="flex items-start gap-3 rounded-lg border border-line-2 bg-[#080808] p-3">
        <div className="flex-1 font-mono text-[12.5px] whitespace-pre-wrap text-[#c2c2c2]">{text}</div>
        <MiniButton className="shrink-0" onClick={onCopy}>
          Copy
        </MiniButton>
      </div>
    </div>
  );
}

function collapsedStorageKey(chapterId: string) {
  return `storyboard-collapsed:${chapterId}`;
}

export default function StoryboardPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: scenes, trigger: refetchScenes } = useRead((api) =>
    api("chapters/:id/storyboard").GET({ params: { id: chapterId } })
  );
  const { trigger: generate, loading: generating, abort: abortGenerate } = useWrite((api) =>
    api("chapters/:id/storyboard/generate").POST()
  );

  // Default open for every scene; a scene id in this set is collapsed.
  // Persisted per-chapter in localStorage so a viewer's fold state survives reloads.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapsedStorageKey(chapterId));
      setCollapsed(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setCollapsed(new Set());
    }
  }, [chapterId]);

  const sceneRefs = useRef<Map<string, HTMLElement>>(new Map());

  function toggleScene(sceneId: string) {
    setCollapsed((prev) => {
      // Accordion: opening a scene collapses every other one, so only one
      // scene's shots are ever on screen at a time — no more guessing which
      // scene a shot list belongs to.
      const wasCollapsed = prev.has(sceneId);
      const allIds = (scenes ?? []).map((s) => s.id);
      const next = wasCollapsed
        ? new Set(allIds.filter((id) => id !== sceneId)) // was collapsed -> expand it, collapse rest
        : new Set(allIds); // was expanded -> collapse it (and everything else already is)
      try {
        localStorage.setItem(collapsedStorageKey(chapterId), JSON.stringify([...next]));
      } catch {
        // ignore (private browsing / storage disabled) — fold state just won't persist
      }
      if (wasCollapsed) {
        // Scrolled *into* view, not just onto screen — the header can otherwise
        // land mid-viewport, leaving the card's top (and its "which scene" cue)
        // scrolled past.
        requestAnimationFrame(() => sceneRefs.current.get(sceneId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      return next;
    });
  }

  async function handleGenerate() {
    const { data } = await generate({ params: { id: chapterId } });
    if (data) refetchScenes(); // skip on abort/error — nothing new to refetch
  }

  const sceneCount = scenes?.length ?? 0;
  const shotCount = scenes?.reduce((sum, s) => sum + s.shots.length, 0) ?? 0;
  const totalDurationS = scenes?.reduce((sum, s) => sum + s.shots.reduce((sSum, shot) => sSum + (shot.durationS ?? 0), 0), 0) ?? 0;
  const totalDurationLabel =
    totalDurationS >= 60 ? `${Math.floor(totalDurationS / 60)}m ${totalDurationS % 60}s` : `${totalDurationS}s`;

  if (!story || !chapter) return null;

  const styleContext = resolveStyleContext(story.region, story.visualStyleDescription);

  return (
    <Frame>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="storyboard"
        styleName={story.visualStyleName ?? "None"}
        storyAspectRatio={story.aspectRatio}
        chapterAspectRatio={chapter.aspectRatio}
      />

      <Toolbar>
        <span className="mr-1.5 text-fg-3">Storyboard:</span>
        {generating ? (
          <ToolbarButton onClick={() => abortGenerate()} className="!text-danger">
            <Loader2 size={13} className="animate-spin" />
            Generating…
            <span className="ml-1 inline-flex items-center gap-1 border-l border-danger/40 pl-2 text-[12.5px]">
              <Square size={11} /> Stop
            </span>
          </ToolbarButton>
        ) : (
          <ToolbarLoadingButton onClick={handleGenerate} loading={false}>
            {!!scenes?.length && <RefreshCw size={13} />}
            {scenes?.length ? "Regenerate" : "Generate storyboard"}
          </ToolbarLoadingButton>
        )}
        {!!scenes?.length && (
          <>
            <div className={toolbarSep} />
            <span>{sceneCount} scenes</span>
            <div className={toolbarSep} />
            <span>{shotCount} shots</span>
            <div className={toolbarSep} />
            <span>~{totalDurationLabel} total</span>
          </>
        )}
      </Toolbar>

      <Body>
        <Wrap wide>
          {!scenes?.length && !generating && (
            <EmptyCta
              title="No storyboard yet"
              icon={<Clapperboard size={19} />}
              action={
                <Button variant="primary" onClick={handleGenerate} className="flex items-center gap-1.5">
                  Generate storyboard <ArrowRight size={15} />
                </Button>
              }
            >
              Generate scenes and shots from the script and its extracted assets.
            </EmptyCta>
          )}

          {scenes?.map((scene) => {
            const isCollapsed = collapsed.has(scene.id);
            return (
            <section
              key={scene.id}
              ref={(el) => {
                if (el) sceneRefs.current.set(scene.id, el);
                else sceneRefs.current.delete(scene.id);
              }}
              className={`mb-4.5 overflow-hidden rounded-xl border bg-panel-2 ${
                isCollapsed ? "border-line" : "border-accent/50"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleScene(scene.id)}
                className={`flex w-full items-center gap-3.5 border-b px-4.5 py-4 text-left ${
                  isCollapsed ? "border-line bg-[#101010]" : "border-accent/30 bg-accent-dim"
                }`}
              >
                <AccentTag className="bg-accent font-mono text-xs font-bold tracking-normal text-[#101010] normal-case">
                  SC {String(scene.index).padStart(2, "0")}
                </AccentTag>
                <div>
                  <h3 className="text-[15px] font-semibold">{scene.shots[0]?.label ?? scene.title}</h3>
                  <div className="text-xs tracking-wide text-fg-3 uppercase">{scene.slug}</div>
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <Tag>{scene.shots.length} shots</Tag>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-fg-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </div>
              </button>
              {!isCollapsed && (
              <div className="flex flex-col gap-3 px-4.5 py-4">
                {scene.shots.map((shot, shotIdx) => {
                  const priorShots = scene.shots.slice(0, shotIdx);
                  let masterShotIndex: number | null = null;
                  // Only a recurring CHARACTER justifies reusing a prior shot's rendered image — location
                  // continuity is already covered by the location's own reference sheet (in "Attach:" above),
                  // and reusing a shot that has a different, unrelated character baked into it would leak
                  // that character into this shot's generation.
                  for (const asset of shot.assetsUsed) {
                    if (asset.kind !== "character") continue;
                    const prior = priorShots.find((s) => s.assetsUsed.some((a) => a.kind === "character" && a.name === asset.name));
                    if (prior && (masterShotIndex === null || prior.index < masterShotIndex)) masterShotIndex = prior.index;
                  }

                  const sceneName = scene.shots[0]?.label ?? scene.title;
                  const shotTitle = `${scene.index}.${shot.index} ${sceneName}${
                    shot.label && shot.label !== sceneName ? ` · ${shot.label}` : ""
                  }`;

                  return (
                  <div key={shot.id} className="rounded-[10px] border border-line bg-[#0c0c0c] p-3.5">
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2.5">
                        <b className="text-[13px] font-semibold">
                          <span className="font-mono text-accent">
                            {scene.index}.{shot.index}
                          </span>{" "}
                          {sceneName}
                          {shot.label && shot.label !== sceneName && <> · {shot.label}</>}
                        </b>
                        <MiniButton
                          ghost
                          className="!h-5.5 !w-5.5 !p-0"
                          onClick={() => navigator.clipboard.writeText(shotTitle)}
                          title="Copy shot title"
                        >
                          <Copy size={12} />
                        </MiniButton>
                        {shot.durationS != null && <Tag>{shot.durationS}s</Tag>}
                        {shot.aspect && <AccentTag>{shot.aspect}</AccentTag>}
                        {shot.camera && <span className="text-[11.5px] text-fg-3">{shot.camera}</span>}
                      </div>
                      {!!shot.assetsUsed.length && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
                          <Paperclip size={12} className="shrink-0" />
                          Attach:
                          {shot.assetsUsed.map((a) => (
                            <span
                              key={`${a.kind}-${a.name}`}
                              className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-panel-2 px-2 py-0.5 text-fg-2"
                            >
                              {a.kind === "character" ? <User size={11} /> : <MapPin size={11} />}
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {masterShotIndex !== null && (
                        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-isnew">
                          <Paperclip size={12} className="shrink-0" />
                          For continuity, also attach shot {scene.index}.{masterShotIndex}&apos;s generated image
                          alongside the references above.
                        </div>
                      )}
                      <PromptBox
                        label="Start Frame"
                        text={shot.prompt}
                        onCopy={() => navigator.clipboard.writeText(withStyle(shot.prompt, styleContext))}
                      />
                      {shot.frameMode === "start_and_end_frame" && shot.endFramePrompt && (
                        <PromptBox
                          label="End Frame"
                          text={shot.endFramePrompt}
                          onCopy={() =>
                            navigator.clipboard.writeText(withStyle(shot.endFramePrompt!, styleContext))
                          }
                        />
                      )}
                      {shot.videoPrompt && (
                        <PromptBox
                          label="Video Prompt"
                          text={shot.videoPrompt}
                          onCopy={() =>
                            navigator.clipboard.writeText(
                              withFrameDescription(shot.videoPrompt!, shot.prompt, shot.endFramePrompt)
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </section>
            );
          })}
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
