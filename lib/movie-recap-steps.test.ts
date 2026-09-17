import { describe, expect, it } from "vitest";
import { movieRecapRenderStepStates } from "./movie-recap";
import { MOVIE_RECAP_RENDER_STEPS } from "./constants/movie-recap";

const states = (over: Parameters<typeof movieRecapRenderStepStates>[0]) => movieRecapRenderStepStates(over);

describe("movieRecapRenderStepStates", () => {
  it("shows nothing started before a render runs", () => {
    const s = states({ status: "idle", stage: null, isMock: false });
    expect(Object.values(s).every((state) => state === "pending")).toBe(true);
  });

  it("marks earlier steps done and later ones pending while running", () => {
    const s = states({ status: "running", stage: "writing_script", isMock: false });
    expect(s.download).toBe("done");
    expect(s.scenes).toBe("done");
    expect(s.dialogue).toBe("done");
    expect(s.script).toBe("active");
    expect(s.narration).toBe("pending");
    expect(s.publish).toBe("pending");
  });

  it("fills the whole bar when the render finished", () => {
    const s = states({ status: "done", stage: null, isMock: false });
    expect(Object.values(s).every((state) => state === "done")).toBe(true);
  });

  it("marks the step that failed, not the whole bar", () => {
    // The render keeps render_stage on failure precisely so this can be shown.
    const s = states({ status: "failed", stage: "synthesizing_narration", isMock: false });
    expect(s.script).toBe("done");
    expect(s.narration).toBe("failed");
    expect(s.video).toBe("pending");
  });

  it("treats captions and transcription as the same step", () => {
    // They are alternatives, not a sequence: a source with subtitles never
    // transcribes, and one without never reads captions.
    for (const stage of ["reading_captions", "extracting_audio", "transcribing"] as const) {
      expect(states({ status: "running", stage, isMock: false }).dialogue).toBe("active");
    }
  });

  it("never claims a mock did the work it skipped", () => {
    // A mock uses canned narration and touches no model. Showing those steps as
    // done would be a lie told by a progress bar.
    const s = states({ status: "done", stage: null, isMock: true });
    expect(s.download).toBe("skipped");
    expect(s.dialogue).toBe("skipped");
    expect(s.narration).toBe("skipped");
    expect(s.video).toBe("done");
    expect(s.publish).toBe("done");
  });

  it("keeps mock steps skipped mid-run too", () => {
    const s = states({ status: "running", stage: "rendering_segments", isMock: true });
    expect(s.scenes).toBe("skipped");
    expect(s.video).toBe("active");
  });

  it("shows nothing started for a stage it does not recognise", () => {
    // Rather than guessing. A bar that has not started beats one claiming work
    // that never happened — and this is what an un-grouped new stage produces.
    const s = states({ status: "running", stage: null, isMock: false });
    expect(Object.values(s).every((state) => state === "pending")).toBe(true);
  });

  it("covers every stage the render can report", () => {
    // The guard against the real maintenance hazard: a stage added to the
    // pipeline but not to a step group would silently read as "not started".
    const grouped = new Set(MOVIE_RECAP_RENDER_STEPS.flatMap((step) => [...step.stages]));
    const all = [
      "downloading_source", "detecting_scenes", "describing_scenes", "reading_captions",
      "extracting_audio", "transcribing", "writing_script", "synthesizing_narration",
      "rendering_segments", "concatenating", "applying_overlays", "uploading", "writing_hook_titles",
    ];
    expect(all.filter((stage) => !grouped.has(stage as never))).toEqual([]);
  });
});
