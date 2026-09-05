"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ArrowRight, MoreVertical, Copy, Loader2 } from "lucide-react";
import { Menu, MenuItem, MenuTrigger } from "@geckoui/geckoui";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { StoryControlsMenu } from "@/components/StoryControlsMenu";
import { LoadingButton } from "@/components/ui/Button";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: story, loading } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { trigger: createChapter, loading: creating } = useWrite((api) =>
    api("stories/:id/chapters").POST()
  );
  const { trigger: duplicateChapter } = useWrite((api) => api("chapters/:id/duplicate").POST());
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const chapters = story?.chapters ?? [];

  async function startFirstChapter() {
    const { data } = await createChapter({ params: { id }, body: {} });
    if (data) router.push(`/stories/${id}/chapters/${data.id}/script`);
  }

  async function addChapter() {
    const { data } = await createChapter({ params: { id }, body: {} });
    if (data) router.push(`/stories/${id}/chapters/${data.id}/script`);
  }

  async function handleDuplicate(chapterId: string) {
    setDuplicatingId(chapterId);
    try {
      await duplicateChapter({ params: { id: chapterId }, invalidate: [`stories/${id}`, "chapters"] });
    } finally {
      setDuplicatingId(null);
    }
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
                <LoadingButton
                  variant="primary"
                  onClick={startFirstChapter}
                  loading={creating}
                  className="mx-auto flex items-center gap-1.5"
                >
                  Start Create Your Story <ArrowRight size={15} />
                </LoadingButton>
              </div>
            </>
          ) : (
            <>
              <div className="my-7.5 mb-3.5 flex items-center gap-3">
                <h2 className="text-[15px] font-semibold">Episodes</h2>
                <div className="ml-auto flex items-center gap-2.5">
                  <StoryControlsMenu storyId={id} currentStyleId={story.visualStyleId} currentStyleName={story.visualStyleName} />
                  <LoadingButton variant="primary" onClick={addChapter} loading={creating} className="h-9 text-[13.5px]">
                    + New Episode
                  </LoadingButton>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {chapters.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-4 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 hover:border-line-2"
                  >
                    <Link
                      href={`/stories/${id}/chapters/${c.id}/${c.status === "done" ? "storyboard" : c.status}`}
                      className="flex min-w-0 flex-1 items-center gap-4 text-fg no-underline"
                    >
                      <div className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[9px] border border-line-2 bg-[#151515] font-mono text-xs font-semibold text-fg-2">
                        {String(c.index).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 text-sm font-semibold">{c.title}</div>
                        <div className="text-xs text-fg-3">Updated {new Date(c.updatedAt).toLocaleDateString()}</div>
                      </div>
                    </Link>
                    <Menu
                      menuClassName="w-[170px] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)] py-1"
                    >
                      <MenuTrigger>
                        {({ toggleMenu }) => (
                          <button
                            type="button"
                            onClick={toggleMenu}
                            disabled={duplicatingId === c.id}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-[#1c1c1c] hover:text-fg disabled:opacity-60"
                            aria-label="Episode options"
                          >
                            {duplicatingId === c.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <MoreVertical size={16} />
                            )}
                          </button>
                        )}
                      </MenuTrigger>
                      <MenuItem disabled={duplicatingId === c.id} onClick={() => handleDuplicate(c.id)}>
                        <span className="flex items-center gap-2 text-[13px]">
                          <Copy size={14} /> Duplicate
                        </span>
                      </MenuItem>
                    </Menu>
                    <ChevronRight size={17} className="shrink-0 text-fg-3" />
                  </div>
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
