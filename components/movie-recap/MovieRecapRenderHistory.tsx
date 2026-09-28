"use client";

import { useState } from "react";
import { ConfirmDialog } from "@geckoui/geckoui";
import { ChevronDown, ChevronRight, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  clearRenderHistory,
  removeRenderHistoryEntry,
  useRenderHistory,
  type MovieRecapRenderHistoryEntry,
} from "@/lib/movie-recap-render-history";

function fixed(value: unknown, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "—";
}

/**
 * What recent generations actually cut, newest first, kept in this browser only.
 *
 * The point of it is comparison: shot lengths against the last run, how much of
 * the source each cut skipped, and above all `held` — seconds with no footage
 * behind them, which the render fills by repeating a frame. A version of this
 * pipeline shipped holding a frame for 1.3s at the end of most shots and nothing
 * said so; this is what would have said so.
 */
export default function MovieRecapRenderHistory({ projectId }: { projectId: string }) {
  const entries = useRenderHistory(projectId);
  const [openId, setOpenId] = useState<string | null>(null);

  function handleDelete(entry: MovieRecapRenderHistoryEntry) {
    ConfirmDialog.show({
      title: "Delete this render record?",
      content: "Removes it from this browser. The exported video itself is not affected.",
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        removeRenderHistoryEntry(projectId, entry.id);
        dismiss();
      },
    });
  }

  function handleClear() {
    ConfirmDialog.show({
      title: `Delete all ${entries.length} records?`,
      content: "Clears this project's render history from this browser. Exported videos are not affected.",
      confirmButtonLabel: "Delete all",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        clearRenderHistory(projectId);
        dismiss();
      },
    });
  }

  return (
    <div className="mt-8 rounded-xl border border-line bg-panel-2 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History size={16} className="text-fg-3" />
          <span className="text-sm font-medium">Render history</span>
        </div>
        {entries.length > 0 && (
          <Button onClick={handleClear}>
            <Trash2 size={16} /> Clear
          </Button>
        )}
      </div>
      {/* Shown empty rather than hidden: a panel that only exists once a render
          has happened is one nobody can find when they go looking for it. */}
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-panel px-3 py-6 text-center text-sm text-fg-3">
          Nothing recorded yet. The next render you run adds a row here.
        </p>
      ) : (
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-fg-3">
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-right font-medium">Length</th>
              <th className="px-3 py-2 text-right font-medium">Shots</th>
              <th className="px-3 py-2 text-right font-medium">Avg shot</th>
              <th className="px-3 py-2 text-right font-medium">Video / audio</th>
              <th className="px-3 py-2 text-right font-medium">Held</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 3).map((entry) => {
              const open = openId === entry.id;
              const shotCount = Array.isArray(entry.shots) ? entry.shots.length : 0;
              const avgS = shotCount && Number.isFinite(entry.durationS) ? entry.durationS / shotCount : null;
              return (
                <ExpandableRow
                  key={entry.id}
                  entry={entry}
                  open={open}
                  avgS={avgS}
                  onToggle={() => setOpenId(open ? null : entry.id)}
                  onDelete={() => handleDelete(entry)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function ExpandableRow({
  entry,
  open,
  avgS,
  onToggle,
  onDelete,
}: {
  entry: MovieRecapRenderHistoryEntry;
  open: boolean;
  avgS: number | null;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const shots = Array.isArray(entry.shots) ? entry.shots : [];
  const padS = typeof entry.padS === "number" && Number.isFinite(entry.padS) ? entry.padS : null;
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-2 py-2">
          <Button aria-label={open ? "Hide shots" : "Show shots"} onClick={onToggle}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </Button>
        </td>
        <td className="px-3 py-2 text-fg">
          {new Date(entry.createdAt).toLocaleString()}
          {entry.mock && <span className="ml-2 rounded bg-chip px-1.5 py-0.5 text-xs text-fg-3">mock</span>}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-fg">{fixed(entry.durationS, "s")}</td>
        <td className="px-3 py-2 text-right tabular-nums text-fg">
          {shots.length}
          <span className="text-fg-3"> / {typeof entry.beats === "number" && Number.isFinite(entry.beats) ? entry.beats : "—"} beats</span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-fg">{fixed(avgS, "s")}</td>
        <td className="px-3 py-2 text-right tabular-nums text-fg-3">
          {fixed(shots[0]?.speed, "x")} / {fixed(entry.narrationRate, "x")}
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${padS === null ? "text-fg-3" : padS > 0.1 ? "text-danger" : "text-ok"}`}>
          {fixed(padS, "s")}
        </td>
        <td className="px-2 py-2">
          <Button aria-label="Delete record" onClick={onDelete}>
            <Trash2 size={16} />
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line last:border-0">
          <td colSpan={8} className="bg-sunken px-3 py-3">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-fg-3">
                  <th className="px-2 py-1 text-left font-medium">Shot</th>
                  <th className="px-2 py-1 text-right font-medium">On screen</th>
                  <th className="px-2 py-1 text-right font-medium">From source</th>
                  <th className="px-2 py-1 text-right font-medium">Footage</th>
                  <th className="px-2 py-1 text-right font-medium">Held</th>
                  <th className="px-2 py-1 text-right font-medium">Speed</th>
                  <th className="px-2 py-1 text-right font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {shots.map((shot) => (
                  <tr key={`${shot.beat}-${shot.shot}`} className="border-t border-line-2">
                    <td className="px-2 py-1 text-fg-2">
                      {shot.beat}.{shot.shot}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg">{fixed(shot.slotS, "s")}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg-2">
                      {fixed(shot.sourceStartS)}–{fixed(shot.sourceEndS, "s")}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg-2">{fixed(shot.sourceS, "s")}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${shot.padS > 0.05 ? "text-danger" : "text-fg-3"}`}>
                      {fixed(shot.padS, "s")}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg-3">
                      {fixed(shot.speed, "x")}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-fg-3">
                      {fixed(shot.skipS, "s")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
