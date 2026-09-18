"use client";

import { useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { ConfirmDialog, Textarea } from "@geckoui/geckoui";
import { LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { formatDuration } from "@/lib/movie-recap";

/**
 * The script the last full render wrote, editable line by line.
 *
 * This is the only way back from a recap whose words are wrong that does not
 * mean paying for the whole read of the source again — see
 * history/movie-recap.md. Only the text is editable: the shots under each beat
 * are the planner's output, timed against the source, and a beat re-rendered
 * with different words still cuts the same footage.
 */
export function MovieRecapScript({
  project,
  onSave,
  onReRender,
  saving,
  rendering,
}: {
  project: MovieRecapProject;
  onSave: (texts: string[]) => void;
  onReRender: () => void;
  saving: boolean;
  rendering: boolean;
}) {
  const script = project.renderScript;
  const serverTexts = script?.map((beat) => beat.text) ?? [];
  const [texts, setTexts] = useState(serverTexts);
  // Server text is the source of truth: a finished render rewrites the script,
  // so a draft is dropped when a new one lands rather than shadowing it. Reset
  // during render, not in an effect — an effect would paint the stale draft
  // once before replacing it.
  const signature = JSON.stringify(serverTexts);
  const [rendered, setRendered] = useState(signature);
  if (rendered !== signature) {
    setRendered(signature);
    setTexts(JSON.parse(signature) as string[]);
  }

  if (!script?.length) return null;

  const dirty = texts.some((text, index) => text !== serverTexts[index]);
  const empty = texts.some((text) => !text.trim());
  const busy = rendering || project.renderStatus === "running";
  // A re-render reads the analysis the full render left in R2. Without it there
  // is nothing to plan against, so only a full render is possible.
  const canReRender = !!project.renderAnalysisKey;

  return (
    <div className="mt-8 rounded-xl border border-line bg-panel-2 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Pencil size={16} className="text-fg-3" />
        <span className="text-sm font-medium">Narration script</span>
        <span className="text-xs text-fg-3">{script.length} beats</span>
      </div>
      <p className="mb-4 text-xs text-fg-2">
        Fix a line here and re-render without re-reading the source. Scene detection, the vision pass and
        transcription are skipped, and the script model is not called again — the words below are used as they
        stand. Narration audio and the video are rebuilt, so the timing follows whatever you write.
      </p>

      <div className="space-y-3">
        {script.map((beat, index) => {
          const startS = beat.shots[0]?.sourceStartS ?? 0;
          const changed = texts[index] !== serverTexts[index];
          return (
            <div key={index} className="rounded-lg border border-line bg-panel p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-fg-3">
                <span className="font-medium text-fg-2">Beat {index + 1}</span>
                <span>{formatDuration(startS)}</span>
                <span>
                  · {beat.shots.length} shot{beat.shots.length === 1 ? "" : "s"}
                </span>
                {changed && <span className="text-fg-2">· edited</span>}
              </div>
              <Textarea
                rows={2}
                value={texts[index] ?? ""}
                disabled={busy}
                onChange={(event) => setTexts(texts.map((text, i) => (i === index ? event.target.value : text)))}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LoadingButton loading={saving} disabled={!dirty || empty || busy} onClick={() => onSave(texts)}>
          Save script
        </LoadingButton>
        <LoadingButton
          variant="primary"
          loading={rendering}
          disabled={busy || dirty || !canReRender}
          onClick={() =>
            ConfirmDialog.show({
              title: "Re-render this script",
              content:
                "The script above is used as written — no new script is generated. Narration audio is synthesized again for every beat, which costs TTS, and the current video is replaced. Timing follows your words, so the cuts will move.",
              confirmButtonLabel: "Re-render",
              cancelButtonLabel: "Cancel",
              onConfirm: () => { onReRender(); },
            })
          }
        >
          <RotateCcw size={16} /> Re-render this script
        </LoadingButton>
        {dirty && <span className="text-xs text-fg-3">Save before re-rendering.</span>}
        {!canReRender && <span className="text-xs text-fg-3">Run a full AI render first.</span>}
      </div>
    </div>
  );
}
