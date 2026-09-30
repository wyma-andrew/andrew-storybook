"use client";

import { useEffect, useState, useSyncExternalStore, type DragEvent } from "react";
import Link from "next/link";
import { ConfirmDialog, Dialog, Menu, MenuItem, MenuTrigger, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { AudioLines, ChevronDown, FileText, GripVertical, Loader2, RotateCw, Sparkles, Trash2, Volume2, WandSparkles } from "lucide-react";
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
const VOICE_STORAGE_KEY = "voice-lab:voice-id";
const VOICE_CHANGE_EVENT = "voice-lab:voice-change";

function readStoredVoice() {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeStoredVoice(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(VOICE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(VOICE_CHANGE_EVENT, callback);
  };
}

function useStoredVoice() {
  const stored = useSyncExternalStore(subscribeStoredVoice, readStoredVoice, () => null);
  const voiceId = VOICE_LAB_PROFILES.some((profile) => profile.id === stored) ? (stored as string) : VOICE_LAB_PROFILES[0].id;
  function setVoiceId(id: string) {
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, id);
    } catch {}
    window.dispatchEvent(new Event(VOICE_CHANGE_EVENT));
  }
  return [voiceId, setVoiceId] as const;
}

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

type DragProps = {
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

function ItemRow({ item, index, voiceId, drag }: { item: VoiceLabItem; index: number; voiceId: string; drag: DragProps }) {
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

  function confirmRemoveAudio() {
    ConfirmDialog.show({
      title: `Delete audio of line ${index + 1}?`,
      content: "The generated audio will be deleted. The line stays and can be generated again.",
      confirmButtonLabel: "Delete audio",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const result = await save({ params: { id: item.id }, body: { resetAudio: true } });
        if (result.error) toast.error(result.error.error);
        dismiss();
      },
    });
  }

  function confirmDelete() {
    ConfirmDialog.show({
      title: `Delete line ${index + 1}?`,
      content: "The line and its generated audio will be deleted.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await remove({ params: { id: item.id } });
        dismiss();
      },
    });
  }

  async function regenerate() {
    const result = await generate({ body: { voiceId, itemIds: [item.id] } });
    if (result.error) toast.error(result.error.error);
  }

  return (
    <li
      className={`rounded-xl border bg-panel-2 p-3 ${drag.dropTarget ? "border-accent" : "border-line"} ${drag.dragging ? "opacity-40" : ""}`}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
    >
      <div className="flex items-start gap-2">
        <span
          draggable
          aria-label="Drag to reorder"
          className="mt-1.5 shrink-0 cursor-grab text-fg-3 active:cursor-grabbing"
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
        >
          <GripVertical size={16} />
        </span>
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
<Menu placement="bottom-end">
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <Button variant="ghost" className="!h-8 !gap-0.5 !px-2" aria-label="Delete options" disabled={busy} onClick={toggleMenu}>
                      <Trash2 size={14} /><ChevronDown size={12} />
                    </Button>
                  )}
                </MenuTrigger>
                <MenuItem disabled={item.status !== "done"} onClick={confirmRemoveAudio}>
                  <span className="flex items-center gap-2"><AudioLines size={14} /> Delete audio only</span>
                </MenuItem>
                <MenuItem onClick={confirmDelete}>
                  <span className="flex items-center gap-2 text-danger"><Trash2 size={14} /> Delete line</span>
                </MenuItem>
              </Menu>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function VoiceLabPage() {
  const [voiceId, setVoiceId] = useStoredVoice();
  const { data: items, loading, trigger: refresh } = useRead((api) => api("labs/voice/items").GET());
  const { trigger: generate, loading: generating } = useWrite((api) => api("labs/voice/generate").POST());
  const { trigger: clearAll } = useWrite((api) => api("labs/voice/items").DELETE());
  const { trigger: saveOrder } = useWrite((api) => api("labs/voice/items").PATCH());
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = localOrder && items
    ? localOrder.map((id) => items.find((item) => item.id === id)).filter((item): item is VoiceLabItem => !!item)
    : items;
  const anyProcessing = items?.some((item) => item.status === "processing") ?? false;
  const doneCount = items?.filter((item) => item.status === "done").length ?? 0;
  const failedCount = items?.filter((item) => item.status === "failed").length ?? 0;
  const pendingCount = items?.filter((item) => item.status !== "done" && item.status !== "processing").length ?? 0;
  const profile = VOICE_LAB_PROFILES.find((item) => item.id === voiceId)!;

  useEffect(() => {
    if (!anyProcessing) return;
    const timer = setInterval(() => void refresh({ force: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [anyProcessing, refresh]);

  async function handleDrop(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (!ordered || !sourceId || sourceId === targetId) return;
    const ids = ordered.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    ids.splice(from, 1);
    ids.splice(ids.indexOf(targetId) + (from < ordered.findIndex((item) => item.id === targetId) ? 1 : 0), 0, sourceId);
    setLocalOrder(ids);
    const result = await saveOrder({ body: { order: ids } });
    if (result.error) toast.error(result.error.error);
    await refresh({ force: true });
    setLocalOrder(null);
  }

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
              {items?.length && (anyProcessing || generating) ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-fg-3">
                    <span>Generating audio…</span>
                    <span>{doneCount} / {items.length}{failedCount ? ` · ${failedCount} failed` : ""}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={doneCount}>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(doneCount / items.length) * 100}%` }} />
                  </div>
                </div>
              ) : null}
            </section>

            {loading && !ordered ? (
              <p className="text-sm text-fg-3">Loading…</p>
            ) : ordered?.length ? (
              <ul className="space-y-3">
                {ordered.map((item, index) => (
                  <ItemRow
                    key={`${item.id}:${item.text}`}
                    item={item}
                    index={index}
                    voiceId={voiceId}
                    drag={{
                      dragging: dragId === item.id,
                      dropTarget: !!dragId && dragId !== item.id && overId === item.id,
                      onDragStart: (event) => {
                        setDragId(item.id);
                        const row = event.currentTarget.closest("li");
                        if (row) event.dataTransfer.setDragImage(row, 16, 16);
                        event.dataTransfer.effectAllowed = "move";
                      },
                      onDragEnd: () => { setDragId(null); setOverId(null); },
                      onDragOver: (event) => {
                        if (!dragId) return;
                        event.preventDefault();
                        setOverId(item.id);
                      },
                      onDrop: (event) => {
                        event.preventDefault();
                        void handleDrop(item.id);
                      },
                    }}
                  />
                ))}
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
