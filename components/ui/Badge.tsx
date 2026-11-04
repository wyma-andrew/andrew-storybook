import { AlertTriangle } from "lucide-react";

export function StaleBadge() {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-danger-border bg-danger-bg px-2.5 py-1 text-[10.5px] tracking-wide text-danger">
      <AlertTriangle size={11} /> Not in script
    </span>
  );
}
