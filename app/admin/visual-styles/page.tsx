"use client";

import { useState } from "react";
import { Dialog, Input, Textarea } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useRead, useWrite } from "@/lib/spoosh";
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
        <Button variant="primary" disabled={loading || !name.trim()} onClick={handleSubmit}>
          {loading ? "Saving…" : style ? "Save changes" : "+ Add style"}
        </Button>
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

export default function AdminVisualStylesPage() {
  const { data: styles } = useRead((api) => api("visual-styles").GET());

  return (
    <>
      <div className="mb-5 flex items-start gap-3">
        <div>
          <h1 className="mb-1.5 text-[18px] font-semibold">Visual Styles</h1>
          <div className="max-w-[560px] text-[12.5px] text-fg-3">
            Global visual styles available to every story. The description is injected as the [Style]
            prompt on every character &amp; location generation.
          </div>
        </div>
        <Button variant="primary" className="ml-auto shrink-0" onClick={() => openStyleDialog()}>
          + New style
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        {styles?.map((s) => (
          <div
            key={s.id}
            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 hover:border-line-2"
            onClick={() => openStyleDialog(s)}
          >
            <div className="h-8 w-8 shrink-0 rounded-lg border border-line-2" style={{ background: s.swatch ?? "#8a8a8a" }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="truncate text-xs text-fg-3">{s.description}</div>
            </div>
            <span className="shrink-0 rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">GLOBAL</span>
          </div>
        ))}
        {!styles?.length && <span className="text-[12.5px] text-fg-3">No styles yet.</span>}
      </div>
    </>
  );
}
