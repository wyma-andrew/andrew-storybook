"use client";

import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Clapperboard, Paperclip, User, MapPin } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, MiniButton } from "@/components/ui/Button";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { withStyle } from "@/lib/prompt-copy";

function PromptBox({ label, text, onCopy }: { label: string; text: string; onCopy: () => void }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">{label}</div>
      <div className="relative rounded-lg border border-line-2 bg-[#080808] p-3 pr-[88px] font-mono text-[12.5px] whitespace-pre-wrap text-[#c2c2c2]">
        {text}
        <MiniButton className="absolute top-2.5 right-2.5" onClick={onCopy}>
          Copy
        </MiniButton>
      </div>
    </div>
  );
}

export default function StoryboardPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: scenes, trigger: refetchScenes } = useRead((api) =>
    api("chapters/:id/storyboard").GET({ params: { id: chapterId } })
  );
  const { trigger: generate, loading: generating } = useWrite((api) =>
    api("chapters/:id/storyboard/generate").POST()
  );

  async function handleGenerate() {
    await generate({ params: { id: chapterId } });
    refetchScenes();
  }

  if (!story || !chapter) return null;

  return (
    <Frame>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="storyboard"
        styleName={story.visualStyleName ?? "None"}
      />

      <Toolbar>
        <span className="mr-1.5 text-fg-3">Storyboard:</span>
        <ToolbarButton onClick={handleGenerate} disabled={generating}>
          {!!scenes?.length && <RefreshCw size={13} />}
          {generating ? "Generating…" : scenes?.length ? "Regenerate" : "Generate storyboard"}
        </ToolbarButton>
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

          {scenes?.map((scene) => (
            <section key={scene.id} className="mb-4.5 overflow-hidden rounded-xl border border-line bg-panel-2">
              <div className="flex items-center gap-3.5 border-b border-line bg-[#101010] px-4.5 py-4">
                <AccentTag className="font-mono text-xs font-semibold tracking-normal normal-case">
                  SC {String(scene.index).padStart(2, "0")}
                </AccentTag>
                <div>
                  <h3 className="text-[15px] font-semibold">{scene.title}</h3>
                  <div className="text-xs tracking-wide text-fg-3 uppercase">{scene.slug}</div>
                </div>
                <div className="ml-auto flex gap-1.5">
                  <Tag>{scene.shots.length} shots</Tag>
                </div>
              </div>
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

                  return (
                  <div key={shot.id} className="grid grid-cols-[56px_1fr] gap-3.5 rounded-[10px] border border-line bg-[#0c0c0c] p-3.5">
                    <div className="grid h-6.5 place-items-center rounded-md border border-line-2 font-mono text-[11px] font-semibold text-fg-2">
                      {scene.index}.{shot.index}
                    </div>
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2.5">
                        <b className="text-[13px] font-semibold">{shot.label}</b>
                        {shot.durationS != null && <span className="text-[11.5px] text-fg-3">{shot.durationS}s</span>}
                        {shot.aspect && <span className="text-[11.5px] text-fg-3">{shot.aspect}</span>}
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
                        onCopy={() => navigator.clipboard.writeText(withStyle(shot.prompt, story.visualStyleDescription))}
                      />
                      {shot.frameMode === "start_and_end_frame" && shot.endFramePrompt && (
                        <PromptBox
                          label="End Frame"
                          text={shot.endFramePrompt}
                          onCopy={() =>
                            navigator.clipboard.writeText(withStyle(shot.endFramePrompt!, story.visualStyleDescription))
                          }
                        />
                      )}
                      {shot.videoPrompt && (
                        <PromptBox
                          label="Video Prompt"
                          text={shot.videoPrompt}
                          onCopy={() => navigator.clipboard.writeText(shot.videoPrompt!)}
                        />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
