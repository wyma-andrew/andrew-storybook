import type {
  Story,
  Chapter,
  BibleEntry,
  ChapterAsset,
  ReferenceImage,
  ChapterImage,
  SpaceKind,
  Scene,
  Shot,
  VoiceOverSegment,
  MovieRecapProject,
} from "./types";
import type { ResolvedVisualStyle } from "@/lib/visual-styles";
import { DEFAULT_ASPECT_RATIO } from "@/lib/constants/aspect-ratios";
import { DEFAULT_REGION, isRegion } from "@/lib/constants/regions";
import { DEFAULT_MOTION_STYLE_ID, isMotionMode } from "@/lib/constants/motion-styles";
import { isShotScale } from "@/lib/constants/shot-scales";

type Row = Record<string, unknown>;

export function mapMovieRecapProject(r: Row): MovieRecapProject {
  return {
    id: r.id as string,
    name: r.name as string,
    outputLanguage: r.output_language as MovieRecapProject["outputLanguage"],
    voiceProfileId: r.voice_profile_id as MovieRecapProject["voiceProfileId"],
    sourceFileName: r.source_file_name as string,
    sourceObjectKey: r.source_object_key as string,
    sourceUrl: (r.source_url as string) ?? null,
    sourceContentType: r.source_content_type as string,
    sourceSizeBytes: Number(r.source_size_bytes),
    sourceDurationSeconds: Number(r.source_duration_seconds),
    sourceLastModified: Number(r.source_last_modified),
    sourceUploadStatus: r.source_upload_status as MovieRecapProject["sourceUploadStatus"],
    aspectRatio: r.aspect_ratio as MovieRecapProject["aspectRatio"],
    subtitleMode: r.subtitle_mode as MovieRecapProject["subtitleMode"],
    logoEnabled: r.logo_enabled as boolean,
    logoFileName: (r.logo_file_name as string) ?? null,
    logoObjectKey: (r.logo_object_key as string) ?? null,
    logoUrl: (r.logo_url as string) ?? null,
    logoContentType: (r.logo_content_type as string) ?? null,
    logoSizeBytes: r.logo_size_bytes == null ? null : Number(r.logo_size_bytes),
    logoPlacement: r.logo_placement as MovieRecapProject["logoPlacement"],
    logoOpacity: Number(r.logo_opacity),
    blurEnabled: r.blur_enabled as boolean,
    blurX: Number(r.blur_x),
    blurY: Number(r.blur_y),
    blurWidth: Number(r.blur_width),
    blurHeight: Number(r.blur_height),
    copyrightFree: r.copyright_free as boolean,
    currentStep: Number(r.current_step) as MovieRecapProject["currentStep"],
    status: r.status as MovieRecapProject["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

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

export function mapChapterImage(r: Row): ChapterImage {
  // The embedded rows are present only when the caller asked for them; a plain
  // select (the insert and patch handlers) leaves the label null, which is
  // correct — those responses are re-read through the list endpoint anyway.
  const asset = r.chapter_assets as Row | null;
  const shot = r.shots as Row | null;
  const scene = (shot?.scenes as Row | null) ?? null;
  const linkedLabel = asset
    ? (asset.name as string)
    : shot && scene
      ? `${scene.index}.${shot.index}`
      : null;

  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    fileName: r.file_name as string,
    objectKey: r.object_key as string,
    url: r.url as string,
    contentType: r.content_type as string,
    sizeBytes: (r.size_bytes as number) ?? null,
    createdAt: r.created_at as string,
    chapterAssetId: (r.chapter_asset_id as string) ?? null,
    shotId: (r.shot_id as string) ?? null,
    linkedLabel,
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
