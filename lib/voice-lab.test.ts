import { describe, expect, it } from "vitest";
import { getVoiceLabProfile, validateVoiceLabText, VOICE_LAB_MAX_TEXT_LENGTH } from "./voice-lab";

describe("voice lab", () => {
  it("only accepts known voice profiles", () => {
    expect(getVoiceLabProfile("narrator")?.name).toBe("Narrator");
    expect(getVoiceLabProfile("unknown")).toBeNull();
  });

  it("requires bounded non-empty text", () => {
    expect(validateVoiceLabText("  ")).toBeTruthy();
    expect(validateVoiceLabText("မင်္ဂလာပါ")).toBeNull();
    expect(validateVoiceLabText("က".repeat(VOICE_LAB_MAX_TEXT_LENGTH + 1))).toBeTruthy();
  });
});
