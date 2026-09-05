"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Frame } from "@/components/Frame";
import { LinkButton, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea, Select, SelectOption } from "@geckoui/geckoui";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";

export default function CreateStoryPage() {
  const router = useRouter();
  const { data: styles } = useRead((api) => api("visual-styles").GET());
  const { trigger: createStory, loading } = useWrite((api) => api("stories").POST());

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);

  const selected = styleId ?? styles?.[0]?.id ?? null;

  async function handleCreate() {
    if (!title.trim()) return;
    const { data, error } = await createStory({
      body: { title: title.trim(), description: description.trim() || undefined, visualStyleId: selected },
    });
    if (data) router.push(`/stories/${data.id}`);
    else if (error) alert(error.error);
  }

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Create Story</span>
        </Crumb>
      </TopBar>

      <Body>
        <Wrap>
          <div className="mb-6">
            <h1 className="text-[18px] font-semibold">Create Story</h1>
          </div>

          <Field label="Story title">
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Last Lighthouse" />
          </Field>

          <Field label={<>Description <span className="normal-case text-fg-3">(optional)</span></>}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One or two lines about the story — helps AI keep tone consistent across episodes."
            />
          </Field>

          <Field label="Visual style" hint="You can switch to a custom style for this story later, from Story Settings.">
            <Select value={selected ?? ""} onChange={setStyleId} placeholder="Choose a style" disabled={!styles}>
              {styles?.map((s) => (
                <SelectOption key={s.id} value={s.id} label={s.name} />
              ))}
            </Select>
          </Field>

          <div className="mt-2 flex gap-2.5">
            <LoadingButton variant="primary" onClick={handleCreate} loading={loading} disabled={!title.trim()}>
              Create story
            </LoadingButton>
            <LinkButton variant="secondary" href="/stories">
              Cancel
            </LinkButton>
          </div>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
