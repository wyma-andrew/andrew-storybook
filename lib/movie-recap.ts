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
