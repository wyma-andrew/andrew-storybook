"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { ScriptEditor } from "@/components/ScriptEditor";
import { Foot } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { useRead, useWrite } from "@/lib/spoosh";

export default function ScriptPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();
  const router = useRouter();

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
  const { trigger: analyze, loading: analyzing } = useWrite((api) => api("chapters/:id/analyze").POST());

  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  async function handleChange(json: unknown) {
    await patchChapter({ params: { id: chapterId }, body: { script: json } });
  }

  async function handleAnalyze() {
    setAnalyzeError(null);
    const { error } = await analyze({ params: { id: chapterId } });
    if (error) setAnalyzeError(error.error);
    else router.push(`/stories/${id}/chapters/${chapterId}/assets`);
  }

  if (!story || !chapter) {
    const loading = storyLoading || chapterLoading;
    const error = storyError?.error ?? chapterError?.error;

    return (
      <Frame>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-[520px] rounded-xl border border-line-2 bg-panel-2 px-5 py-4 text-center">
            <p className="text-sm font-medium text-fg">{loading ? "Loading script..." : "Could not load script editor"}</p>
            {!loading && (
              <p className="mt-1.5 text-[12.5px] text-fg-3">
                {error ?? "The story or chapter was not found for the current session."}
              </p>
            )}
          </div>
        </div>
        <Foot />
      </Frame>
    );
  }

  return (
    <Frame>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="script"
        styleName={story.visualStyleName ?? "None"}
      />

      <ScriptEditor content={chapter.script} onChange={handleChange} />

      <div className="flex justify-center px-6 pt-4.5 pb-6.5">
        <div className="flex w-full max-w-[1040px] items-center justify-between gap-3 rounded-[14px] border border-line-2 bg-[#0a0a0a] py-3.5 pr-3.5 pl-5.5">
          {analyzeError ? (
            <span className="text-[13px] text-danger">{analyzeError}</span>
          ) : (
            <span className="text-[15px] text-fg-3">Write your script, then switch to Assets to extract characters &amp; locations.</span>
          )}
          <Button
            variant="ghost"
            className="flex h-9.5 shrink-0 items-center gap-1.5 rounded-full bg-[#1c1c1c] px-4.5 text-fg-2 hover:bg-[#232323]"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? "Analyzing…" : <>Analyze <ArrowRight size={15} /></>}
          </Button>
        </div>
      </div>
      <Foot />
    </Frame>
  );
}
