"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Select, SelectOption, ConfirmDialog, toast } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { useWrite } from "@/lib/spoosh";
import { ASPECT_RATIOS } from "@/lib/constants/aspect-ratios";
import { VISUAL_STYLES } from "@/lib/constants/visual-styles";
import { REGIONS, type Region } from "@/lib/constants/regions";
import { MOTION_STYLES, DEFAULT_MOTION_STYLE_ID } from "@/lib/constants/motion-styles";

export function StoryControlsMenu({
  storyId,
  storyTitle,
  currentStyleId,
  currentAspectRatio,
  currentRegion,
  currentMotionStyleId,
}: {
  storyId: string;
  storyTitle: string;
  currentStyleId: string | null;
  currentAspectRatio: string;
  currentRegion: Region;
  currentMotionStyleId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // A story's visualStyleId can be a leftover reference from before styles
  // moved into code (e.g. a deleted DB row's uuid) — the server (see
  // lib/visual-styles.ts resolveOrDefault) already falls back to the single
  // default style for any id that doesn't resolve, so mirror that here
  // rather than showing the raw dangling id or a false "None set".
  const resolvedStyleId = VISUAL_STYLES.some((s) => s.id === currentStyleId) ? currentStyleId : VISUAL_STYLES[0]?.id ?? null;

  // Same dangling-id handling as visual style: a motion style removed from
  // code leaves stories pointing at a slug that no longer exists, and the
  // server already resolves that to DEFAULT_MOTION_STYLE_ID.
  const resolvedMotionStyleId = MOTION_STYLES.some((s) => s.id === currentMotionStyleId)
    ? currentMotionStyleId
    : DEFAULT_MOTION_STYLE_ID;

  const { trigger: patchStory } = useWrite((api) => api("stories/:id").PATCH());
  const { trigger: deleteStory } = useWrite((api) => api("stories/:id").DELETE());

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleStyleChange(value: string) {
    const picked = VISUAL_STYLES.find((s) => s.id === value);
    await patchStory({
      params: { id: storyId },
      body: { visualStyleId: value },
      optimistic: (cache) =>
        cache(`stories/${storyId}`).set((current) => ({
          ...current,
          visualStyleId: value,
          visualStyleName: picked?.name ?? current.visualStyleName,
        })),
    });
  }

  async function handleAspectChange(value: string) {
    await patchStory({
      params: { id: storyId },
      body: { aspectRatio: value },
      optimistic: (cache) => cache(`stories/${storyId}`).set((current) => ({ ...current, aspectRatio: value })),
    });
    toast.info("Aspect ratio updated — regenerate a chapter's storyboard to apply it to shots.");
  }

  async function handleRegionChange(value: string) {
    const region = value as Region;
    await patchStory({
      params: { id: storyId },
      body: { region },
      optimistic: (cache) => cache(`stories/${storyId}`).set((current) => ({ ...current, region })),
    });
    toast.info("Region updated — re-run asset extraction/regeneration/storyboard to apply it.");
  }

  async function handleMotionStyleChange(value: string) {
    await patchStory({
      params: { id: storyId },
      body: { motionStyleId: value },
      optimistic: (cache) =>
        cache(`stories/${storyId}`).set((current) => ({ ...current, motionStyleId: value })),
    });
    toast.info("Motion style updated — copied video prompts use it right away, no regeneration needed.");
  }

  function handleDelete() {
    setOpen(false);
    ConfirmDialog.show({
      title: `Delete "${storyTitle}"?`,
      content: "Moves the story to Trash. You can restore it later from Stories → Trash.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await deleteStory({ params: { id: storyId }, invalidate: ["stories", "stories/trash"] });
        dismiss();
        router.push("/stories");
      },
    });
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        variant="secondary"
        className="flex h-9 items-center gap-2 text-[13.5px]"
        onClick={() => setOpen((o) => !o)}
      >
        Story options
        <ChevronDown size={15} className="text-fg-3" />
      </Button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[260px] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)]">
          <div className="px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Visual style</label>
            <Select value={resolvedStyleId ?? ""} onChange={handleStyleChange} placeholder="None set">
              {VISUAL_STYLES.map((s) => (
                <SelectOption key={s.id} value={s.id} label={s.name} />
              ))}
            </Select>
          </div>
          <div className="border-t border-line px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Motion style</label>
            <Select value={resolvedMotionStyleId} onChange={handleMotionStyleChange}>
              {MOTION_STYLES.map((s) => (
                <SelectOption key={s.id} value={s.id} label={s.name} />
              ))}
            </Select>
          </div>
          <div className="border-t border-line px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Aspect ratio</label>
            <Select value={currentAspectRatio} onChange={handleAspectChange}>
              {ASPECT_RATIOS.map((r) => (
                <SelectOption key={r.value} value={r.value} label={r.label} />
              ))}
            </Select>
          </div>
          <div className="border-t border-line px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] tracking-wider text-fg-3 uppercase">Region</label>
            <Select value={currentRegion} onChange={handleRegionChange}>
              {REGIONS.map((r) => (
                <SelectOption key={r.value} value={r.value} label={r.label} />
              ))}
            </Select>
          </div>
          <div className="overflow-hidden rounded-b-[10px] border-t border-line">
            <Link
              href={`/stories/${storyId}/bible`}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] text-fg no-underline hover:bg-hover"
              onClick={() => setOpen(false)}
            >
              Manage Bible
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] text-danger hover:bg-hover"
            >
              Delete story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
