"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ArrowRight, MoreVertical, Copy, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { Menu, MenuItem, MenuTrigger, ConfirmDialog, Input, Textarea } from "@geckoui/geckoui";
import { StoryControlsMenu } from "@/components/StoryControlsMenu";
import { LoadingButton, MiniButton } from "@/components/ui/Button";
import { TopBar, Crumb, Body, Wrap } from "@/components/ui/Layout";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: story, loading } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { trigger: patchStory, loading: savingDetails } = useWrite((api) => api("stories/:id").PATCH());
  const [editingDetails, setEditingDetails] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function startEditDetails() {
    if (!story) return;
    setTitle(story.title);
    setDescription(story.description ?? "");
    setEditingDetails(true);
  }

  async function saveDetails() {
    await patchStory({ params: { id }, body: { title, description } });
    setEditingDetails(false);
  }

  const { trigger: createChapter, loading: creating } = useWrite((api) =>
    api("stories/:id/chapters").POST()
  );
  const { trigger: duplicateChapter } = useWrite((api) => api("chapters/:id/duplicate").POST());
  const { trigger: deleteChapter } = useWrite((api) => api("chapters/:id").DELETE());
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      await duplicateChapter({ params: { id: chapterId }, invalidate: [`stories/${id}`, "chapters/*"] });
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleDelete(chapterId: string, chapterTitle: string) {
    ConfirmDialog.show({
      title: `Delete "${chapterTitle}"?`,
      content: "This deletes the episode's script, assets, and storyboard. Cannot be undone.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        setDeletingId(chapterId);
        try {
          await deleteChapter({ params: { id: chapterId }, invalidate: [`stories/${id}`, "chapters/*"] });
        } finally {
          setDeletingId(null);
        }
        dismiss();
      },
    });
  }

  if (loading && !story) {
    return (
      <>
        <Body>
          <Wrap wide>
            <SkeletonRows label="Loading episodes" />
          </Wrap>
        </Body>
      </>
    );
  }
  if (!story) return null;

  return (
    <>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">{story.title}</span>
        </Crumb>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="pt-6.5">
            {editingDetails ? (
              <div className="max-w-[640px]">
                <Input
                  className="mb-2.5"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Story title"
                />
                <Textarea
                  className="mb-2.5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                />
                <div className="flex gap-2">
                  <LoadingButton
                    variant="primary"
                    className="flex h-8 items-center gap-1.5 text-[12.5px]"
                    onClick={saveDetails}
                    loading={savingDetails}
                  >
                    <Check size={14} /> Save
                  </LoadingButton>
                  <MiniButton onClick={() => setEditingDetails(false)}>
                    <X size={14} /> Cancel
                  </MiniButton>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-2.5">
                  <h1 className="text-2xl font-semibold">{story.title}</h1>
                  <span className="rounded-full border border-line-2 bg-chip px-2.5 py-1 text-[10.5px] text-fg-2">
                    {story.visualStyleName ?? "No style"}
                  </span>
                  <MiniButton ghost className="!h-7 !w-7 !p-0" onClick={startEditDetails} title="Edit title & description">
                    <Pencil size={13} />
                  </MiniButton>
                </div>
                <div className={`max-w-[640px] text-[13.5px] ${!story.description ? "text-fg-3" : "text-fg-2"}`}>
                  {story.description || "No description yet."}
                </div>
              </>
            )}
          </div>

          {chapters.length === 0 ? (
            <>
              <div className="mt-4 flex justify-end">
                <StoryControlsMenu storyId={id} storyTitle={story.title} currentStyleId={story.visualStyleId} currentAspectRatio={story.aspectRatio} currentRegion={story.region} currentMotionStyleId={story.motionStyleId} />
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
                  <StoryControlsMenu storyId={id} storyTitle={story.title} currentStyleId={story.visualStyleId} currentAspectRatio={story.aspectRatio} currentRegion={story.region} currentMotionStyleId={story.motionStyleId} />
                  <LoadingButton variant="primary" onClick={addChapter} loading={creating} className="h-9 text-[13.5px]">
                    + New Episode
                  </LoadingButton>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {chapters.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-4 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 shadow-sm hover:border-line-2"
                  >
                    <Link
                      href={`/stories/${id}/chapters/${c.id}/${c.status === "done" ? "storyboard" : c.status}`}
                      className="flex min-w-0 flex-1 items-center gap-4 text-fg no-underline"
                    >
                      <div className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[9px] border border-line-2 bg-raised font-mono text-xs font-semibold text-fg-2">
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
                            disabled={duplicatingId === c.id || deletingId === c.id}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-hover hover:text-fg disabled:opacity-60"
                            aria-label="Episode options"
                          >
                            {duplicatingId === c.id || deletingId === c.id ? (
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
                      <MenuItem disabled={deletingId === c.id} onClick={() => handleDelete(c.id, c.title)}>
                        <span className="flex items-center gap-2 text-[13px] text-danger">
                          <Trash2 size={14} /> Delete
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

    </>
  );
}
