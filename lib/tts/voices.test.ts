import { describe, expect, it } from "vitest";
import { DEFAULT_MOVIE_RECAP_VOICE_ID, getVoice, listVoices, resolveMovieRecapVoice } from "./voices";

describe("tts voice catalog", () => {
  it("offers only Azure voices to Movie Recap", () => {
    const ids = listVoices("movie-recap").map((voice) => voice.id);
    expect(ids).toEqual(["azure-thiha", "azure-nilar"]);
    expect(listVoices("movie-recap").every((voice) => voice.providerId === "azure")).toBe(true);
  });

  it("keeps the self-hosted voices in the lab only", () => {
    expect(getVoice("narrator", "voice-lab")?.providerId).toBe("voxcpm");
    expect(getVoice("narrator", "movie-recap")).toBeNull();
  });

  it("falls back to the default for a project row written before Azure", () => {
    // Rows predating the migration carry `narrator`, now a lab-only voice — a
    // render speaks in the default voice rather than failing.
    expect(resolveMovieRecapVoice("narrator").id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice(null).id).toBe(DEFAULT_MOVIE_RECAP_VOICE_ID);
    expect(resolveMovieRecapVoice("azure-nilar").id).toBe("azure-nilar");
  });
});
