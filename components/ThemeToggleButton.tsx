"use client";

import { Moon, Sun } from "lucide-react";
import { MiniButton } from "@/components/ui/Button";
import { useTheme } from "@/components/ThemeProvider";

// Icon-only, and it shows the theme you would GET, not the one you are in —
// a button labelled with the current state reads as a status, not an action.
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <MiniButton
      ghost
      onClick={toggle}
      className={`!h-9 !w-9 !min-w-0 justify-center !p-0 ${className}`}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </MiniButton>
  );
}
