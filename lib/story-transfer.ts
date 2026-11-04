import type { SupabaseClient } from "@supabase/supabase-js";
import { isRegion, DEFAULT_REGION, type Region } from "./constants/regions";
import { parseLooks, type CharacterLook } from "./character-looks";
import { isMotionMode, DEFAULT_MOTION_STYLE_ID, type MotionMode } from "./constants/motion-styles";
import { resolveStoryFormat, type StoryFormat } from "./constants/story-formats";
import { isShotScale, type ShotScale } from "./constants/shot-scales";
import { DEFAULT_ASPECT_RATIO } from "./constants/aspect-ratios";
import type { AssetKind, SpaceKind } from "./api/types";

// Portable one-story bundle: everything needed to rebuild a story under a
// DIFFERENT account. Rows are exported without database ids, owner, or
// timestamps — cross-account uuids are meaningless, so every relationship is
// re-expressed positionally (shots by scene index + shot index) and remapped
// on import.
//
// Chapter images (R2 renders) are deliberately not in the bundle: the rows
// point at objects in the exporting account's bucket, and deleting the image
// in either story would delete the shared object out from under the other.
// See history/story-transfer.md.

export const STORY_BUNDLE_FORMAT = "ai-storybook.story" as const;
// Version 1 bundles also carried the removed story Asset Bible; they still
// import — see legacyBibleImagesByKey.
export const STORY_BUNDLE_VERSION = 2 as const;
const READABLE_VERSIONS = [1, 2];

export type BundleReferenceImage = {
  angleLabel: string;
  imageUrl: string | null;
  isCanonical: boolean;
};

export type BundleChapterAsset = {
  kind: AssetKind;
  name: string;
  meta: string | null;
  spaceKind: SpaceKind | null;
  realPrompt: string;
  looks: CharacterLook[];
  isGroup: boolean;
  matchStatus: "new" | "local" | "stale";
  images: BundleReferenceImage[];
};

export type BundleShot = {
  index: number;
  label: string | null;
  beat: string | null;
  durationS: number | null;
  aspect: string | null;
  camera: string | null;
  shotScale: ShotScale | null;
  motionMode: MotionMode | null;
  prompt: string;
  promptOverride: string | null;
  videoPrompt: string | null;
  videoPromptOverride: string | null;
  soundPrompt: string | null;
  soundPromptOverride: string | null;
  startState: string | null;
  endState: string | null;
  assetsUsed: { name: string; kind: AssetKind; look?: string; station?: string }[];
};

export type BundleScene = {
  index: number;
  title: string | null;
  slug: string | null;
  lighting: string | null;
  shots: BundleShot[];
};

export type BundleShotRef = { sceneIndex: number; shotIndex: number };

export type BundleVoiceOver = {
  sourceIndex: number;
  text: string;
  textOverride: string | null;
  startShot: BundleShotRef;
  endShot: BundleShotRef;
};

export type BundleChapter = {
  index: number;
  title: string;
  status: "script" | "assets" | "storyboard" | "done";
  script: unknown | null;
  aspectRatio: string | null;
  siteMap: unknown | null;
  assets: BundleChapterAsset[];
  scenes: BundleScene[];
  voiceOvers: BundleVoiceOver[];
};

export type StoryBundle = {
  format: typeof STORY_BUNDLE_FORMAT;
  version: typeof STORY_BUNDLE_VERSION;
  exportedAt: string;
  story: {
    title: string;
    description: string | null;
    visualStyleId: string | null;
    aspectRatio: string;
    region: Region;
    motionStyleId: string;
    format: StoryFormat;
    chapters: BundleChapter[];
  };
};

type Row = Record<string, unknown>;
type Db = SupabaseClient;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function isAssetKind(v: unknown): v is AssetKind {
  return v === "character" || v === "location" || v === "prop";
}

function isSpaceKind(v: unknown): v is SpaceKind {
  return v === "interior" || v === "exterior";
}

function mapBundleImages(rows: Row[] | null | undefined): BundleReferenceImage[] {
  return (rows ?? []).map((r) => ({
    angleLabel: str(r.angle_label) ?? "",
    imageUrl: str(r.image_url),
    isCanonical: Boolean(r.is_canonical),
  }));
}

/**
 * Reads one story and its whole owned hierarchy through the caller's
 * session-bound client — RLS is what decides whether the rows are visible, so
 * a story the caller does not own simply comes back missing.
 */
