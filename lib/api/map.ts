import type {
  Story,
  Chapter,
  BibleEntry,
  ChapterAsset,
  ReferenceImage,
  SpaceKind,
  Scene,
  Shot,
  VoiceOverSegment,
} from "./types";
import type { ResolvedVisualStyle } from "@/lib/visual-styles";
import { DEFAULT_ASPECT_RATIO } from "@/lib/constants/aspect-ratios";
import { DEFAULT_REGION, isRegion } from "@/lib/constants/regions";
import { DEFAULT_MOTION_STYLE_ID, isMotionMode } from "@/lib/constants/motion-styles";
import { isShotScale } from "@/lib/constants/shot-scales";

type Row = Record<string, unknown>;

export function mapStory(r: Row, style?: ResolvedVisualStyle | null): Story {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    visualStyleId: (r.visual_style_id as string) ?? null,
    visualStyleName: style?.name ?? null,
    aspectRatio: (r.aspect_ratio as string) ?? DEFAULT_ASPECT_RATIO,
    motionStyleId: (r.motion_style_id as string) ?? DEFAULT_MOTION_STYLE_ID,
    region: isRegion(r.region) ? r.region : DEFAULT_REGION,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: (r.deleted_at as string) ?? null,
  };
}

export function mapChapter(r: Row): Chapter {
  return {
    id: r.id as string,
    storyId: r.story_id as string,
    index: r.index as number,
    title: r.title as string,
    status: r.status as Chapter["status"],
    script: r.script ?? null,
    aspectRatio: (r.aspect_ratio as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapReferenceImage(r: Row): ReferenceImage {
  return {
    id: r.id as string,
    angleLabel: r.angle_label as string,
    imageUrl: (r.image_url as string) ?? null,
    isCanonical: r.is_canonical as boolean,
  };
}

export function mapBibleEntry(r: Row): BibleEntry {
  return {
    id: r.id as string,
    storyId: r.story_id as string,
    kind: r.kind as BibleEntry["kind"],
    name: r.name as string,
    meta: (r.meta as string) ?? null,
    spaceKind: (r.space_kind as SpaceKind) ?? null,
    realPrompt: r.real_prompt as string,
    seed: (r.seed as string) ?? null,
    locked: r.locked as boolean,
    images: ((r.bible_entry_images as Row[]) ?? []).map(mapReferenceImage),
  };
}

export function mapChapterAsset(r: Row): ChapterAsset {
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    kind: r.kind as ChapterAsset["kind"],
    bibleEntryId: (r.bible_entry_id as string) ?? null,
    name: r.name as string,
    meta: (r.meta as string) ?? null,
    spaceKind: (r.space_kind as SpaceKind) ?? null,
    realPrompt: r.real_prompt as string,
    matchStatus: r.match_status as ChapterAsset["matchStatus"],
    images: ((r.chapter_asset_images as Row[]) ?? []).map(mapReferenceImage),
  };
}

export function mapShot(r: Row): Shot {
  return {
    id: r.id as string,
    sceneId: r.scene_id as string,
    index: r.index as number,
    label: (r.label as string) ?? null,
    beat: (r.beat as string) ?? null,
    durationS: (r.duration_s as number) ?? null,
    aspect: (r.aspect as string) ?? null,
    camera: (r.camera as string) ?? null,
    shotScale: isShotScale(r.shot_scale) ? r.shot_scale : null,
    motionMode: isMotionMode(r.motion_mode) ? r.motion_mode : null,
    prompt: (r.prompt_override as string) ?? (r.prompt as string),
    videoPrompt: (r.video_prompt_override as string) ?? (r.video_prompt as string) ?? null,
    promptEdited: r.prompt_override != null,
    videoPromptEdited: r.video_prompt_override != null,
    startState: (r.start_state as string) ?? null,
    endState: (r.end_state as string) ?? null,
    assetsUsed: (r.assets_used as Shot["assetsUsed"]) ?? [],
  };
}

export function mapScene(r: Row): Scene {
  const shots = (r.shots as Row[]) ?? [];
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    index: r.index as number,
    title: (r.title as string) ?? null,
    slug: (r.slug as string) ?? null,
    lighting: (r.lighting as string) ?? null,
    shots: shots.map(mapShot).sort((a, b) => a.index - b.index),
  };
}

export function mapVoiceOverSegment(r: Row): VoiceOverSegment {
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    sourceIndex: r.source_index as number,
    text: (r.text_override as string) ?? (r.text as string),
    textEdited: r.text_override != null,
    startShotId: r.start_shot_id as string,
    endShotId: r.end_shot_id as string,
  };
}
