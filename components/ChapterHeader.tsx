"use client";

import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { EditableLabel } from "@/components/ui/EditableLabel";
import { useWrite } from "@/lib/spoosh";

const TABS = [
  { key: "script", label: "1. Script" },
  { key: "assets", label: "2. Assets" },
  { key: "storyboard", label: "3. Storyboard" },
] as const;

export function ChapterHeader({
  storyId,
  storyTitle,
  chapterId,
  chapterTitle,
  active,
  styleName,
}: {
  storyId: string;
  storyTitle: string;
  chapterId: string;
  chapterTitle: string;
  active: (typeof TABS)[number]["key"];
  styleName: string;
}) {
  const { trigger: patchChapter } = useWrite((api) => api("chapters/:id").PATCH());

  async function renameEpisode(next: string) {
    await patchChapter({ params: { id: chapterId }, body: { title: next } });
  }

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-5 py-3.5">
      <div className="flex flex-col gap-0.5 text-[16px] font-medium">
        <span className="flex items-center gap-2 text-[12.5px] text-fg-3">
          <Link href={`/stories/${storyId}`} className="text-fg-3 no-underline hover:text-fg">
            {storyTitle}
          </Link>
          <span>/</span>
        </span>
        <EditableLabel value={chapterTitle} onSave={renameEpisode} className="text-[16px] font-medium text-fg" />
      </div>

      <nav className="flex justify-self-center gap-1 rounded-full border border-line bg-[#111] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/stories/${storyId}/chapters/${chapterId}/${t.key}`}
            className={`rounded-full px-4.5 py-1.5 text-sm font-medium whitespace-nowrap no-underline ${
              active === t.key ? "bg-[#232323] text-fg" : "text-fg-2 hover:bg-[#171717] hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-3">
        <span className="text-[13px] text-fg-3">Style</span>
        <div className="flex items-center gap-6 rounded-lg border border-line-2 px-3 py-2 text-sm font-medium text-fg">
          {styleName}
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}
