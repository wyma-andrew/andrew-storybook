import { getVoice, listVoices } from "./tts/voices";

export const VOICE_LAB_MAX_TEXT_LENGTH = 600;

// The lab picker is every voice flagged for the lab surface — both the paid
// Azure voices and the self-hosted ones, so the two can be compared on the same
// line of text. The catalog in lib/tts/voices.ts owns the entries themselves.
export const VOICE_LAB_PROFILES = listVoices("voice-lab");

export type VoiceLabProfileId = (typeof VOICE_LAB_PROFILES)[number]["id"];

export function getVoiceLabProfile(id: unknown) {
  return getVoice(id, "voice-lab");
}

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
