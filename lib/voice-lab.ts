export const VOICE_LAB_MAX_TEXT_LENGTH = 600;

export const VOICE_LAB_PROFILES = [
  {
    id: "narrator",
    name: "Wai Yan",
    description: "A clear, calm Burmese recap voice with steady cinematic pacing.",
    stylePrompt: "A calm cinematic narrator with a clear mature voice and steady storytelling pace",
    seed: 20260915,
  },
  {
    id: "narrator-female",
    name: "Yu Yu",
    description: "A clear, calm Burmese recap voice with a female timbre and steady cinematic pacing.",
    stylePrompt: "A calm cinematic female narrator with a clear mature voice and steady storytelling pace",
    seed: 20260916,
  },
] as const;

export type VoiceLabProfileId = (typeof VOICE_LAB_PROFILES)[number]["id"];

export function getVoiceLabProfile(id: unknown) {
  return VOICE_LAB_PROFILES.find((profile) => profile.id === id) ?? null;
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