export async function buildStoryBundle(db: Db, storyId: string): Promise<{ bundle: StoryBundle } | { error: string; status: number }> {
  const { data: story, error: storyErr } = await db
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .is("deleted_at", null)
    .single();
  if (storyErr || !story) return { error: storyErr?.message ?? "Story not found.", status: 404 };

  const { data: chapters, error: chaptersErr } = await db
    .from("chapters")
    .select("*")
    .eq("story_id", storyId)
    .order("index");
  if (chaptersErr) return { error: chaptersErr.message, status: 500 };

  const bundleChapters: BundleChapter[] = [];
  for (const chapter of chapters ?? []) {
    const chapterId = chapter.id as string;
    const [{ data: assets, error: assetsErr }, { data: scenes, error: scenesErr }, { data: voiceOvers, error: voErr }] =
      await Promise.all([
        db.from("chapter_assets").select("*, chapter_asset_images(*)").eq("chapter_id", chapterId).order("created_at"),
        db.from("scenes").select("*, shots(*)").eq("chapter_id", chapterId).order("index"),
        db.from("voice_over_segments").select("*").eq("chapter_id", chapterId).order("source_index"),
      ]);
    if (assetsErr) return { error: assetsErr.message, status: 500 };
    if (scenesErr) return { error: scenesErr.message, status: 500 };
    if (voErr) return { error: voErr.message, status: 500 };

    // Shot id -> positional ref, so voice-over ranges survive the id change.
    const shotRefById = new Map<string, BundleShotRef>();
    const bundleScenes: BundleScene[] = (scenes ?? []).map((scene) => {
      const shots = ((scene.shots as Row[]) ?? []).slice().sort((a, b) => (num(a.index) ?? 0) - (num(b.index) ?? 0));
      for (const shot of shots) {
        shotRefById.set(shot.id as string, {
          sceneIndex: num(scene.index) ?? 0,
          shotIndex: num(shot.index) ?? 0,
        });
      }
      return {
        index: num(scene.index) ?? 0,
        title: str(scene.title),
        slug: str(scene.slug),
        lighting: str(scene.lighting),
        shots: shots.map((shot) => ({
          index: num(shot.index) ?? 0,
          label: str(shot.label),
          beat: str(shot.beat),
          durationS: num(shot.duration_s),
          aspect: str(shot.aspect),
          camera: str(shot.camera),
          shotScale: isShotScale(shot.shot_scale) ? shot.shot_scale : null,
          motionMode: isMotionMode(shot.motion_mode) ? shot.motion_mode : null,
          prompt: str(shot.prompt) ?? "",
          promptOverride: str(shot.prompt_override),
          videoPrompt: str(shot.video_prompt),
          videoPromptOverride: str(shot.video_prompt_override),
          soundPrompt: str(shot.sound_prompt),
          soundPromptOverride: str(shot.sound_prompt_override),
          startState: str(shot.start_state),
          endState: str(shot.end_state),
          assetsUsed: Array.isArray(shot.assets_used) ? (shot.assets_used as BundleShot["assetsUsed"]) : [],
        })),
      };
    });

    const bundleVoiceOvers: BundleVoiceOver[] = [];
    for (const segment of voiceOvers ?? []) {
      const startShot = shotRefById.get(segment.start_shot_id as string);
      const endShot = shotRefById.get(segment.end_shot_id as string);
      // A range whose shots are gone cannot be re-pointed on import; dropping
      // it loses narration, keeping it would fail the not-null shot columns.
      if (!startShot || !endShot) continue;
      bundleVoiceOvers.push({
        sourceIndex: num(segment.source_index) ?? 1,
        text: str(segment.text) ?? "",
        textOverride: str(segment.text_override),
        startShot,
        endShot,
      });
    }

    bundleChapters.push({
      index: num(chapter.index) ?? 0,
      title: (str(chapter.title) ?? "Untitled chapter").toString(),
      status: ["script", "assets", "storyboard", "done"].includes(chapter.status as string)
        ? (chapter.status as BundleChapter["status"])
        : "script",
      script: chapter.script ?? null,
      aspectRatio: str(chapter.aspect_ratio),
      siteMap: chapter.site_map ?? null,
      assets: (assets ?? []).map((asset) => ({
        kind: isAssetKind(asset.kind) ? asset.kind : "character",
        name: asset.name as string,
        meta: str(asset.meta),
        spaceKind: isSpaceKind(asset.space_kind) ? asset.space_kind : null,
        realPrompt: str(asset.real_prompt) ?? "",
        looks: parseLooks(asset.looks),
        isGroup: Boolean(asset.is_group),
        matchStatus: parseMatchStatus(asset.match_status),
        images: mapBundleImages(asset.chapter_asset_images as Row[] | null),
      })),
      scenes: bundleScenes,
      voiceOvers: bundleVoiceOvers,
    });
  }

  return {
    bundle: {
      format: STORY_BUNDLE_FORMAT,
      version: STORY_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      story: {
        title: str(story.title) ?? "Untitled Story",
        description: str(story.description),
        visualStyleId: str(story.visual_style_id),
        aspectRatio: str(story.aspect_ratio) ?? DEFAULT_ASPECT_RATIO,
        region: isRegion(story.region) ? story.region : DEFAULT_REGION,
        motionStyleId: str(story.motion_style_id) ?? DEFAULT_MOTION_STYLE_ID,
        format: resolveStoryFormat(story.format),
        chapters: bundleChapters,
      },
    },
  };
}

