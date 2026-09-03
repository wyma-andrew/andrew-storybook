"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@geckoui/geckoui";

export function EditableLabel({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) await onSave(trimmed);
    else setDraft(value);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="min-h-0 gap-0 border-0 bg-transparent p-0"
        inputClassName={`bg-transparent p-0 outline-none ${className}`}
      />
    );
  }

  return (
    <span
      className={`group inline-flex cursor-text items-center gap-1.5 ${className}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to rename"
    >
      {value}
      <Pencil size={12} className="shrink-0 text-fg-3 opacity-0 group-hover:opacity-100" />
    </span>
  );
}
