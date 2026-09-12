"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// The class on <html> is the single source of truth — the inline script in
// app/layout.tsx has already set it before React runs, so a React state copy
// would only be a second, later answer to a question already settled.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore (private browsing / storage disabled) — the choice just won't persist
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  // Server and hydration both report the default; if the script picked light,
  // useSyncExternalStore re-renders with it right after hydration.
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_THEME);
  return {
    theme,
    setTheme: applyTheme,
    toggle: () => applyTheme(theme === "dark" ? "light" : "dark"),
  };
}
