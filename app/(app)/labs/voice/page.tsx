"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmDialog, Dialog, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { FileText, Loader2, RotateCw, Sparkles, Trash2, Volume2, WandSparkles } from "lucide-react";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import {
  splitVoiceLabScript,
  VOICE_LAB_MAX_TEXT_LENGTH,
  VOICE_LAB_PROFILES,
  type VoiceLabItem,
} from "@/lib/voice-lab";

const POLL_MS = 2500;

function ImportDialogBody({ dismiss }: { dismiss: () => void }) {
  const [script, setScript] = useState("");
  const { trigger: importScript, loading } = useWrite((api) => api("labs/voice/items").POST());
  const lineCount = splitVoiceLabScript(script).length;

  async function handleImport() {
    const result = await importScript({ body: { script } });
    if (result.error) {
      toast.error(result.error.error);
      return;
    }
    toast.success(`Imported ${result.data?.length ?? 0} lines.`);
    dismiss();
  }

  return (
    <div>
      <h3 className="text-base font-semibold">Import script</h3>
      <p className="mt-1 text-xs text-fg-3">Every line becomes one item. Empty lines are skipped.</p>
      <Textarea
        value={script}
        onChange={(event) => setScript(event.target.value)}
        rows={12}
        className="mt-3"
        placeholder="မြန်မာစာကို ဒီနေရာမှာ ကူးထည့်ပါ…"
        disabled={loading}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-3">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={dismiss} disabled={loading}>Cancel</Button>
          <LoadingButton variant="primary" loading={loading} disabled={loading || lineCount === 0} onClick={handleImport}>
            Import
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, index, voiceId }: { item: VoiceLabItem; index: number; voiceId: string }) {
  const [draft, setDraft] = useState(item.text);
  const { trigger: save } = useWrite((api) => api("labs/voice/items/:id").PATCH());
  const { trigger: remove } = useWrite((api) => api("labs/voice/items/:id").DELETE());
  const { trigger: generate, loading: regenerating } = useWrite((api) => api("labs/voice/generate").POST());
  const busy = item.status === "processing" || regenerating;

  async function commit() {
    const text = draft.trim();
    if (!text || text === item.text) {
      setDraft(item.text);
      return;
    }
    const result = await save({ params: { id: item.id }, body: { text } });
    if (result.error) {
      toast.error(result.error.error);
      setDraft(item.text);
    }
  }

  async function regenerate() {
    const result = await generate({ body: { voiceId, itemIds: [item.id] } });
    if (result.error) toast.error(result.error.error);
  }

  return (
    <li className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-2 w-6 shrink-0 text-right font-mono text-xs text-fg-3">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            autoResize
            rows={2}
            maxLength={VOICE_LAB_MAX_TEXT_LENGTH}
            disabled={busy}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {item.status === "done" && item.audioUrl && (
              <>
                <audio className="h-9 min-w-0 flex-1" controls src={item.audioUrl} />
                <span className="text-xs text-fg-3">{item.durationSeconds?.toFixed(1)} s</span>
              </>
            )}
            {busy && <span className="flex items-center gap-1.5 text-xs text-fg-3"><Loader2 size={13} className="animate-spin" /> Generating…</span>}
            {item.status === "failed" && !busy && <span className="text-xs text-danger">{item.error ?? "Failed"}</span>}
            {item.status === "pending" && !busy && <span className="text-xs text-fg-3">Not generated</span>}
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Regenerate" disabled={busy} onClick={regenerate}>
                <RotateCw size={14} />
              </Button>
              <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Delete" disabled={busy} onClick={() => remove({ params: { id: item.id } })}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function VoiceLabPage() {
  const [voiceId, setVoiceId] = useState<string>(VOICE_LAB_PROFILES[0].id);
  const { data: items, loading, trigger: refresh } = useRead((api) => api("labs/voice/items").GET());
  const { trigger: generate, loading: generating } = useWrite((api) => api("labs/voice/generate").POST());
  const { trigger: clearAll } = useWrite((api) => api("labs/voice/items").DELETE());

  const anyProcessing = items?.some((item) => item.status === "processing") ?? false;
  const pendingCount = items?.filter((item) => item.status !== "done" && item.status !== "processing").length ?? 0;
  const profile = VOICE_LAB_PROFILES.find((item) => item.id === voiceId)!;

  useEffect(() => {
    if (!anyProcessing) return;
    const timer = setInterval(() => void refresh({ force: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [anyProcessing, refresh]);

  async function handleGenerate() {
    const result = await generate({ body: { voiceId } });
    if (result.error) toast.error(result.error.error);
    else void refresh({ force: true });
  }

  function handleClear() {
    ConfirmDialog.show({
      title: "Clear all lines?",
      content: "Every line and its generated audio will be deleted.",
      confirmButtonLabel: "Clear all",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await clearAll({});
        dismiss();
      },
    });
  }

  function openImport() {
    Dialog.show({ content: ({ dismiss }) => <ImportDialogBody dismiss={dismiss} />, className: "w-[90vw] !max-w-xl", dismissOnOutsideClick: false });
  }

  return (
    <>
      <TopBar>
        <Crumb><Link href="/labs/voice">Labs</Link> / <span className="text-fg">Voice</span></Crumb>
        <span className="ml-auto rounded-full border border-isnew-border bg-isnew-bg px-2.5 py-1 text-[10px] font-medium tracking-wide text-isnew uppercase">
          Experimental
        </span>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mx-auto max-w-4xl">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-accent">
                <WandSparkles size={18} />
                <span className="text-xs font-medium tracking-wider uppercase">Self-hosted TTS test bench</span>
              </div>
              <h1 className="text-2xl font-semibold">Burmese Voice Lab</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
                Import a script, one line per item, and generate narration for every line. Lines and audio are saved to your account.
              </p>
            </div>

            <section className="mb-5 rounded-xl border border-line bg-panel-2 p-4">
              <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <span className="text-xs text-fg-3">Voice</span>
                <Select value={voiceId} onChange={(value) => setVoiceId(value as string)} wrapperClassName="mt-1.5">
                  {VOICE_LAB_PROFILES.map((item) => <SelectOption key={item.id} value={item.id} label={item.name} />)}
                </Select>
              </div>
              <Button onClick={openImport} disabled={generating}><FileText size={15} /> Import</Button>
              <LoadingButton
                variant="primary"
                loading={generating}
                loadingText="Generating…"
                disabled={generating || anyProcessing || pendingCount === 0}
                onClick={handleGenerate}
              >
                <Sparkles size={15} /> Generate{pendingCount ? ` (${pendingCount})` : ""}
              </LoadingButton>
              <Button variant="danger" onClick={handleClear} disabled={!items?.length || anyProcessing}><Trash2 size={15} /> Clear all</Button>
              </div>
              <p className="mt-2 text-xs text-fg-3">{profile.description}</p>
            </section>

            {loading && !items ? (
              <p className="text-sm text-fg-3">Loading…</p>
            ) : items?.length ? (
              <ul className="space-y-3">
                {items.map((item, index) => <ItemRow key={`${item.id}:${item.text}`} item={item} index={index} voiceId={voiceId} />)}
              </ul>
            ) : (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line-2 bg-sunken px-5 text-center">
                <div>
                  <Volume2 className="mx-auto mb-2 text-fg-3" size={24} />
                  <p className="text-xs leading-relaxed text-fg-3">No lines yet. Use Import to paste a script.</p>
                </div>
              </div>
            )}
          </div>
        </Wrap>
      </Body>
    </>
  );
}
