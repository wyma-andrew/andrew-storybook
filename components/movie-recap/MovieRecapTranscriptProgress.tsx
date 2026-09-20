"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import type { MovieRecapProject } from "@/lib/api/types";
import { MOVIE_RECAP_TRANSCRIPT_STEPS } from "@/lib/constants/movie-recap";
import { movieRecapTranscriptStepStates, type MovieRecapStepState } from "@/lib/movie-recap";

// PARKED: nothing renders this. The Transcript step takes its two texts by hand
// while the automatic read is disconnected — see history/movie-recap.md. Kept
// with the route and pipeline it belongs to, so turning the read back on is a
// wizard change and not a rebuild.
//
// The transcript run's stages as a stepper, plus a real bar for the one stage
// that can count itself: the retelling knows how many passages it has left.
// Every other stage is one opaque wait, so no percentage is invented for it —
// a bar that fakes its own progress is worse than no bar.

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

export function MovieRecapTranscriptProgress({ project }: { project: MovieRecapProject }) {
  const states = movieRecapTranscriptStepStates({
    status: project.transcriptStatus,
    stage: project.transcriptStage,
    storyOnly: project.transcriptStoryOnly,
  });
  const steps = MOVIE_RECAP_TRANSCRIPT_STEPS;
  const total = project.transcriptProgressTotal ?? 0;
  // `current` is the passage being worked on, so the bar shows the ones already
  // finished behind it rather than counting the one in flight as done.
  const done = project.transcriptProgressCurrent ?? 0;
  const counting = project.transcriptStage === "translating" && total > 0;
  // Passages finished, plus how far into the one in flight — so the bar keeps
  // moving through a passage that takes minutes.
  const fraction = counting ? (done + (project.transcriptProgressPartial ?? 0) / 100) / total : 0;

  return (
    <div>
      <ol className="flex w-full items-start">
        {steps.map((step, index) => {
          const state = states[step.id];
          // A connector is filled when the step on EITHER side of it has been
          // reached, so the line never runs ahead of the dot it leads to.
          const reached = (id: string) => ["done", "active", "failed"].includes(states[id]);
          const previousFilled = index > 0 && reached(step.id);
          const nextFilled = index < steps.length - 1 && reached(steps[index + 1].id);
          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <div className={`h-px flex-1 ${index === 0 ? "bg-transparent" : previousFilled ? "bg-ok" : "bg-line-2"}`} />
                <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${DOT[state]}`} aria-hidden>
                  <StepIcon state={state} index={index} />
                </div>
                <div className={`h-px flex-1 ${index === steps.length - 1 ? "bg-transparent" : nextFilled ? "bg-ok" : "bg-line-2"}`} />
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
            <span>Retelling passage {done + 1} of {total}</span>
            <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-chip">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
