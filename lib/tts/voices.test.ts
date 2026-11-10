import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOVIE_RECAP_VOICE_ID, getVoiceById, resolveMovieRecapVoice, VOICES } from "./voices";

describe("tts voice catalog", () => {
  it("is one list for every surface", () => {
    expect(VOICES.map((voice) => voice.id)).toEqual(["azure-thiha", "azure-nilar", "wise-elder", "grandpa", "dhamma-1", "dhamma-3"]);
    expect(getVoiceById("unknown")).toBeNull();
  });

  it("binds each VoxCPM profile to its fixed reference WAV", () => {
    for (const id of ["wise-elder", "grandpa", "dhamma-1", "dhamma-3"]) {
      const voice = getVoiceById(id);
      expect(voice?.providerId).toBe("voxcpm");
      if (voice?.providerId !== "voxcpm") continue;
      expect(voice.params.referenceAudioId).toBe(id);
      const audio = readFileSync(join(process.cwd(), "workers/voice-lab/reference_audio", `${id}.wav`));
      expect(createHash("sha256").update(audio).digest("hex")).toBe(voice.params.referenceAudioHash);
    }
  });

  it("falls back to the default for an unknown stored voice", () => {
    expect(resolveMovieRecapVoice("removed-voice").id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice(null).id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice("azure-nilar").id).toBe("azure-nilar");
  });
});
