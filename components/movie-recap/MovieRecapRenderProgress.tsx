"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import { MOVIE_RECAP_RENDER_STEPS, MOVIE_RECAP_SCRIPT_STEPS } from "@/lib/constants/movie-recap";
import { movieRecapRenderStepStates, movieRecapScriptStepStates, type MovieRecapStepState } from "@/lib/movie-recap";

// The render's stages as a stepper, so a run that takes minutes shows how far
// through it is rather than one line of changing text.
//
// Every state is read from the project row the client already polls, so the bar
// cannot drift from the status label beside it.

const DOT: Record<MovieRecapStepState, string> = {
  done: "border-ok bg-ok text-panel",
  active: "border-accent bg-accent-dim text-fg",
  failed: "border-danger bg-danger text-panel",
  skipped: "border-line-2 bg-panel text-fg-3",
  pending: "border-line-2 bg-panel text-fg-3",
};

const LABEL: Record<MovieRecapStepState, string> = {
  done: "text-fg-2",
  active: "text-fg font-medium",
  failed: "text-danger font-medium",
  skipped: "text-fg-3 line-through",
  pending: "text-fg-3",
};

function StepIcon({ state, index }: { state: MovieRecapStepState; index: number }) {
  if (state === "done") return <Check size={13} strokeWidth={3} />;
  if (state === "failed") return <X size={13} strokeWidth={3} />;
  if (state === "skipped") return <Minus size={13} strokeWidth={3} />;
  if (state === "active") return <Loader2 size={13} className="animate-spin" />;
  return <span className="text-[10px] font-semibold tabular-nums">{index + 1}</span>;
}

// What the counted stages are counting. A stage missing from here reports no
// bar rather than an unlabelled one — a number with no noun is worse than none.
const COUNTED: Partial<Record<NonNullable<MovieRecapProject["renderStage"]>, string>> = {
  writing_script: "Blocks divided",
  synthesizing_narration: "Narration beats spoken",
  rendering_segments: "Beats cut",
};

/**
 * The same bar for both long runs, because they report the same stages.
 *
 * `phase` picks which one: the script run stops before anything is cut, so it
 * shows only the steps up to the narration it speaks in order to measure it, and
 * reads its own status columns. Sharing the component is what keeps the two from
 * drifting into different-looking progress for the same pipeline.
 */
export function MovieRecapRenderProgress({
  project,
  phase = "render",
}: {
  project: MovieRecapProject;
  phase?: "render" | "script";
}) {
  const script = phase === "script";
  const status = script ? project.scriptStatus : project.renderStatus;
  const stage = script ? project.scriptStage : project.renderStage;
  const states = script
    ? movieRecapScriptStepStates({ status: project.scriptStatus, stage: project.scriptStage })
    : movieRecapRenderStepStates({
        status: project.renderStatus,
        stage: project.renderStage,
        isMock: project.renderIsMock,
      });
  const steps: readonly { id: string; label: string }[] = script ? MOVIE_RECAP_SCRIPT_STEPS : MOVIE_RECAP_RENDER_STEPS;
  // These counters are written AFTER each beat finishes, so `current` is how
  // many are done — not the one in flight. The bar can read it straight.
  const label = stage ? COUNTED[stage] : undefined;
  const total = (script ? project.scriptProgressTotal : project.renderProgressTotal) ?? 0;
  const done = (script ? project.scriptProgressCurrent : project.renderProgressCurrent) ?? 0;
  const counting = Boolean(label) && total > 0 && status === "running";

  return (
    <div>
      <ol className="flex w-full items-start">
        {steps.map((step, index) => {
          const state = states[step.id];
          // A connector is filled when the step on EITHER side of it has been
          // reached, so the line never runs ahead of the dot it leads to. Each
          // step draws both of its own, and the first and last draw a blank in
          // place of the missing one — that keeps every dot centred over its
          // label instead of the ends sitting half a connector off.
          const reached = (id: string) => ["done", "active", "failed"].includes(states[id]);
          const previousFilled = index > 0 && reached(step.id);
          const nextFilled = index < steps.length - 1 && reached(steps[index + 1].id);
          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <div className={`h-px flex-1 ${index === 0 ? "bg-transparent" : previousFilled ? "bg-ok" : "bg-line-2"}`} />
                <div
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${DOT[state]}`}
                  aria-hidden
                >
                  <StepIcon state={state} index={index} />
                </div>
                <div
                  className={`h-px flex-1 ${index === steps.length - 1 ? "bg-transparent" : nextFilled ? "bg-ok" : "bg-line-2"}`}
                />
              </div>
              <span className={`w-full truncate px-0.5 text-center text-[11px] ${LABEL[state]}`} title={step.label}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {counting && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-1.5 flex justify-between text-xs text-fg-2">
            <span>{label} {done} of {total}</span>
            <span className="tabular-nums">{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-chip">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
