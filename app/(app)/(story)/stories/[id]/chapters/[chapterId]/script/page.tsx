"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ChapterHeader } from "@/components/ChapterHeader";
import { ScriptEditor, type SaveStatus } from "@/components/ScriptEditor";
import {  } from "@/components/ui/Layout";
import { SkeletonScript } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";

export default function ScriptPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const {
    data: story,
    loading: storyLoading,
    error: storyError,
  } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const {
    data: chapter,
    loading: chapterLoading,
    error: chapterError,
  } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { trigger: patchChapter } = useWrite((api) => api("chapters/:id").PATCH());

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  async function handleChange(json: unknown) {
    setSaveStatus("saving");
    const { error } = await patchChapter({ params: { id: chapterId }, body: { script: json } });
    setSaveStatus(error ? "error" : "saved");
    if (!error) setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
  }

  if (!story || !chapter) {
    const loading = storyLoading || chapterLoading;
    const error = storyError?.error ?? chapterError?.error;

    if (loading) {
      return (
        <>
          <div className="flex-1 overflow-hidden">
            <SkeletonScript label="Loading script" />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-[520px] rounded-xl border border-line-2 bg-panel-2 px-5 py-4 text-center">
            <p className="text-sm font-medium text-fg">Could not load script editor</p>
            <p className="mt-1.5 text-[12.5px] text-fg-3">
              {error ?? "The story or chapter was not found for the current session."}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="script"
        styleName={story.visualStyleName ?? "None"}
        storyAspectRatio={story.aspectRatio}
        chapterAspectRatio={chapter.aspectRatio}
        saveStatus={saveStatus}
      />

      <ScriptEditor content={chapter.script} onChange={handleChange} />

    </>
  );
}
