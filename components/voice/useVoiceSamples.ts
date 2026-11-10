"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "@geckoui/geckoui";
import { apiClient, useRead } from "@/lib/spoosh";
import type { Voice } from "@/lib/tts/types";

type VoiceProfile = Voice;

// The worker reports no progress, so the percentage is an estimate from typical
// durations (a cold Modal start dominates VoxCPM). It stops at 95% until the
// sample actually lands.
const EXPECTED_MS = { voxcpm: 60_000, azure: 5_000 } as const;

// Module-level so downloads keep running, and stay visible, when the dialog
// (rendered by Dialog.show in its own tree) is closed and reopened.
const downloads = new Map<string, number>();
const downloaded = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot = 0;

function emit() {
  snapshot += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function startDownload(voice: VoiceProfile) {
  if (downloads.has(voice.id)) return;
  downloads.set(voice.id, Date.now());
  emit();
  try {
    const result = await apiClient("voices/preview").POST({ body: { voiceId: voice.id } });
    if (result.data) downloaded.set(voice.id, result.data.url);
    else toast.error(result.error?.error ?? `Could not download ${voice.name}.`);
  } catch {
    toast.error(`Could not download ${voice.name}.`);
  } finally {
    downloads.delete(voice.id);
    emit();
  }
}

export function useVoiceSamples() {
  useSyncExternalStore(subscribe, () => snapshot, () => 0);
  const { data: stored } = useRead((api) => api("voices/preview").GET(), { staleTime: 5 * 60 * 1000 });
  const [now, setNow] = useState(() => Date.now());
  const active = downloads.size > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);

  return {
    urlOf: (voice: VoiceProfile) => downloaded.get(voice.id) ?? stored?.[voice.id] ?? null,
    progressOf: (voice: VoiceProfile) => {
      const started = downloads.get(voice.id);
      if (started === undefined) return null;
      const ratio = Math.max(0, now - started) / EXPECTED_MS[voice.providerId];
      return Math.round(95 * (1 - Math.exp(-2 * ratio)));
    },
  };
}

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  function toggle(id: string, url: string) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    audio.src = url;
    setPlaying(id);
    void audio.play().catch(() => {
      setPlaying(null);
      toast.error("Voice preview audio could not be played.");
    });
  }

  return { playing, toggle };
}

export type VoiceSamples = ReturnType<typeof useVoiceSamples>;
export type VoicePlayer = ReturnType<typeof usePlayer>;
