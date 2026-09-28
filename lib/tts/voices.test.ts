import { describe, expect, it } from "vitest";
import { DEFAULT_MOVIE_RECAP_VOICE_ID, getVoice, listVoices, resolveMovieRecapVoice } from "./voices";

describe("tts voice catalog", () => {
  it("offers all four shared Burmese voices to Movie Recap", () => {
    const ids = listVoices("movie-recap").map((voice) => voice.id);
    expect(ids).toEqual(["azure-thiha", "azure-nilar", "narrator", "narrator-female"]);
  });

  it("shares VoxCPM2 voices between the lab and Movie Recap", () => {
    expect(getVoice("narrator", "voice-lab")?.providerId).toBe("voxcpm");
    expect(getVoice("narrator", "movie-recap")?.providerId).toBe("voxcpm");
    expect(getVoice("narrator-female", "movie-recap")?.providerId).toBe("voxcpm");
  });

  it("falls back to the default for an unknown stored voice", () => {
    expect(resolveMovieRecapVoice("removed-voice").id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice(null).id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice("azure-nilar").id).toBe("azure-nilar");
  });
});
