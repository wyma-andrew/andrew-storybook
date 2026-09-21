"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Languages } from "lucide-react";
import { Textarea } from "@geckoui/geckoui";
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
          </div>
        </div>
      </div>
    </div>
  );
}
