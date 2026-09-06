"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Select, SelectOption, ConfirmDialog } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { useRead, useWrite } from "@/lib/spoosh";

export function StoryControlsMenu({
  storyId,
  storyTitle,
  currentStyleId,
  currentStyleName,
}: {
  storyId: string;
  storyTitle: string;
  currentStyleId: string | null;
  currentStyleName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: styles } = useRead((api) => api("visual-styles").GET(), { enabled: open });
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
    await patchStory({ params: { id: storyId }, body: { visualStyleId: value } });
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
            <Select
              value={currentStyleId ?? ""}
              onChange={handleStyleChange}
              placeholder={currentStyleName ?? "None set"}
              disabled={!styles}
            >
              {styles?.map((s) => (
                <SelectOption key={s.id} value={s.id} label={s.name} />
              ))}
            </Select>
          </div>
          <div className="overflow-hidden rounded-b-[10px] border-t border-line">
            <Link
              href={`/stories/${storyId}/bible`}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] text-fg no-underline hover:bg-[#1c1c1c]"
              onClick={() => setOpen(false)}
            >
              Manage Bible
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] text-danger hover:bg-[#1c1c1c]"
            >
              Delete story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
