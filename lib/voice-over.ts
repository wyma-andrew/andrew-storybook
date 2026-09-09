export type VoiceOverSource = {
  sourceIndex: number;
  text: string;
};

export type ShotCoordinate = {
  id?: string;
  sceneIndex: number;
  shotIndex: number;
  durationS: number;
};

export type VoiceOverAssignment = {
  sourceIndex: number;
  startSceneIndex: number;
  startShotIndex: number;
  endSceneIndex: number;
  endShotIndex: number;
};

export type ResolvedVoiceOverAssignment = VoiceOverAssignment & {
  startOrder: number;
  endOrder: number;
};

export type StoredVoiceOverRange = {
  sourceIndex: number;
  startShotId: string;
  endShotId: string;
};

function coordinateKey(sceneIndex: number, shotIndex: number) {
  return `${sceneIndex}.${shotIndex}`;
}

export function resolveVoiceOverAssignments(
  sources: VoiceOverSource[],
  assignments: VoiceOverAssignment[],
  shots: ShotCoordinate[]
): ResolvedVoiceOverAssignment[] {
  if (assignments.length !== sources.length) {
    throw new Error("Voice Over mapping must assign every narration block exactly once.");
  }

  const sourceIndexes = new Set(sources.map((source) => source.sourceIndex));
  const shotOrder = new Map(
    shots.map((shot, order) => [coordinateKey(shot.sceneIndex, shot.shotIndex), order])
  );
  const seen = new Set<number>();

  const resolved = assignments
    .map((assignment) => {
      if (!sourceIndexes.has(assignment.sourceIndex) || seen.has(assignment.sourceIndex)) {
        throw new Error("Voice Over mapping contains a missing, duplicate, or unknown source index.");
      }
      seen.add(assignment.sourceIndex);

      const startOrder = shotOrder.get(coordinateKey(assignment.startSceneIndex, assignment.startShotIndex));
      const endOrder = shotOrder.get(coordinateKey(assignment.endSceneIndex, assignment.endShotIndex));
      if (startOrder === undefined || endOrder === undefined) {
        throw new Error("Voice Over mapping references an unknown shot.");
      }
      if (startOrder > endOrder) {
        throw new Error("Voice Over mapping starts after it ends.");
      }
      return { ...assignment, startOrder, endOrder };
    })
    .sort((a, b) => a.sourceIndex - b.sourceIndex);

  for (let i = 1; i < resolved.length; i++) {
    if (resolved[i - 1].endOrder >= resolved[i].startOrder) {
      throw new Error("Voice Over mappings must follow script order without overlapping.");
    }
  }
  return resolved;
}

export function validateStoredVoiceOverRanges(ranges: StoredVoiceOverRange[], orderedShotIds: string[]) {
  const shotOrder = new Map(orderedShotIds.map((id, order) => [id, order]));
  const sorted = [...ranges].sort((a, b) => a.sourceIndex - b.sourceIndex);

  let previousEnd = -1;
  for (const range of sorted) {
    const start = shotOrder.get(range.startShotId);
    const end = shotOrder.get(range.endShotId);
    if (start === undefined || end === undefined) {
      throw new Error("Voice Over range must use shots from the same chapter.");
    }
    if (start > end) throw new Error("Voice Over range starts after it ends.");
    if (start <= previousEnd) {
      throw new Error("Voice Over ranges must follow script order without overlapping.");
    }
    previousEnd = end;
  }
}