/**
 * Structural check for a file the user picked: it is arbitrary JSON from
 * outside the app, so nothing past this point may assume a shape. Unknown
 * enum values are normalized rather than rejected, because a bundle exported
 * by a newer build should still import.
 */
export function parseStoryBundle(input: unknown): { bundle: StoryBundle } | { error: string } {
  if (!input || typeof input !== "object") return { error: "That file is not a story export." };
  const raw = input as Row;
  if (raw.format !== STORY_BUNDLE_FORMAT) return { error: "That file is not an AI Storybook story export." };
  if (!READABLE_VERSIONS.includes(raw.version as number)) {
    return { error: `Unsupported export version ${String(raw.version)} — this app reads versions ${READABLE_VERSIONS.join(" and ")}.` };
  }
  const story = raw.story as Row | undefined;
  if (!story || typeof story !== "object") return { error: "The export has no story in it." };
  if (!Array.isArray(story.chapters)) return { error: "The export is missing its chapters." };

  const legacyBibleImages = legacyBibleImagesByKey(story.bible);

  const chapters: BundleChapter[] = (story.chapters as Row[]).map((chapter, i) => ({
    index: num(chapter.index) ?? i + 1,
    title: str(chapter.title) ?? "Untitled chapter",
    status: ["script", "assets", "storyboard", "done"].includes(chapter.status as string)
      ? (chapter.status as BundleChapter["status"])
      : "script",
    script: chapter.script ?? null,
    aspectRatio: str(chapter.aspectRatio),
    siteMap: chapter.siteMap ?? null,
    assets: (Array.isArray(chapter.assets) ? (chapter.assets as Row[]) : []).map((asset) => ({
      kind: isAssetKind(asset.kind) ? asset.kind : "character",
      name: str(asset.name) ?? "Untitled",
      meta: str(asset.meta),
      spaceKind: isSpaceKind(asset.spaceKind) ? asset.spaceKind : null,
      realPrompt: str(asset.realPrompt) ?? "",
      looks: parseLooks(asset.looks),
      isGroup: Boolean(asset.isGroup),
      matchStatus: parseMatchStatus(asset.matchStatus),
      images: mergeImages(parseImages(asset.images), legacyBibleImages.get(num(asset.bibleKey) ?? -1) ?? []),
    })),
    scenes: (Array.isArray(chapter.scenes) ? (chapter.scenes as Row[]) : []).map((scene, si) => ({
      index: num(scene.index) ?? si + 1,
      title: str(scene.title),
      slug: str(scene.slug),
      lighting: str(scene.lighting),
      shots: (Array.isArray(scene.shots) ? (scene.shots as Row[]) : []).map((shot, shi) => ({
        index: num(shot.index) ?? shi + 1,
        label: str(shot.label),
        beat: str(shot.beat),
        durationS: num(shot.durationS),
        aspect: str(shot.aspect),
        camera: str(shot.camera),
        shotScale: isShotScale(shot.shotScale) ? shot.shotScale : null,
        motionMode: isMotionMode(shot.motionMode) ? shot.motionMode : null,
        prompt: str(shot.prompt) ?? "",
        promptOverride: str(shot.promptOverride),
        videoPrompt: str(shot.videoPrompt),
        videoPromptOverride: str(shot.videoPromptOverride),
        soundPrompt: str(shot.soundPrompt),
        soundPromptOverride: str(shot.soundPromptOverride),
        startState: str(shot.startState),
        endState: str(shot.endState),
        assetsUsed: Array.isArray(shot.assetsUsed) ? (shot.assetsUsed as BundleShot["assetsUsed"]) : [],
      })),
    })),
    voiceOvers: (Array.isArray(chapter.voiceOvers) ? (chapter.voiceOvers as Row[]) : []).flatMap((segment, vi) => {
      const startShot = parseShotRef(segment.startShot);
      const endShot = parseShotRef(segment.endShot);
      const text = str(segment.text);
      if (!startShot || !endShot || !text || !text.trim()) return [];
      return [
        {
          sourceIndex: num(segment.sourceIndex) ?? vi + 1,
          text,
          textOverride: str(segment.textOverride),
          startShot,
          endShot,
        },
      ];
    }),
  }));

  return {
    bundle: {
      format: STORY_BUNDLE_FORMAT,
      version: STORY_BUNDLE_VERSION,
      exportedAt: str(raw.exportedAt) ?? new Date().toISOString(),
      story: {
        title: str(story.title) ?? "Untitled Story",
        description: str(story.description),
        visualStyleId: str(story.visualStyleId),
        aspectRatio: str(story.aspectRatio) ?? DEFAULT_ASPECT_RATIO,
        region: isRegion(story.region) ? story.region : DEFAULT_REGION,
        motionStyleId: str(story.motionStyleId) ?? DEFAULT_MOTION_STYLE_ID,
        format: resolveStoryFormat(story.format),
        chapters,
      },
    },
  };
}

