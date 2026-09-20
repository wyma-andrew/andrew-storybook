import { describe, expect, it } from "vitest";
import { movieRecapRenderStepStates, movieRecapTranscriptStepStates } from "./movie-recap";
import { MOVIE_RECAP_RENDER_STEPS, MOVIE_RECAP_TRANSCRIPT_STEPS } from "./constants/movie-recap";

const states = (over: Parameters<typeof movieRecapRenderStepStates>[0]) => movieRecapRenderStepStates(over);

// Only the dialogue pass is parked now: the story is typed by hand, so nothing
// transcribes the source. Scenes and Script came back on 2026-09-19, when the
// render started cutting on the film's own scenes and dividing each block's
// passage across them (history/movie-recap.md). A parked step stays on the bar,
// struck through, rather than vanishing from it.
const PARKED = ["dialogue"];

describe("movieRecapRenderStepStates", () => {
  it("shows nothing started before a render runs", () => {
    const s = states({ status: "idle", stage: null, isMock: false });
    expect(Object.entries(s).every(([id, state]) => state === (PARKED.includes(id) ? "skipped" : "pending"))).toBe(true);
  });

  it("marks earlier steps done and later ones pending while running", () => {
    const s = states({ status: "running", stage: "rendering_segments", isMock: false });
    expect(s.download).toBe("done");
    expect(s.narration).toBe("done");
    expect(s.video).toBe("active");
    expect(s.publish).toBe("pending");
  });

  it("fills the whole bar when the render finished", () => {
    const s = states({ status: "done", stage: null, isMock: false });
    expect(Object.entries(s).every(([id, state]) => state === (PARKED.includes(id) ? "skipped" : "done"))).toBe(true);
  });

  it("marks the step that failed, not the whole bar", () => {
    // The render keeps render_stage on failure precisely so this can be shown.
    const s = states({ status: "failed", stage: "synthesizing_narration", isMock: false });
    expect(s.download).toBe("done");
    expect(s.narration).toBe("failed");
    expect(s.video).toBe("pending");
  });

  it("never claims a parked pass ran, whatever the render did", () => {
    // A bar showing "Scenes: done" for work no render does any more is the same
    // lie the mock rules exist to prevent.
    for (const status of ["idle", "running", "done", "failed"] as const) {
      const s = states({ status, stage: "rendering_segments", isMock: false });
      for (const id of PARKED) expect(s[id]).toBe("skipped");
    }
  });

  it("never claims a mock did the work it skipped", () => {
    // A mock uses canned narration and touches no model. Showing those steps as
    // done would be a lie told by a progress bar.
    const s = states({ status: "done", stage: null, isMock: true });
    expect(s.download).toBe("skipped");
    expect(s.narration).toBe("skipped");
    expect(s.video).toBe("done");
    expect(s.publish).toBe("done");
  });

  it("keeps mock steps skipped mid-run too", () => {
    const s = states({ status: "running", stage: "rendering_segments", isMock: true });
    expect(s.download).toBe("skipped");
    expect(s.video).toBe("active");
  });

  it("shows nothing started for a stage it does not recognise", () => {
    // Rather than guessing. A bar that has not started beats one claiming work
    // that never happened — and this is what an un-grouped new stage produces.
    const s = states({ status: "running", stage: null, isMock: false });
    expect(Object.entries(s).every(([id, state]) => state === (PARKED.includes(id) ? "skipped" : "pending"))).toBe(true);
  });

  it("covers every stage the render can report", () => {
    // The guard against the real maintenance hazard: a stage added to the
    // pipeline but not to a step group would silently read as "not started".
    // The parked stages stay grouped so the bar is right again when they return.
    const grouped = new Set(MOVIE_RECAP_RENDER_STEPS.flatMap((step) => [...step.stages]));
    const all = [
      "downloading_source", "detecting_scenes", "describing_scenes", "reading_captions",
      "extracting_audio", "transcribing", "writing_script", "synthesizing_narration",
      "rendering_segments", "concatenating", "applying_overlays", "uploading",
    ];
    expect(all.filter((stage) => !grouped.has(stage as never))).toEqual([]);
  });
});

const transcriptStates = (over: Parameters<typeof movieRecapTranscriptStepStates>[0]) => movieRecapTranscriptStepStates(over);

describe("movieRecapTranscriptStepStates", () => {
  it("marks earlier steps done and later ones pending while running", () => {
    const s = transcriptStates({ status: "running", stage: "transcribing", storyOnly: false });
    expect(s.download).toBe("done");
    expect(s.dialogue).toBe("active");
    expect(s.story).toBe("pending");
  });

  it("never claims a retell-only run read the source", () => {
    // It reuses the stored transcript, so those steps genuinely did not run.
    const s = transcriptStates({ status: "done", stage: null, storyOnly: true });
    expect(s.download).toBe("skipped");
    expect(s.dialogue).toBe("skipped");
    expect(s.story).toBe("done");
  });

  it("marks the step that failed, not the whole bar", () => {
    const s = transcriptStates({ status: "failed", stage: "translating", storyOnly: false });
    expect(s.dialogue).toBe("done");
    expect(s.story).toBe("failed");
  });

  it("covers every stage the transcript run can report", () => {
    // A stage added to the pipeline but not to a step group would silently read
    // as "not started".
    const grouped = new Set(MOVIE_RECAP_TRANSCRIPT_STEPS.flatMap((step) => [...step.stages]));
    const all = ["downloading_source", "reading_captions", "extracting_audio", "transcribing", "translating"];
    expect(all.filter((stage) => !grouped.has(stage as never))).toEqual([]);
  });
});
