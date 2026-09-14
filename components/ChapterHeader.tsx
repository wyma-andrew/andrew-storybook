"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CircleCheck, CircleAlert, Pencil } from "lucide-react";
import { Select, SelectOption, Dialog, Input } from "@geckoui/geckoui";
import { TRUNCATE_SELECT_VALUE } from "@/lib/constants/select-truncate";
import { ChapterControlsMenu } from "@/components/ChapterControlsMenu";
import { LoadingButton, MiniButton, Button } from "@/components/ui/Button";
import { useRead, useWrite } from "@/lib/spoosh";
import { DEFAULT_REGION } from "@/lib/constants/regions";
import type { SaveStatus } from "@/components/ScriptEditor";

const TABS = [
  { key: "script", label: "1. Script" },
  { key: "assets", label: "2. Assets" },
  { key: "storyboard", label: "3. Storyboard" },
  // Not part of the three-step authoring flow — this is where the renders come
  // BACK from the external image tool, after the three steps have produced the
  // prompts. Numbered anyway, because an unnumbered fourth tab beside three
  // numbered ones reads as a settings page rather than the next thing you do.
  { key: "images", label: "4. Images" },
] as const;

function RenameChapterForm({
  currentTitle,
  onSave,
  dismiss,
}: {
  currentTitle: string;
  onSave: (next: string) => Promise<void>;
  dismiss: () => void;
}) {
  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      dismiss();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-[16px] font-semibold">Rename episode</h2>
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title" />
      <div className="mt-4 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss}>
          Cancel
        </Button>
        <LoadingButton variant="primary" loading={saving} disabled={!title.trim()} onClick={handleSubmit}>
          Save
        </LoadingButton>
      </div>
    </div>
  );
}

export function ChapterHeader({
  storyId,
  storyTitle,
  chapterId,
  chapterTitle,
  active,
  styleName,
  storyAspectRatio,
  chapterAspectRatio,
  saveStatus = "idle",
}: {
  storyId: string;
  storyTitle: string;
  chapterId: string;
  chapterTitle: string;
  active: (typeof TABS)[number]["key"];
  styleName: string;
  storyAspectRatio: string;
  chapterAspectRatio: string | null;
  saveStatus?: SaveStatus;
}) {
  const router = useRouter();
  const { trigger: patchChapter } = useWrite((api) => api("chapters/:id").PATCH());
  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id: storyId } }));
  const chapters = story?.chapters ?? [];

  async function renameEpisode(next: string) {
    await patchChapter({
      params: { id: chapterId },
      body: { title: next },
      invalidate: [`stories/${storyId}`, "chapters/*", `chapters/${chapterId}`],
    });
  }

  function handleChapterChange(nextChapterId: string) {
    if (nextChapterId !== chapterId) router.push(`/stories/${storyId}/chapters/${nextChapterId}/${active}`);
  }

  function openRenameDialog() {
    Dialog.show({
      className: "max-w-[420px] w-full",
      content: ({ dismiss }) => (
        <RenameChapterForm currentTitle={chapterTitle} onSave={renameEpisode} dismiss={dismiss} />
      ),
    });
  }

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-5 py-3.5">
      <div className="flex items-center gap-2 text-[16px] font-medium">
        <Link
          href={`/stories/${storyId}`}
          aria-label={`Back to ${storyTitle}`}
          className="flex shrink-0 items-center justify-center rounded-md p-1 text-fg-2 hover:bg-hover hover:text-fg"
        >
          <ArrowLeft size={22} />
        </Link>
        <Select
          value={chapterId}
          onChange={handleChapterChange}
          wrapperClassName={`w-[220px] max-w-[220px] ${TRUNCATE_SELECT_VALUE}`}
          placeholder={chapterTitle}
        >
          {chapters.map((c) => (
            <SelectOption key={c.id} value={c.id} label={`${String(c.index).padStart(2, "0")} · ${c.title}`} />
          ))}
        </Select>
        <MiniButton ghost onClick={openRenameDialog} aria-label="Rename episode">
          <Pencil size={13} />
        </MiniButton>
        {saveStatus === "saving" && <Loader2 size={15} className="shrink-0 animate-spin text-fg-3" aria-label="Saving" />}
        {saveStatus === "saved" && <CircleCheck size={15} className="shrink-0 text-ok" aria-label="Saved" />}
        {saveStatus === "error" && <CircleAlert size={15} className="shrink-0 text-danger" aria-label="Failed to save" />}
      </div>

      <nav className="flex justify-self-center gap-1 rounded-full border border-line bg-panel-3 p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/stories/${storyId}/chapters/${chapterId}/${t.key}`}
            className={`rounded-full px-4.5 py-1.5 text-sm font-medium whitespace-nowrap no-underline ${
              active === t.key ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-hover hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-3">
        <ChapterControlsMenu
          storyId={storyId}
          chapterId={chapterId}
          styleName={styleName}
          region={story?.region ?? DEFAULT_REGION}
          storyAspectRatio={storyAspectRatio}
          chapterAspectRatio={chapterAspectRatio}
        />
      </div>
    </header>
  );
}
