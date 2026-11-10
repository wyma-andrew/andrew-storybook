import { describe, expect, it } from "vitest";
import { splitVoiceLabScript, validateVoiceLabText, VOICE_LAB_MAX_TEXT_LENGTH } from "./voice-lab";

describe("voice lab", () => {
  it("requires bounded non-empty text", () => {
    expect(validateVoiceLabText("  ")).toBeTruthy();
    expect(validateVoiceLabText("မင်္ဂလာပါ")).toBeNull();
    expect(validateVoiceLabText("က".repeat(VOICE_LAB_MAX_TEXT_LENGTH + 1))).toBeTruthy();
  });

  it("turns each non-empty line into one item", () => {
    expect(splitVoiceLabScript("ပထမ\r\n\n  ဒုတိယ  \n")).toEqual(["ပထမ", "ဒုတိယ"]);
    expect(splitVoiceLabScript("  \n ")).toEqual([]);
  });
});
