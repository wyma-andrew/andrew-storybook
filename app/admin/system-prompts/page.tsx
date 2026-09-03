"use client";

import { useState } from "react";
import { Dialog, Textarea } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { useRead, useWrite } from "@/lib/spoosh";
import type { SystemPrompt } from "@/lib/api/types";

function PromptForm({ prompt, dismiss }: { prompt: SystemPrompt; dismiss: () => void }) {
  const [value, setValue] = useState(prompt.prompt);
  const { trigger: save, loading, error } = useWrite((api) => api("system-prompts/:kind").PATCH());

  async function handleSubmit() {
    if (!value.trim()) return;
    const { data } = await save({ params: { kind: prompt.kind }, body: { prompt: value.trim() } });
    if (data) dismiss();
  }

  return (
    <div>
      <h2 className="mb-4 text-[16px] font-semibold">
        {prompt.kind === "character" ? "Character preset" : "Location preset"}
      </h2>
      {error && <div className="mb-3 text-[13px] text-danger">{error.error}</div>}

      <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[140px]" />

      <div className="mt-2 flex items-center gap-2.5">
        <div className="mr-auto text-[11.5px] text-fg-3">updated {new Date(prompt.updatedAt).toLocaleString()}</div>
        <Button variant="secondary" onClick={dismiss}>
          Cancel
        </Button>
        <Button variant="primary" disabled={loading || !value.trim()} onClick={handleSubmit}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function openPromptDialog(prompt: SystemPrompt) {
  Dialog.show({
    className: "max-w-[560px] w-full",
    content: ({ dismiss }) => <PromptForm prompt={prompt} dismiss={dismiss} />,
  });
}

export default function AdminSystemPromptsPage() {
  const { data: prompts } = useRead((api) => api("system-prompts").GET());

  return (
    <>
      <h1 className="mb-1.5 text-[18px] font-semibold">System Prompts</h1>
      <div className="mb-5 max-w-[640px] text-[12.5px] text-fg-3">
        Injected into every character and location prompt, platform-wide, for every story and every
        user. Story owners see only a locked badge. Changes apply immediately to new generations.
      </div>

      <div className="flex flex-col gap-2.5">
        {prompts?.map((p) => (
          <div
            key={p.kind}
            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 hover:border-line-2"
            onClick={() => openPromptDialog(p)}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{p.kind === "character" ? "Character preset" : "Location preset"}</div>
              <div className="truncate text-xs text-fg-3">{p.prompt}</div>
            </div>
            <span className="shrink-0 rounded-full border border-sys-badge-border bg-sys-badge-bg px-2.5 py-1 text-[10px] tracking-wide text-sys-badge">
              EDITABLE
            </span>
          </div>
        ))}
        {!prompts?.length && <span className="text-[12.5px] text-fg-3">Loading…</span>}
      </div>
    </>
  );
}
