"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Input, Menu, MenuItem, MenuTrigger, Select, SelectOption } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapEpisode } from "@/lib/api/types";

const BEAT_SELECT_BUTTON_CLASS = "[&>div:first-child]:min-w-0 [&>div:first-child]:flex-nowrap [&>div:first-child>span]:block [&>div:first-child>span]:min-w-0 [&>div:first-child>span]:truncate";

export function episodeLabel(episode: MovieRecapEpisode) {
  return `${episode.name} · Beats ${episode.startBeat}–${episode.endBeat}`;
}

export type EpisodeDialogValues = { name: string; startBeat: number; endBeat: number };

// `beats` absent: rename only, the range is fixed once the episode exists.
export function EpisodeDialogContent({
  title,
  beats,
  initial,
  submitLabel,
  dismiss,
  onSubmit,
}: {
  title: string;
  beats?: string[];
  initial: EpisodeDialogValues;
  submitLabel: string;
  dismiss: () => void;
  onSubmit: (values: EpisodeDialogValues) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial.name);
  const [startBeat, setStartBeat] = useState(String(initial.startBeat));
  const [endBeat, setEndBeat] = useState(String(initial.endBeat));
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      if (await onSubmit({ name, startBeat: Number(startBeat), endBeat: Number(endBeat) })) dismiss();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <div>
        <div className="mb-2 text-xs font-medium text-fg-2">Name</div>
        <Input autoFocus value={name} placeholder="Episode name" onChange={(event) => setName(event.target.value)} />
      </div>
      {beats && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium text-fg-2">From beat</div>
            <Select
              className={BEAT_SELECT_BUTTON_CLASS}
              menuClassName="!w-80 !max-w-[calc(100vw-2rem)]"
              filterable="dropdown"
              value={startBeat}
              onChange={(value) => { setStartBeat(value); if (Number(value) > Number(endBeat)) setEndBeat(value); }}
            >
              {beats.map((text, index) => <SelectOption key={index} value={String(index + 1)} label={`Beat ${index + 1} · ${text}`} />)}
            </Select>
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-xs font-medium text-fg-2">To beat</div>
            <Select
              className={BEAT_SELECT_BUTTON_CLASS}
              menuClassName="!w-80 !max-w-[calc(100vw-2rem)]"
              filterable="dropdown"
              value={endBeat}
              onChange={setEndBeat}
            >
              {beats.map((text, index) => <SelectOption key={index} value={String(index + 1)} disabled={index + 1 < Number(startBeat)} label={`Beat ${index + 1} · ${text}`} />)}
            </Select>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={submitting} variant="secondary" onClick={dismiss}>Cancel</Button>
        <LoadingButton variant="primary" loading={submitting} onClick={() => void submit()}>{submitLabel}</LoadingButton>
      </div>
    </div>
  );
}

export function EpisodeToolbar({
  episodes,
  selectedId,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  episodes: MovieRecapEpisode[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (episode: MovieRecapEpisode) => void;
  onDelete: (episode: MovieRecapEpisode) => void;
}) {
  const selected = episodes.find((episode) => episode.id === selectedId) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {episodes.length > 0 && (
        <div title="Episode" className="w-72 min-w-0 max-w-full">
          <Select className={BEAT_SELECT_BUTTON_CLASS} value={selectedId ?? ""} onChange={onSelect}>
            {episodes.map((episode) => <SelectOption key={episode.id} value={episode.id} label={episodeLabel(episode)} />)}
          </Select>
        </div>
      )}
      <Button disabled={disabled} onClick={onCreate}><Plus size={14} /> New episode</Button>
      {selected && (
        <Menu menuClassName="min-w-[160px] p-0" placement="bottom-end">
          <MenuTrigger>
            {({ toggleMenu }) => <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Episode actions" disabled={disabled} onClick={toggleMenu}><MoreHorizontal size={16} /></Button>}
          </MenuTrigger>
          <MenuItem onClick={() => onRename(selected)}><span className="flex items-center gap-2"><Pencil size={14} /> Rename</span></MenuItem>
          <MenuItem onClick={() => onDelete(selected)}><span className="flex items-center gap-2 text-danger"><Trash2 size={14} /> Delete</span></MenuItem>
        </Menu>
      )}
    </div>
  );
}
