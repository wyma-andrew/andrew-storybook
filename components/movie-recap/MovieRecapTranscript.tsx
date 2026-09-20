"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Languages } from "lucide-react";
import { Textarea } from "@geckoui/geckoui";
import { MOVIE_RECAP_RIBBON_GROUP_S } from "@/lib/constants/movie-recap";
import { manualScriptOverruns, parseTimestampedBlocks } from "@/lib/movie-recap-manual-script";
import type { MovieRecapProject } from "@/lib/api/types";

/**
 * The source's dialogue and its Burmese retelling, both typed in by hand.
 *
 * The automatic read (subtitle track / Whisper) and the AI retelling are
 * disconnected for now — the pipeline and its route are still there, and
 * nothing calls them. See history/movie-recap.md.
 */
export function MovieRecapTranscript({
  project,
  onChange,
}: {
  project: MovieRecapProject;
  /** Edits land in the wizard's project draft; Continue is what writes them. */
  onChange: (patch: { transcriptText?: string; transcriptStory?: string }) => void;
}) {
  const text = project.transcriptText ?? "";
  const story = project.transcriptStory ?? "";
  const [sourceOpen, setSourceOpen] = useState(false);

  // Checked against the draft, not the saved story: the point is to catch the
  // block while it is still being typed.
  const blocks = useMemo(
    () => parseTimestampedBlocks(story, project.sourceDurationSeconds ?? 0),
    [story, project.sourceDurationSeconds]
  );
  const overruns = useMemo(() => manualScriptOverruns(blocks), [blocks]);

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Transcript</h2>
      <p className="mb-6 text-sm text-fg-2">
        Paste the Burmese story, with a timestamp on each line. The source transcript is optional — it is kept for
        reference and nothing downstream reads it.
      </p>

      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
          {/* Collapsed by default: it is reference material nothing downstream
              reads, and open it pushed the story — the box that matters — off
              the screen. The state is per-visit on purpose; there is nothing
              here worth a column. */}
          <button
            type="button"
            onClick={() => setSourceOpen((open) => !open)}
            className="flex w-full items-center gap-2 border-b border-line px-4 py-3 text-left"
          >
            <FileText size={14} className="text-fg-3" />
            <span className="text-sm font-medium">Source transcript</span>
            <span className="text-xs text-fg-3">optional{text.trim() ? "" : " · empty"}</span>
            {sourceOpen ? (
              <ChevronUp size={14} className="ml-auto text-fg-3" />
            ) : (
              <ChevronDown size={14} className="ml-auto text-fg-3" />
            )}
          </button>
          {sourceOpen && (
            <div className="p-4">
              <Textarea
                value={text}
                onChange={(event) => onChange({ transcriptText: event.target.value })}
                rows={14}
                placeholder="Paste the source transcript here."
              />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Languages size={14} className="text-fg-3" />
            <span className="text-sm font-medium">Burmese story</span>
            <span className="text-xs text-fg-3">required</span>
          </div>
          <div className="p-4">
            <Textarea
              value={story}
              onChange={(event) => onChange({ transcriptStory: event.target.value })}
              rows={14}
              placeholder="Paste the Burmese story here."
            />
            {overruns.length > 0 && (
              // Past what a group's own two timestamps cover, the leftover
              // becomes a held frame. The fix is fewer words or a later
              // timestamp, and both are the user's — so this says exactly how
              // many characters the edit is, rather than only that it is needed.
              // An hour into a render is too late to hear it.
              <div className="mt-3 rounded-lg border border-line-2 bg-panel px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2 text-danger">
                  <AlertTriangle size={14} />
                  <span className="text-xs font-medium">
                    {overruns.length === 1 ? "One section runs" : `${overruns.length} sections run`} past their
                    timestamps by {Math.round(overruns.reduce((total, overrun) => total + overrun.overS, 0))}s
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-fg-3">
                      <tr className="text-left">
                        <th className="pb-1 pr-4 font-normal">Section</th>
                        <th className="pb-1 pr-4 text-right font-normal">Video</th>
                        <th className="pb-1 pr-4 text-right font-normal">To read</th>
                        <th className="pb-1 pr-4 text-right font-normal">Over</th>
                        <th className="pb-1 text-right font-normal">Cut</th>
                      </tr>
                    </thead>
                    <tbody className="text-fg-2">
                      {overruns.map((overrun) => (
                        <tr key={overrun.block}>
                          <td className="py-0.5 pr-4 tabular-nums">
                            {stamp(overrun.startS)}–{stamp(overrun.endS)}
                          </td>
                          <td className="py-0.5 pr-4 text-right tabular-nums">{Math.round(overrun.footageS)}s</td>
                          <td className="py-0.5 pr-4 text-right tabular-nums">{Math.round(overrun.spokenS)}s</td>
                          <td className="py-0.5 pr-4 text-right tabular-nums text-danger">+{overrun.overS}s</td>
                          <td className="py-0.5 text-right tabular-nums text-danger">
                            {overrun.chars - overrun.budgetChars} ch
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-fg-3">
                  A section is a run of timestamps about {MOVIE_RECAP_RIBBON_GROUP_S}s long — lines inside one share
                  their footage, so only the total has to fit. Cut that many characters anywhere in the section, or move
                  the timestamp after it later.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function stamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
