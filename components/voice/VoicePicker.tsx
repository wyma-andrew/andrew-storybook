"use client";

import { useState } from "react";
import { Check, ChevronDown, Download, Pause, Play, X } from "lucide-react";
import { Dialog } from "@geckoui/geckoui";
import { Button, MiniButton } from "@/components/ui/Button";
import type { Voice } from "@/lib/tts/types";
import { startDownload, usePlayer, useVoiceSamples, type VoicePlayer, type VoiceSamples } from "./useVoiceSamples";


function SampleButton({ voice, samples, player, size = "md" }: { voice: Voice; samples: VoiceSamples; player: VoicePlayer; size?: "md" | "sm" }) {
  const url = samples.urlOf(voice);
  const progress = samples.progressOf(voice);
  const icon = size === "sm" ? 14 : 16;

  if (progress !== null) {
    return (
      <div
        role="progressbar"
        aria-label={`Downloading ${voice.name}`}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`grid ${size === "sm" ? "size-8" : "size-10"} shrink-0 place-items-center rounded-full text-[10px] font-semibold text-accent`}
        style={{ background: `conic-gradient(var(--c-accent) ${progress * 3.6}deg, var(--c-sunken) 0deg)` }}
      >
        <span className="grid size-[calc(100%-6px)] place-items-center rounded-full bg-panel">{progress}%</span>
      </div>
    );
  }

  const box = size === "sm" ? "!size-8" : "!size-10";
  if (!url) {
    return (
      <Button
        aria-label={`Download ${voice.name}`}
        title="Download sample"
        onClick={(event) => {
          event.stopPropagation();
          void startDownload(voice);
        }}
        className={`${box} shrink-0 !rounded-full !p-0`}
      >
        <Download size={icon} />
      </Button>
    );
  }

  const isPlaying = player.playing === voice.id;
  return (
    <Button
      aria-label={isPlaying ? `Pause ${voice.name} preview` : `Play ${voice.name} preview`}
      onClick={(event) => {
        event.stopPropagation();
        player.toggle(voice.id, url);
      }}
      className={`${box} shrink-0 !rounded-full !border-0 !bg-accent !p-0 !text-on-accent`}
    >
      {isPlaying ? <Pause size={icon} /> : <Play size={icon} />}
    </Button>
  );
}

function VoiceDialog({ voices, value, onSelect, dismiss }: { voices: readonly Voice[]; value: string; onSelect: (id: string) => void; dismiss: () => void }) {
  const samples = useVoiceSamples();
  const player = usePlayer();
  const [picked, setPicked] = useState(value);
  const missing = voices.filter((voice) => !samples.urlOf(voice) && samples.progressOf(voice) === null);

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="-mx-6 -mt-6 flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-[16px] font-semibold">Choose a voice</h2>
        <MiniButton ghost aria-label="Close" onClick={dismiss}><X size={18} /></MiniButton>
      </div>
      <div className="-mx-6 grid min-h-0 flex-1 gap-2 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {voices.map((voice) => {
          const selected = picked === voice.id;
          return (
            <div
              key={voice.id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onClick={() => setPicked(voice.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(voice.id); }
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-accent bg-accent-dim" : "border-line bg-panel hover:border-line-2"}`}
            >
              <SampleButton voice={voice} samples={samples} player={player} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{voice.name}</div>
                <div className="line-clamp-2 text-xs text-fg-3">{voice.description}</div>
              </div>
              {selected && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <div className="-mx-6 -mb-6 flex items-center gap-2.5 border-t border-line px-5 py-3.5">
        {missing.length > 0 && (
          <Button onClick={() => missing.forEach((voice) => void startDownload(voice))}>
            <Download size={15} /> Download all ({missing.length})
          </Button>
        )}
        <div className="ml-auto flex gap-2.5">
          <Button variant="secondary" onClick={dismiss}>Cancel</Button>
          <Button variant="primary" onClick={() => { onSelect(picked); dismiss(); }}>Use voice</Button>
        </div>
      </div>
    </div>
  );
}

export function VoicePicker({ voices, value, onChange }: { voices: readonly Voice[]; value: string; onChange: (id: string) => void }) {
  const samples = useVoiceSamples();
  const player = usePlayer();
  const voice = voices.find((profile) => profile.id === value) ?? voices[0];

  function openDialog() {
    Dialog.show({
      className: "max-w-[720px] w-full",
      content: ({ dismiss }) => <VoiceDialog voices={voices} value={voice.id} onSelect={onChange} dismiss={dismiss} />,
    });
  }

  return (
    <div className="flex items-center gap-2">
      <SampleButton voice={voice} samples={samples} player={player} size="sm" />
      <Button onClick={openDialog} className="!h-9 min-w-0 flex-1 !justify-between !px-3">
        <span className="truncate font-medium">{voice.name}</span>
        <ChevronDown size={15} className="shrink-0 text-fg-3" />
      </Button>
    </div>
  );
}
