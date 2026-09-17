"use client";

import { useSyncExternalStore } from "react";
import type { MovieRecapRenderLog } from "@/lib/api/types";

/**
 * Per-project history of how each render turned out, kept in the BROWSER.
 *
 * It is deliberately not in the database. This is a record for comparing one
 * generation against the last — shot lengths, which part of the source each cut
 * came from, how much of a beat had no footage behind it — and it belongs to
 * whoever is iterating on the settings, not to the project. Keeping it local
 * also means no migration and no rows to clean up when a project is deleted.
 *
 * The cost, which is the thing to remember before relying on it: it is per
 * browser. It does not follow the user to another machine, and clearing site
 * data clears it. Every access is wrapped because `localStorage` throws in a
 * private window and returns nothing with site data blocked.
 */

const KEY_PREFIX = "movie-recap:render-history:";
// Enough to compare a run against the several before it. Older entries are
// dropped rather than growing a key without limit — a 30-shot render is a few KB
// and localStorage is a handful of MB per origin.
const MAX_ENTRIES = 20;

export type MovieRecapRenderHistoryEntry = MovieRecapRenderLog & {
  /** Stable key for React lists and deletion; `createdAt` alone can collide. */
  id: string;
};

const keyFor = (projectId: string) => `${KEY_PREFIX}${projectId}`;

// localStorage is an external store, so it is read through
// `useSyncExternalStore` rather than copied into state by an effect. The cache
// is what makes that work: `getSnapshot` has to return a STABLE reference for
// unchanged data or React re-renders forever.
const cache = new Map<string, MovieRecapRenderHistoryEntry[]>();
const listeners = new Set<() => void>();
const EMPTY: MovieRecapRenderHistoryEntry[] = [];

function snapshot(projectId: string) {
  const cached = cache.get(projectId);
  if (cached) return cached;
  const entries = readRenderHistory(projectId);
  cache.set(projectId, entries);
  return entries;
}

function publish(projectId: string, entries: MovieRecapRenderHistoryEntry[]) {
  cache.set(projectId, entries);
  listeners.forEach((listener) => listener());
  return entries;
}

/** Subscribes to this project's history. Server-rendered as empty — the store lives in the browser. */
export function useRenderHistory(projectId: string) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot(projectId),
    () => EMPTY
  );
}

export function readRenderHistory(projectId: string): MovieRecapRenderHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything stored by an older version of this file is data, not a contract —
    // drop what does not look like an entry rather than rendering undefined.
    return parsed.filter(
      (entry): entry is MovieRecapRenderHistoryEntry =>
        !!entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
    );
  } catch {
    return [];
  }
}

function write(projectId: string, entries: MovieRecapRenderHistoryEntry[]) {
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Full, blocked, or private browsing. The history is a convenience; losing
    // it must never take the render down with it.
  }
}

/** Newest first, so the list is in the order it is displayed. */
export function appendRenderHistory(projectId: string, log: MovieRecapRenderLog) {
  const entry: MovieRecapRenderHistoryEntry = {
    ...log,
    id: `${log.createdAt}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const entries = [entry, ...readRenderHistory(projectId)].slice(0, MAX_ENTRIES);
  write(projectId, entries);
  return publish(projectId, entries);
}

export function removeRenderHistoryEntry(projectId: string, id: string) {
  const entries = readRenderHistory(projectId).filter((entry) => entry.id !== id);
  write(projectId, entries);
  return publish(projectId, entries);
}

export function clearRenderHistory(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId));
  } catch {
    // As above.
  }
  return publish(projectId, EMPTY);
}
