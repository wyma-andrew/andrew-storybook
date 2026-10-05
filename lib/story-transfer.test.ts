import { describe, expect, it } from "vitest";
import {
  parseStoryBundle,
  storyBundleFileName,
  STORY_BUNDLE_FORMAT,
  STORY_BUNDLE_VERSION,
  type StoryBundle,
} from "./story-transfer";

const bundle: StoryBundle = {
  format: STORY_BUNDLE_FORMAT,
  version: STORY_BUNDLE_VERSION,
  exportedAt: "2026-09-16T10:00:00.000Z",
  story: {
    title: "The Ashfall Lighthouse",
    description: "A keeper and a storm.",
    visualStyleId: "realistic",
    aspectRatio: "16:9",
    region: "myanmar",
    motionStyleId: "sacred-cinematic",
    format: "cozy-asmr",
    bible: [
      {
        key: 0,
        kind: "location",
        name: "Lighthouse",
        meta: null,
        spaceKind: "interior",
        realPrompt: "Stone tower...",
        seed: null,
        locked: true,
        images: [{ angleLabel: "Plan", imageUrl: "https://example.com/a.png", isCanonical: true }],
      },
    ],
    chapters: [
      {
        index: 1,
        title: "Episode 1",
        status: "storyboard",
        script: { type: "doc", content: [] },
        aspectRatio: null,
        siteMap: { places: [] },
        assets: [
          {
            kind: "location",
            bibleKey: 0,
            name: "Lighthouse",
            meta: null,
            spaceKind: "interior",
            realPrompt: "Stone tower...",
            matchStatus: "matched",
            images: [],
          },
        ],
        scenes: [
          {
            index: 1,
            title: "Arrival",
            slug: "INT. LIGHTHOUSE — NIGHT",
            lighting: "Lantern glow",
            shots: [
              {
                index: 1,
                label: "1.1",
                beat: "He climbs.",
                durationS: 4,
                aspect: "16:9",
                camera: "Slow push in",
                shotScale: "medium",
                motionMode: "normal",
                prompt: "Generated prompt",
                promptOverride: "Edited prompt",
                videoPrompt: "Generated video prompt",
                videoPromptOverride: null,
                soundPrompt: "Knife on wood, steady rain on the roof",
                soundPromptOverride: null,
                startState: "Door shut",
                endState: "Door open",
                assetsUsed: [{ name: "Lighthouse", kind: "location" }],
              },
            ],
          },
        ],
        voiceOvers: [
          {
            sourceIndex: 1,
            text: "The storm had a name.",
            textOverride: null,
            startShot: { sceneIndex: 1, shotIndex: 1 },
            endShot: { sceneIndex: 1, shotIndex: 1 },
          },
        ],
      },
    ],
  },
};

describe("parseStoryBundle", () => {
  it("round-trips a bundle unchanged", () => {
    const result = parseStoryBundle(JSON.parse(JSON.stringify(bundle)));
    expect(result).toEqual({ bundle });
  });

  it("reads an export from before story formats and sound prompts", () => {
    const old = JSON.parse(JSON.stringify(bundle));
    delete old.story.format;
    delete old.story.chapters[0].scenes[0].shots[0].soundPrompt;
    delete old.story.chapters[0].scenes[0].shots[0].soundPromptOverride;

    const result = parseStoryBundle(old);
    if ("error" in result) throw new Error(result.error);
    expect(result.bundle.story.format).toBe("cinematic");
    expect(result.bundle.story.chapters[0].scenes[0].shots[0].soundPrompt).toBeNull();
  });

  it("rejects a file that is not a story export", () => {
    expect(parseStoryBundle({ hello: "world" })).toEqual({
      error: "That file is not an AI Storybook story export.",
    });
    expect(parseStoryBundle(null)).toEqual({ error: "That file is not a story export." });
  });

  it("rejects a version it cannot read", () => {
    const result = parseStoryBundle({ ...bundle, version: 99 });
    expect("error" in result && result.error).toContain("Unsupported export version 99");
  });

  it("normalizes unknown enum values instead of failing", () => {
    const wild = JSON.parse(JSON.stringify(bundle));
    wild.story.region = "atlantis";
    wild.story.chapters[0].status = "rendered";
    wild.story.chapters[0].scenes[0].shots[0].shotScale = "panoramic";
    wild.story.chapters[0].assets[0].kind = "vehicle";

    const result = parseStoryBundle(wild);
    if ("error" in result) throw new Error(result.error);
    expect(result.bundle.story.region).toBe("english");
    expect(result.bundle.story.chapters[0].status).toBe("script");
    expect(result.bundle.story.chapters[0].scenes[0].shots[0].shotScale).toBeNull();
    expect(result.bundle.story.chapters[0].assets[0].kind).toBe("character");
  });

  it("drops a voice over whose shot range is unusable", () => {
    const broken = JSON.parse(JSON.stringify(bundle));
    broken.story.chapters[0].voiceOvers[0].endShot = null;
    const result = parseStoryBundle(broken);
    if ("error" in result) throw new Error(result.error);
    expect(result.bundle.story.chapters[0].voiceOvers).toEqual([]);
  });

  it("rejects an export with no chapters array", () => {
    const result = parseStoryBundle({ ...bundle, story: { title: "x" } });
    expect("error" in result && result.error).toContain("missing its chapters");
  });
});

describe("storyBundleFileName", () => {
  it("slugifies the title and stamps the export date", () => {
    expect(storyBundleFileName("The Ashfall Lighthouse!", "2026-09-16T10:00:00.000Z")).toBe(
      "the-ashfall-lighthouse-2026-09-16.storybook.json"
    );
  });

  it("falls back when the title has no usable characters", () => {
    expect(storyBundleFileName("ဇာတ်လမ်း", "2026-09-16T10:00:00.000Z")).toBe("story-2026-09-16.storybook.json");
  });
});
