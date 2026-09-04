import { AlertTriangle, Lock, Sparkle, Sparkles } from "lucide-react";

export function MatchBadge({ status }: { status: "matched" | "new" | "stale" }) {
  if (status === "matched") {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-matched-border bg-matched-bg px-2.5 py-1 text-[10.5px] tracking-wide text-matched">
        <Lock size={11} /> Matched · Bible
      </span>
    );
  }
  if (status === "stale") {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-danger-border bg-danger-bg px-2.5 py-1 text-[10.5px] tracking-wide text-danger">
        <AlertTriangle size={11} /> Not in script anymore
      </span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-isnew-border bg-isnew-bg px-2.5 py-1 text-[10.5px] tracking-wide text-isnew">
      <Sparkle size={11} /> New · not in bible
    </span>
  );
}

export function InjectRow({ kind }: { kind: "character" | "location" }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
      <span className="flex items-center gap-1.5 rounded-md border border-style-badge-border bg-style-badge-bg px-2.5 py-1 text-[10.5px] tracking-wide text-style-badge">
        <Sparkles size={11} /> Style
      </span>
      <span className="flex items-center gap-1.5 rounded-md border border-sys-badge-border bg-sys-badge-bg px-2.5 py-1 text-[10.5px] tracking-wide text-sys-badge">
        <Lock size={9} /> System · {kind === "character" ? "Character" : "Location"} preset
      </span>
    </div>
  );
}