// "matched" meant linked to a bible entry; with the bible gone it is a plain
// chapter asset.
function parseMatchStatus(value: unknown): BundleChapterAsset["matchStatus"] {
  if (value === "matched") return "new";
  return value === "new" || value === "stale" ? value : "local";
}

// A version 1 bundle's bible location images, by the key its chapter assets
// pointed at. They are folded onto those assets, as the database migration
// that removed the bible did.
function legacyBibleImagesByKey(input: unknown): Map<number, BundleReferenceImage[]> {
  const byKey = new Map<number, BundleReferenceImage[]>();
  if (!Array.isArray(input)) return byKey;
  (input as Row[]).forEach((entry, i) => byKey.set(num(entry.key) ?? i, parseImages(entry.images)));
  return byKey;
}

function mergeImages(own: BundleReferenceImage[], inherited: BundleReferenceImage[]): BundleReferenceImage[] {
  const hasCanonical = own.some((image) => image.isCanonical);
  const extra = inherited
    .filter((image) => !own.some((o) => o.angleLabel === image.angleLabel && o.imageUrl === image.imageUrl))
    .map((image) => ({ ...image, isCanonical: image.isCanonical && !hasCanonical }));
  return [...own, ...extra];
}

function parseImages(input: unknown): BundleReferenceImage[] {
  if (!Array.isArray(input)) return [];
  return (input as Row[]).map((image) => ({
    angleLabel: str(image.angleLabel) ?? "",
    imageUrl: str(image.imageUrl),
    isCanonical: Boolean(image.isCanonical),
  }));
}

function parseShotRef(input: unknown): BundleShotRef | null {
  if (!input || typeof input !== "object") return null;
  const ref = input as Row;
  const sceneIndex = num(ref.sceneIndex);
  const shotIndex = num(ref.shotIndex);
  if (sceneIndex == null || shotIndex == null) return null;
  return { sceneIndex, shotIndex };
}

/**
 * Rebuilds a bundle as a brand-new story owned by `ownerId`. Inserts run
 * parent-first so every child has its new foreign key; there is no transaction
 * (PostgREST has no multi-statement one), so a failure part-way leaves a
 * partial story the user can delete — reported as an error rather than
 * silently retried.
 */
