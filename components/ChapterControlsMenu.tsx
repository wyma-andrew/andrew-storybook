"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Select, SelectOption, toast } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { useWrite } from "@/lib/spoosh";
import { ASPECT_RATIOS } from "@/lib/constants/aspect-ratios";
import { REGIONS } from "@/lib/constants/regions";
import type { Region } from "@/lib/constants/regions";

export function ChapterControlsMenu({
  // Still needed by the aspect-ratio mutation, which invalidates the story read.
  storyId,
  chapterId,
  styleName,
  region,
  storyAspectRatio,
  chapterAspectRatio,
}: {
  storyId: string;
  chapterId: string;
  styleName: string;
  region: Region;
  storyAspectRatio: string;
  chapterAspectRatio: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { trigger: patchChapter } = useWrite((api) => api("chapters/:id").PATCH());

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleAspectChange(value: string) {
    await patchChapter({
      params: { id: chapterId },
      body: { aspectRatio: value },
      invalidate: [`stories/${storyId}`, "chapters/*", `chapters/${chapterId}`],
      optimistic: (cache) => cache(`chapters/${chapterId}`).set((current) => ({ ...current, aspectRatio: value })),
    });
    toast.info("Aspect ratio updated — regenerate the storyboard to apply it to shots.");
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        variant="secondary"
        className="flex h-9 items-center gap-2 !px-2.5 text-[13.5px] md:!px-3.5"
        onClick={() => setOpen((o) => !o)}
        aria-label="Chapter options"
        title="Chapter options"
      >
        <SlidersHorizontal size={15} className="md:hidden" />
        <span className="hidden md:inline">Chapter options</span>
        <ChevronDown size={15} className="hidden text-fg-3 md:block" />
      </Button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(260px,calc(100vw-2rem))] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)]">
          <div className="border-b border-line px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Visual style</label>
            <div className="flex items-center rounded-lg border border-line-2 bg-raised px-3 py-2 text-[13px] text-fg-2">
              {styleName}
            </div>
          </div>
          {/* Read-only here, like Visual style above it. Region is a property of
              the STORY — it swaps the prompt variant used by asset extraction,
              asset regeneration and storyboard generation — so a picker sitting
              in a chapter menu implied it could differ per chapter, and changing
              it from one chapter silently re-aimed every other one. It is shown
              because a chapter's prompts are generated under it; it is changed
              in the story's own controls. */}
          <div className="border-b border-line px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Region</label>
            <div className="flex items-center rounded-lg border border-line-2 bg-raised px-3 py-2 text-[13px] text-fg-2">
              {REGIONS.find((r) => r.value === region)?.label ?? region}
            </div>
          </div>
          <div className="rounded-b-[10px] px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Aspect ratio</label>
            <Select value={chapterAspectRatio ?? storyAspectRatio} onChange={handleAspectChange}>
              {ASPECT_RATIOS.map((r) => (
                <SelectOption key={r.value} value={r.value} label={r.label} />
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
