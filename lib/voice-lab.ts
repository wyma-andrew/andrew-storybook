
export const VOICE_LAB_MAX_TEXT_LENGTH = 600;

export function validateVoiceLabText(value: unknown) {
  if (typeof value !== "string") return "Enter Burmese text to generate.";
  const text = value.trim();
  if (!text) return "Enter Burmese text to generate.";
  if (text.length > VOICE_LAB_MAX_TEXT_LENGTH) {
    return `Keep lab text under ${VOICE_LAB_MAX_TEXT_LENGTH} characters.`;
  }
  return null;
}

export const VOICE_LAB_MAX_ITEMS = 200;

export type VoiceLabItemStatus = "pending" | "processing" | "done" | "failed";

export type VoiceLabItem = {
  id: string;
  position: number;
  text: string;
  voiceId: string | null;
  status: VoiceLabItemStatus;
  audioUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
};

export function splitVoiceLabScript(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function mapVoiceLabItem(row: Record<string, unknown>): VoiceLabItem {
  return {
    id: row.id as string,
    position: row.position as number,
    text: row.text as string,
    voiceId: (row.voice_id as string | null) ?? null,
    status: row.status as VoiceLabItemStatus,
    audioUrl: (row.audio_url as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    error: (row.error as string | null) ?? null,
  };
}

// A worker that died mid-job never reports back; past this a "processing" row
// is treated as failed so Generate can pick it up again.
export const VOICE_LAB_STALE_PROCESSING_MS = 30 * 60 * 1000;

export type VoiceLabProject = {
  id: string;
  name: string;
  voiceId: string | null;
  lineCount: number;
  doneCount: number;
  createdAt: string;
  updatedAt: string;
};

export function validateVoiceLabProjectName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "Enter a project name.";
  if (value.trim().length > 120) return "Keep the name under 120 characters.";
  return null;
}

export function mapVoiceLabProject(row: Record<string, unknown>): VoiceLabProject {
  const items = (row.voice_lab_items as { status: VoiceLabItemStatus }[] | undefined) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    voiceId: (row.voice_id as string | null) ?? null,
    lineCount: items.length,
    doneCount: items.filter((item) => item.status === "done").length,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
