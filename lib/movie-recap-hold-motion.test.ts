import { describe, expect, it } from "vitest";
import { holdMotionFilter } from "./movie-recap-transform";
import { MOVIE_RECAP_HOLD_MOTION, MOVIE_RECAP_TARGET_DIMENSIONS } from "./constants/movie-recap";

const filterFor = (over: Partial<Parameters<typeof holdMotionFilter>[0]> = {}) =>
  holdMotionFilter({ aspectRatio: "9:16", slotS: 5, fps: 30, ...over });

describe("holdMotionFilter", () => {
  it("ends at the output's own size, whatever it worked at in between", () => {
    // Both oversizes are jitter fixes, not resizes: zoompan places its window on
    // whole pixels, so it does that on an enlarged frame and the result is
    // shrunk back. A segment that came out any other size could not be
    // concatenated.
    const [w, h] = MOVIE_RECAP_TARGET_DIMENSIONS["9:16"];
    const { prescale, supersample } = MOVIE_RECAP_HOLD_MOTION;
    const filter = filterFor();
    expect(filter).toContain(`scale=${w * prescale}:${h * prescale}`);
    expect(filter).toContain(`:s=${w * supersample}x${h * supersample}`);
    expect(filter.endsWith(`scale=${w}:${h},settb=1/30,setpts=N`)).toBe(true);
  });

  it("shrinks AFTER zoompan, never before it", () => {
    // The downscale is the whole jitter fix: a whole-pixel step at twice the
    // size is half a pixel at the output, and the filter averages it away.
    // Moving it earlier silently restores the shake.
    const filter = filterFor();
    expect(filter.indexOf("zoompan=")).toBeLessThan(filter.lastIndexOf("scale="));
  });

  it("clamps the push-in at its target", () => {
    // tpad deliberately overshoots the slot before the output -t cuts back. The
    // clamp is what stops those extra frames zooming past the end of the move.
    expect(filterFor()).toContain(`\\,${MOVIE_RECAP_HOLD_MOTION.zoom.toFixed(4)})`);
  });

  it("spends the whole push-in across the shot's frames", () => {
    // 5s at 30fps is 150 frames, so the step is spent over 149 of them. The step
    // is written to six decimals, so it lands a hair short of the target rather
    // than exactly on it — 0.005% of the zoom, which is well under one pixel.
    const step = Number(/min\(1\+([\d.]+)\*on/.exec(filterFor())![1]);
    expect(step * 149).toBeCloseTo(MOVIE_RECAP_HOLD_MOTION.zoom - 1, 3);
  });

  it("pushes in dead centre and never pans", () => {
    // The sideways drift was removed (2026-09-19): on a held frame the pan was
    // the part that read as an effect. A window that moves off centre is the
    // regression this guards.
    const filter = filterFor();
    expect(filter).toContain("x='(iw-iw/zoom)/2'");
    expect(filter).toContain("y='(ih-ih/zoom)/2'");
  });

  it("rebuilds the timebase after zoompan, or the render never finishes", () => {
    // THE regression guard. `segmentFilters()` always appends an `fps` filter
    // after this chain, and zoompan hands on timestamps that filter cannot make
    // sense of — it answers by duplicating frames without bound. Measured on the
    // real source: 9,401 frames in twenty seconds for a shot that is 163, an
    // 18MB file for five seconds of video, and six minutes on one shot.
    const filter = filterFor();
    const zoompan = filter.indexOf("zoompan=");
    const settb = filter.indexOf("settb=");
    const setpts = filter.indexOf("setpts=N");
    expect(zoompan).toBeGreaterThan(-1);
    expect(settb).toBeGreaterThan(zoompan);
    expect(setpts).toBeGreaterThan(settb);
  });

  it("does not set a frame rate on the zoompan itself", () => {
    // Removing this was tried as the fix and is NOT one — it still ran away
    // without the timebase rebuild above. It stays out anyway: the trailing
    // `fps` filter is the one place the pipeline decides the rate.
    expect(filterFor()).not.toMatch(/zoompan=[^,]*fps=/);
  });

  it("survives a shot too short to have two frames", () => {
    // `frames - 1` is a denominator. A one-frame slot would divide by zero and
    // put NaN into the filter graph, which ffmpeg reports as a parse error a
    // long way from the cause.
    const filter = filterFor({ slotS: 0.01 });
    expect(filter).not.toContain("NaN");
    expect(filter).not.toContain("Infinity");
  });
});
