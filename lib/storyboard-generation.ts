"use client";

import { useSyncExternalStore } from "react";
import { apiClient } from "@/lib/spoosh";

// Module scope, not component state: the storyboard page unmounts when the user
// switches to Script or Assets, and a useWrite `loading` flag dies with it while
// the request keeps running. See history/storyboard-generation.md.
const running = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function startStoryboardGeneration(chapterId: string) {
  if (running.has(chapterId)) return { error: null, aborted: false };
  const controller = new AbortController();
  running.set(chapterId, controller);
  emit();
  try {
    const res = await apiClient("chapters/:id/storyboard/generate").POST({
      params: { id: chapterId },
      signal: controller.signal,
    });
    return { error: res.error?.error ?? null, aborted: controller.signal.aborted };
  } catch (error) {
    return {
      error: controller.signal.aborted ? null : error instanceof Error ? error.message : "Generation failed.",
      aborted: controller.signal.aborted,
    };
  } finally {
    running.delete(chapterId);
    emit();
  }
}

export function stopStoryboardGeneration(chapterId: string) {
  running.get(chapterId)?.abort();
}

export function useStoryboardGenerating(chapterId: string) {
  return useSyncExternalStore(
    subscribe,
    () => running.has(chapterId),
    () => false
  );
}
