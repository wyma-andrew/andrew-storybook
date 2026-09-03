"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { StoryControlsMenu } from "@/components/StoryControlsMenu";
import { Button } from "@/components/ui/Button";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: story, loading } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { trigger: createChapter, loading: creating } = useWrite((api) =>
    api("stories/:id/chapters").POST()
  );

  const chapters = story?.chapters ?? [];

  async function startFirstChapter() {
    const { data } = await createChapter({ params: { id }, body: {} });
    if (data) router.push(`/stories/${id}/chapters/${data.id}/script`);
  }

  async function addChapter() {
    const { data } = await createChapter({ params: { id }, body: {} });
    if (data) router.push(`/stories/${id}/chapters/${data.id}/script`);
  }

  if (loading && !story) {
    return (
      <Frame>
        <Body>
          <Wrap wide>
            <p className="text-fg-3">Loading…</p>
          </Wrap>
        </Body>
      </Frame>
    );
  }
  if (!story) return null;

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">{story.title}</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="pt-6.5">
            <div className="mb-1.5 flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold">{story.title}</h1>
              <span className="rounded-full border border-line-2 bg-[#161616] px-2.5 py-1 text-[10.5px] text-fg-2">
                {story.visualStyleName ?? "No style"}
              </span>
            </div>
            <div className={`max-w-[640px] text-[13.5px] ${!story.description ? "text-fg-3" : "text-fg-2"}`}>
              {story.description || "No description yet — add one from Story Settings."}
            </div>
          </div>

          {chapters.length === 0 ? (
            <>
              <div className="mt-4 flex justify-end">
                <StoryControlsMenu storyId={id} currentStyleId={story.visualStyleId} currentStyleName={story.visualStyleName} />
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-line-2 px-6 py-11 text-center">
                <h3 className="mb-2 text-base font-semibold">Nothing here yet</h3>
                <p className="mx-auto mb-5 max-w-[420px] text-[13px] text-fg-2">
                  Start writing and this becomes Episode 1 — Script → Assets → Storyboard. Add more episodes
                  any time and they&apos;ll share this story&apos;s Asset Bible.
                </p>
                <Button variant="primary" onClick={startFirstChapter} disabled={creating} className="flex items-center gap-1.5">
                  {creating ? "Starting…" : <>Start Create Your Story <ArrowRight size={15} /></>}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="my-7.5 mb-3.5 flex items-center gap-3">
                <h2 className="text-[15px] font-semibold">Episodes</h2>
                <div className="ml-auto flex items-center gap-2.5">
                  <StoryControlsMenu storyId={id} currentStyleId={story.visualStyleId} currentStyleName={story.visualStyleName} />
                  <Button variant="primary" onClick={addChapter} disabled={creating} className="h-9 text-[13.5px]">
                    + New Episode
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {chapters.map((c) => (
                  <Link
                    key={c.id}
                    href={`/stories/${id}/chapters/${c.id}/${c.status === "done" ? "storyboard" : c.status}`}
                    className="flex items-center gap-4 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 text-fg no-underline hover:border-line-2"
                  >
                    <div className="grid h-8.5 w-8.5 place-items-center rounded-[9px] border border-line-2 bg-[#151515] font-mono text-xs font-semibold text-fg-2">
                      {String(c.index).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-sm font-semibold">{c.title}</div>
                      <div className="text-xs text-fg-3">Updated {new Date(c.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <ChevronRight size={17} className="text-fg-3" />
                  </Link>
                ))}
              </div>
            </>
          )}
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
