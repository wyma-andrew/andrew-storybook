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
