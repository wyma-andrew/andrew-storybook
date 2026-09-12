import { AlertTriangle, Lock } from "lucide-react";

// "new" is deliberately unbadged — see the call site.
export function MatchBadge({ status }: { status: "matched" | "new" | "stale" }) {
  if (status === "matched") {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-matched-border bg-matched-bg px-2.5 py-1 text-[10.5px] tracking-wide text-matched">
        <Lock size={11} /> Bible
      </span>
    );
  }
  if (status === "stale") {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-danger-border bg-danger-bg px-2.5 py-1 text-[10.5px] tracking-wide text-danger">
        <AlertTriangle size={11} /> Not in script
      </span>
    );
  }
  return null;
}
