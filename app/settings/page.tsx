"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { Dialog, Input, Textarea, ConfirmDialog } from "@geckoui/geckoui";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { SectionHead } from "@/components/ui/SectionHead";
import { AdminBlock } from "@/components/ui/AdminBlock";
import { Button, LoadingButton, MiniButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { SYSTEM_PROMPTS } from "@/lib/constants/system-prompts";
import type { VisualStyle } from "@/lib/api/types";

function StyleForm({ style, dismiss }: { style?: VisualStyle; dismiss: () => void }) {
  const [name, setName] = useState(style?.name ?? "");
  const [description, setDescription] = useState(style?.description ?? "");
  const [swatch, setSwatch] = useState(style?.swatch ?? "#8a8a8a");
  const { trigger: create, loading: creating, error: createError } = useWrite((api) => api("visual-styles").POST());
  const { trigger: update, loading: updating, error: updateError } = useWrite((api) => api("visual-styles/:id").PATCH());

  const loading = creating || updating;
  const error = createError ?? updateError;

  async function handleSubmit() {
    if (!name.trim()) return;
    if (style) {
      const { data } = await update({ params: { id: style.id }, body: { name: name.trim(), description, swatch } });
      if (data) dismiss();
    } else {
      const { data } = await create({ body: { name: name.trim(), description: description.trim() || undefined, swatch } });
      if (data) dismiss();
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-[16px] font-semibold">{style ? "Edit style" : "Add a new style"}</h2>
      {error && <div className="mb-3 text-[13px] text-danger">{error.error}</div>}

      <div className="flex gap-4">
        <div className="shrink-0">
          <Field label="Swatch">
            <Input
              type="color"
              value={swatch}
              onChange={(e) => setSwatch(e.target.value)}
              className="h-10 w-16 min-h-0 cursor-pointer p-1"
              inputClassName="cursor-pointer p-0"
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Watercolour" />
          </Field>
        </div>
      </div>

      <Field label="Prompt / description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[110px]"
          placeholder="Full injected style prompt shown to every character & location prompt."
        />
      </Field>

      <div className="mt-2 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss}>
          Cancel
        </Button>
        <LoadingButton variant="primary" loading={loading} disabled={!name.trim()} onClick={handleSubmit}>
          {style ? "Save changes" : "+ Add style"}
        </LoadingButton>
      </div>
    </div>
  );
}

function openStyleDialog(style?: VisualStyle) {
  Dialog.show({
    className: "max-w-[520px] w-full",
    content: ({ dismiss }) => <StyleForm style={style} dismiss={dismiss} />,
  });
}

export default function SettingsPage() {
  const { data: styles } = useRead((api) => api("visual-styles").GET());
  const { trigger: removeStyle } = useWrite((api) => api("visual-styles/:id").DELETE());

  const character = SYSTEM_PROMPTS.character;
  const location = SYSTEM_PROMPTS.location;

  function handleDelete(style: VisualStyle) {
    ConfirmDialog.show({
      title: `Delete "${style.name}"?`,
      content: "Stories using this style keep their current prompt injection; you just can't pick it again.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await removeStyle({ params: { id: style.id } });
        dismiss();
      },
    });
  }

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Settings</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap wide>
          <section className="mb-11">
            <div className="mb-4 flex items-start gap-3">
              <div>
                <SectionHead title="Visual Styles" count="Your library · used across all your stories" />
                <div className="mt-1 text-[12.5px] text-fg-3">
                  Applies as the [Style] injection on every character &amp; location prompt.
                </div>
              </div>
              <Button variant="primary" className="ml-auto shrink-0" onClick={() => openStyleDialog()}>
                + New style
              </Button>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
              {styles?.map((s) => (
                <div className="rounded-[10px] border border-line bg-panel-2 p-3.5" key={s.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-6.5 w-6.5 rounded-lg border border-line-2" style={{ background: s.swatch ?? "#8a8a8a" }} />
                    <b className="text-sm">{s.name}</b>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      {s.locked ? (
                        <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">Built-in</span>
                      ) : (
                        <>
                          <MiniButton ghost onClick={() => openStyleDialog(s)}>
                            <Pencil size={13} />
                          </MiniButton>
                          <MiniButton ghost onClick={() => handleDelete(s)}>
                            <Trash2 size={13} />
                          </MiniButton>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-fg-2">{s.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="System Prompts" count="Platform-wide · fixed" />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Fixed boilerplate injected into every character &amp; location prompt. Not editable in the app —
              keeps every story on the same production baseline.
            </div>

            <AdminBlock title="Character preset" badge="LOCKED">
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                <Lock size={13} /> You can view this preset but cannot edit it.
              </div>
              <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">{character}</div>
            </AdminBlock>

            <AdminBlock title="Location preset" badge="LOCKED" className="mt-3.5">
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                <Lock size={13} /> You can view this preset but cannot edit it.
              </div>
              <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">{location}</div>
            </AdminBlock>
          </section>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