export async function importStoryBundle(
  db: Db,
  ownerId: string,
  bundle: StoryBundle,
  titleOverride?: string | null
): Promise<{ storyId: string } | { error: string; status: number }> {
  const source = bundle.story;

  const { data: story, error: storyErr } = await db
    .from("stories")
    .insert({
      owner_id: ownerId,
      title: titleOverride?.trim() || source.title,
      description: source.description,
      visual_style_id: source.visualStyleId,
      aspect_ratio: source.aspectRatio,
      region: source.region,
      motion_style_id: source.motionStyleId,
      format: source.format,
    })
    .select("id")
    .single();
  if (storyErr || !story) return { error: storyErr?.message ?? "Could not create the story.", status: 500 };
  const storyId = story.id as string;

  for (const chapter of source.chapters) {
    const { data: newChapter, error: chapterErr } = await db
      .from("chapters")
      .insert({
        story_id: storyId,
        index: chapter.index,
        title: chapter.title,
        script: chapter.script,
        status: chapter.status,
        aspect_ratio: chapter.aspectRatio,
        site_map: chapter.siteMap,
      })
      .select("id")
      .single();
    if (chapterErr || !newChapter) return { error: chapterErr?.message ?? "Could not create a chapter.", status: 500 };
    const chapterId = newChapter.id as string;

    if (chapter.assets.length) {
      const { data: insertedAssets, error: assetErr } = await db
        .from("chapter_assets")
        .insert(
          chapter.assets.map((asset) => ({
            chapter_id: chapterId,
            kind: asset.kind,
            name: asset.name,
            meta: asset.meta,
            space_kind: asset.spaceKind,
            real_prompt: asset.realPrompt,
            looks: asset.looks,
            is_group: asset.isGroup,
            match_status: asset.matchStatus,
          }))
        )
        .select("id");
      if (assetErr) return { error: assetErr.message, status: 500 };

      const assetImages = chapter.assets.flatMap((asset, i) =>
        asset.images.map((image) => ({
          chapter_asset_id: insertedAssets?.[i]?.id as string | undefined,
          angle_label: image.angleLabel,
          image_url: image.imageUrl,
          is_canonical: image.isCanonical,
        }))
      ).filter((row) => row.chapter_asset_id);
      if (assetImages.length) {
        const { error: imgErr } = await db.from("chapter_asset_images").insert(assetImages);
        if (imgErr) return { error: imgErr.message, status: 500 };
      }
    }

    const shotIdByRef = new Map<string, string>();
    for (const scene of chapter.scenes) {
      const { data: newScene, error: sceneErr } = await db
        .from("scenes")
        .insert({
          chapter_id: chapterId,
          index: scene.index,
          title: scene.title,
          slug: scene.slug,
          lighting: scene.lighting,
        })
        .select("id")
        .single();
      if (sceneErr || !newScene) return { error: sceneErr?.message ?? "Could not create a scene.", status: 500 };

      if (!scene.shots.length) continue;
      const { data: insertedShots, error: shotErr } = await db
        .from("shots")
        .insert(
          scene.shots.map((shot) => ({
            scene_id: newScene.id,
            index: shot.index,
            label: shot.label,
            beat: shot.beat,
            duration_s: shot.durationS,
            aspect: shot.aspect,
            camera: shot.camera,
            shot_scale: shot.shotScale,
            motion_mode: shot.motionMode,
            prompt: shot.prompt,
            prompt_override: shot.promptOverride,
            video_prompt: shot.videoPrompt,
            video_prompt_override: shot.videoPromptOverride,
            sound_prompt: shot.soundPrompt,
            sound_prompt_override: shot.soundPromptOverride,
            start_state: shot.startState,
            end_state: shot.endState,
            assets_used: shot.assetsUsed,
          }))
        )
        .select("id, index");
      if (shotErr) return { error: shotErr.message, status: 500 };
      for (const inserted of insertedShots ?? []) {
        shotIdByRef.set(`${scene.index}:${inserted.index}`, inserted.id as string);
      }
    }

    const voiceOverRows = chapter.voiceOvers.flatMap((segment) => {
      const startId = shotIdByRef.get(`${segment.startShot.sceneIndex}:${segment.startShot.shotIndex}`);
      const endId = shotIdByRef.get(`${segment.endShot.sceneIndex}:${segment.endShot.shotIndex}`);
      if (!startId || !endId) return [];
      return [
        {
          chapter_id: chapterId,
          source_index: segment.sourceIndex,
          text: segment.text,
          text_override: segment.textOverride,
          start_shot_id: startId,
          end_shot_id: endId,
        },
      ];
    });
    if (voiceOverRows.length) {
      const { error: voErr } = await db.from("voice_over_segments").insert(voiceOverRows);
      if (voErr) return { error: voErr.message, status: 500 };
    }
  }

  return { storyId };
}

/** `my-story-2026-09-16.storybook.json` — safe on every OS, sortable by date. */
export function storyBundleFileName(title: string, exportedAt: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "story";
  const date = exportedAt.slice(0, 10);
  return `${slug}-${date}.storybook.json`;
}
