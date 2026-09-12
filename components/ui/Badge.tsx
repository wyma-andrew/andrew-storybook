import { AlertTriangle, Lock, Sparkle } from "lucide-react";

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
