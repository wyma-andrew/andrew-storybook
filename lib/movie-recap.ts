const MIB = 1024 * 1024;
const MIN_PART_SIZE = 16 * MIB;
const MAX_PARTS = 10_000;

export function movieRecapPartSize(sizeBytes: number) {
  const needed = Math.ceil(sizeBytes / MAX_PARTS);
  return Math.max(MIN_PART_SIZE, Math.ceil(needed / MIB) * MIB);
}

export function movieRecapPartCount(sizeBytes: number, partSize = movieRecapPartSize(sizeBytes)) {
  return Math.ceil(sizeBytes / partSize);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function clampBlurRect(rect: { x: number; y: number; width: number; height: number }) {
  const width = Math.min(100, Math.max(5, rect.width));
  const height = Math.min(100, Math.max(5, rect.height));
  return {
    width,
    height,
    x: Math.min(100 - width, Math.max(0, rect.x)),
    y: Math.min(100 - height, Math.max(0, rect.y)),
  };
}


// What a freshly uploaded source should be rendered as. Called once, at upload,
// and never again: seeding on anything other than an explicit action fights the
// user, which is the mistake the zoom default made (history/movie-recap.md).
//
// `cover` fills the frame by cropping, so it is right only when the output
// orientation matches the source's. When they differ, cropping a portrait source
// into a landscape frame throws away most of the picture, and `contain` — with
// the blurred backfill behind the bars — is the only setting that keeps it.
//
// CAVEAT: `videoWidth`/`videoHeight` in the browser ignore rotation metadata. A
// phone video shot in portrait often reports 1920x1080 with a 90-degree flag, and
// the browser does not expose the flag, so this can call it landscape. That is
// why the result is a DEFAULT the user can change, not a decision.
export function suggestMovieRecapFraming(width: number, height: number) {
  const portrait = height > width;
  return {
    aspectRatio: portrait ? ("9:16" as const) : ("16:9" as const),
    // Matching orientation by construction, so cover never crops across it.
    fitMode: "cover" as const,
  };
}


// Which speed a given shot plays at. Deterministic, not random: the same project
// must render to the same file twice, the way the voice seeds do, or a re-render
// quietly produces different output and nothing can be compared against anything.
//
// The hash is FNV-1a over the project id and the shot's position — small, stable,
// and it does not matter that it is weak, only that it spreads neighbouring shots
// across different speeds so a run does not all drift the same way.
export function pickShotSpeed(speeds: readonly number[], projectId: string, beatIndex: number, shotIndex: number) {
  if (!speeds.length) return 1;
  const key = `${projectId}:${beatIndex}:${shotIndex}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return speeds[hash % speeds.length];
}


// Where in the source to grab the thumbnail on press number `attempt`.
//
// The button is a shuffle: press again, get a different frame. That needs a
// sequence that spreads out fast — stepping linearly would hand back four
// near-identical frames from the opening minutes before it reached anything
// else. The golden-ratio increment is the standard low-discrepancy answer: every
// prefix of the sequence is roughly evenly spread over the whole span, so the
// first four presses already sample the beginning, middle and end.
//
// Deterministic in `attempt` alone, like pickShotSpeed, so a given press is
// reproducible and the row can store which one produced the current image.
//
// The first and last 5% are skipped: that is where studio idents, fades from
// black and credits live, and a black frame is the one result that makes the
// button look broken.
const THUMBNAIL_EDGE_MARGIN = 0.05;
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;

export function thumbnailTimeFor(durationSeconds: number, attempt: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const span = durationSeconds * (1 - THUMBNAIL_EDGE_MARGIN * 2);
  // Start at 0.5 rather than 0 so the very first press lands mid-film, which is
  // the likeliest place to find a representative frame.
  const fraction = (0.5 + Math.max(0, attempt) * GOLDEN_RATIO_CONJUGATE) % 1;
  return durationSeconds * THUMBNAIL_EDGE_MARGIN + span * fraction;
}
