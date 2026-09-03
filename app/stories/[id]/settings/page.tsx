"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { Button, LinkButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { Input, Textarea, Select, SelectOption, ConfirmDialog } from "@geckoui/geckoui";
import { useRead, useWrite } from "@/lib/spoosh";
import type { Story } from "@/lib/api/types";

function SettingsForm({ id, story }: { id: string; story: Story }) {
  const router = useRouter();
  const { trigger: patchStory, loading: saving } = useWrite((api) => api("stories/:id").PATCH());
  const { trigger: deleteStory, loading: deleting } = useWrite((api) => api("stories/:id").DELETE());
  const { data: styles } = useRead((api) => api("visual-styles").GET({ query: { storyId: id } }));
  const { trigger: patchStyle } = useWrite((api) => api("stories/:id").PATCH());

  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description ?? "");

  async function handleSave() {
    await patchStory({ params: { id }, body: { title, description } });
    router.push(`/stories/${id}`);
  }

  function handleDelete() {
    ConfirmDialog.show({
      title: `Delete "${story.title}"?`,
      content: "This deletes every episode, script, and bible entry. Cannot be undone.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await deleteStory({ params: { id } });
        dismiss();
        router.push("/stories");
      },
    });
  }

  return (
    <Wrap>
      <div className="mb-6">
        <h1 className="text-[18px] font-semibold">Story Settings</h1>
      </div>

      <Field label="Story title">
        <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Field label="Default visual style">
        <Select
          value={story.visualStyleId ?? undefined}
          onChange={(v) => patchStyle({ params: { id }, body: { visualStyleId: v } })}
          placeholder={story.visualStyleName ?? "None set"}
        >
          {styles?.map((s) => (
            <SelectOption key={s.id} value={s.id} label={s.name} />
          ))}
        </Select>
      </Field>

      <div className="mt-2 flex gap-2.5">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton variant="secondary" href={`/stories/${id}`}>
          Cancel
        </LinkButton>
      </div>

      <div className="mt-7.5 rounded-[10px] border border-danger-border bg-danger-bg px-4.5 py-4">
        <h3 className="mb-1 text-[13px] text-danger">Danger zone</h3>
        <div className="flex items-center gap-3.5 pt-3">
          <div>
            <div className="text-[13px] font-semibold">Delete story</div>
            <div className="text-xs text-fg-3">
              Permanently deletes all episodes, scripts, storyboards, and bible entries. Cannot be undone.
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete story"}
            </Button>
          </div>
        </div>
      </div>
    </Wrap>
  );
}

export default function StorySettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));

  if (!story) return null;

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <Link href={`/stories/${id}`}>{story.title}</Link> /{" "}
          <span className="text-fg">Story Settings</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <SettingsForm key={story.id} id={id} story={story} />
      </Body>

      <Foot />
    </Frame>
  );
}
