"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@geckoui/geckoui";
import { LinkButton, LoadingButton, MiniButton } from "@/components/ui/Button";
import { AccentTag } from "@/components/ui/Tag";
import { TopBar, Crumb, Body, Wrap } from "@/components/ui/Layout";
import { SkeletonStoryGrid } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";

export default function StoriesTrashPage() {
  const { data: stories, loading, error } = useRead((api) => api("stories/trash").GET());
  const { trigger: restoreStory, loading: restoring } = useWrite((api) => api("stories/:id/restore").POST());
  const { trigger: deleteForever } = useWrite((api) => api("stories/:id/permanent").DELETE());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDeleteForever(id: string, title: string) {
    ConfirmDialog.show({
      title: `Permanently delete "${title}"?`,
      content: "This removes every episode, script, and bible entry for good. Cannot be undone.",
      confirmButtonLabel: "Delete forever",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        setDeletingId(id);
        try {
          await deleteForever({ params: { id }, invalidate: "stories/trash" });
        } finally {
          setDeletingId(null);
        }
        dismiss();
      },
    });
  }

  return (
    <>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Trash</span>
        </Crumb>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mb-5 flex items-baseline gap-2.5">
            <h1 className="text-xl font-semibold">Trash</h1>
            <span className="text-[13px] text-fg-3">{stories?.length ?? 0} deleted stories</span>
          </div>

          {error && <p className="text-danger">Couldn&apos;t load trash: {error.error}</p>}
          {loading && !stories && <SkeletonStoryGrid count={3} label="Loading trash" />}
          {!loading && !stories?.length && <p className="text-fg-3">Nothing in the trash.</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {stories?.map((s) => (
              <div key={s.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2">
                <div className="flex h-[130px] items-end border-b border-line bg-gradient-to-br from-thumb-from to-thumb-to p-3">
                  <AccentTag className="uppercase tracking-wide">{s.visualStyleName ?? "No style"}</AccentTag>
                </div>
                <div className="px-4 pt-3.5 pb-4">
                  <h3 className="mb-1.5 text-[15px] font-semibold">{s.title}</h3>
                  <div className="mb-3.5 line-clamp-2 text-[12.5px] text-fg-2">{s.description || "No description yet."}</div>
                  <div className="mb-3.5 flex gap-3.5 border-t border-line pt-3 text-[11.5px] text-fg-3">
                    <span>
                      <b className="font-semibold text-fg-2">{s.chapterCount}</b> episodes
                    </span>
                    <span>Deleted {s.deletedAt ? new Date(s.deletedAt).toLocaleDateString() : ""}</span>
                  </div>
                  <div className="flex gap-2">
                    <LoadingButton
                      variant="secondary"
                      className="flex h-9 flex-1 items-center justify-center gap-1.5 text-[12.5px]"
                      loading={restoring}
                      onClick={() => restoreStory({ params: { id: s.id }, invalidate: ["stories", "stories/trash"] })}
                    >
                      <RotateCcw size={13} /> Restore
                    </LoadingButton>
                    <MiniButton
                      className="!h-9 !w-9 !shrink-0 !border-danger-border !p-0 !text-danger"
                      disabled={deletingId === s.id}
                      onClick={() => handleDeleteForever(s.id, s.title)}
                      title="Delete forever"
                    >
                      <Trash2 size={13} />
                    </MiniButton>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <LinkButton variant="secondary" href="/stories">
              Back to Stories
            </LinkButton>
          </div>
        </Wrap>
      </Body>

    </>
  );
}
