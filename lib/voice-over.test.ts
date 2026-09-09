import { describe, expect, it } from "vitest";
import { resolveVoiceOverAssignments, validateStoredVoiceOverRanges } from "./voice-over";

const sources = [
  { sourceIndex: 1, text: "First narration" },
  { sourceIndex: 2, text: "Second narration" },
];
const shots = [
  { id: "a", sceneIndex: 1, shotIndex: 1, durationS: 4 },
  { id: "b", sceneIndex: 1, shotIndex: 2, durationS: 4 },
  { id: "c", sceneIndex: 2, shotIndex: 1, durationS: 5 },
  { id: "d", sceneIndex: 2, shotIndex: 2, durationS: 3 },
];

describe("resolveVoiceOverAssignments", () => {
  it("accepts ordered non-overlapping ranges that cross scenes", () => {
    const result = resolveVoiceOverAssignments(
      sources,
      [
        { sourceIndex: 1, startSceneIndex: 1, startShotIndex: 1, endSceneIndex: 2, endShotIndex: 1 },
        { sourceIndex: 2, startSceneIndex: 2, startShotIndex: 2, endSceneIndex: 2, endShotIndex: 2 },
      ],
      shots
    );
    expect(result.map(({ startOrder, endOrder }) => [startOrder, endOrder])).toEqual([[0, 2], [3, 3]]);
  });

  it("rejects a reversed range", () => {
    expect(() => resolveVoiceOverAssignments(
      [sources[0]],
      [{ sourceIndex: 1, startSceneIndex: 2, startShotIndex: 1, endSceneIndex: 1, endShotIndex: 2 }],
      shots
    )).toThrow(/starts after/);
  });

  it("rejects an unknown shot", () => {
    expect(() => resolveVoiceOverAssignments(
      [sources[0]],
      [{ sourceIndex: 1, startSceneIndex: 9, startShotIndex: 9, endSceneIndex: 9, endShotIndex: 9 }],
      shots
    )).toThrow(/unknown shot/);
  });

  it("rejects overlapping ranges", () => {
    expect(() => resolveVoiceOverAssignments(
      sources,
      [
        { sourceIndex: 1, startSceneIndex: 1, startShotIndex: 1, endSceneIndex: 1, endShotIndex: 2 },
        { sourceIndex: 2, startSceneIndex: 1, startShotIndex: 2, endSceneIndex: 2, endShotIndex: 1 },
      ],
      shots
    )).toThrow(/without overlapping/);
  });

  it("rejects ranges that violate source order", () => {
    expect(() => resolveVoiceOverAssignments(
      sources,
      [
        { sourceIndex: 1, startSceneIndex: 2, startShotIndex: 1, endSceneIndex: 2, endShotIndex: 1 },
        { sourceIndex: 2, startSceneIndex: 1, startShotIndex: 1, endSceneIndex: 1, endShotIndex: 2 },
      ],
      shots
    )).toThrow(/script order/);
  });
});

describe("validateStoredVoiceOverRanges", () => {
  it("requires boundary shots to belong to the chapter", () => {
    expect(() => validateStoredVoiceOverRanges(
      [{ sourceIndex: 1, startShotId: "a", endShotId: "missing" }],
      shots.map((shot) => shot.id!)
    )).toThrow(/same chapter/);
  });
});
