import { parseSiteMap } from "@/lib/site-map";
import { findLook, parseLooks } from "@/lib/character-looks";
import type {
  Story,
  Chapter,
  ChapterAsset,
  ReferenceImage,
  ChapterImage,
  SpaceKind,
  Scene,
  Shot,
  VoiceOverSegment,
  MovieRecapProgress,
  MovieRecapProject,
  MovieRecapEpisode,
  MovieRecapSocialPost,
} from "./types";
import type { ResolvedVisualStyle } from "@/lib/visual-styles";
import { DEFAULT_ASPECT_RATIO } from "@/lib/constants/aspect-ratios";
import { DEFAULT_REGION, isRegion } from "@/lib/constants/regions";
import { DEFAULT_MOTION_STYLE_ID, isMotionMode } from "@/lib/constants/motion-styles";
import { isShotScale } from "@/lib/constants/shot-scales";
import { resolveStoryFormat } from "@/lib/constants/story-formats";
import { normalizeMovieRecapNarrationManifest } from "../movie-recap-manifest";

type Row = Record<string, unknown>;

export function mapMovieRecapSocialPost(r: Row): MovieRecapSocialPost {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    platform: r.platform as MovieRecapSocialPost["platform"],
    kind: r.kind as MovieRecapSocialPost["kind"],
    externalId: r.external_id as string,
    description: (r.description as string) ?? "",
    publishAt: r.publish_at as string,
    status: r.status as MovieRecapSocialPost["status"],
    permalinkUrl: (r.permalink_url as string) ?? null,
    error: (r.error as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export function mapMovieRecapEpisode(r: Row): MovieRecapEpisode {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    startBeat: Number(r.start_beat),
    endBeat: Number(r.end_beat),
    renderScript: normalizeMovieRecapNarrationManifest((r.render_script as MovieRecapEpisode["renderScript"]) ?? null),
    scriptStatus: r.script_status as MovieRecapEpisode["scriptStatus"],
    scriptError: (r.script_error as string) ?? null,
    renderStatus: r.render_status as MovieRecapEpisode["renderStatus"],
    renderError: (r.render_error as string) ?? null,
    renderWarning: (r.render_warning as string) ?? null,
    outputUrl: (r.output_url as string) ?? null,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    renderedAt: (r.rendered_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapMovieRecapProject(r: Row): MovieRecapProject {
  return {
    id: r.id as string,
    name: r.name as string,
    outputLanguage: r.output_language as MovieRecapProject["outputLanguage"],
    voiceProfileId: r.voice_profile_id as MovieRecapProject["voiceProfileId"],
    sourceFileName: r.source_file_name as string,
    sourceObjectKey: r.source_object_key as string,
    sourceUrl: (r.source_url as string) ?? null,
    coverUrl: (r.cover_url as string) ?? null,
    sourceContentType: r.source_content_type as string,
    sourceSizeBytes: Number(r.source_size_bytes),
    sourceDurationSeconds: Number(r.source_duration_seconds),
    sourceWidth: r.source_width === null || r.source_width === undefined ? null : Number(r.source_width),
    sourceHeight: r.source_height === null || r.source_height === undefined ? null : Number(r.source_height),
    sourceLastModified: Number(r.source_last_modified),
    sourceUploadStatus: r.source_upload_status as MovieRecapProject["sourceUploadStatus"],
    aspectRatio: r.aspect_ratio as MovieRecapProject["aspectRatio"],
    fitMode: r.fit_mode as MovieRecapProject["fitMode"],
    dynamicBackgroundBlurEnabled: r.dynamic_background_blur_enabled === undefined ? false : Boolean(r.dynamic_background_blur_enabled),
    mirrorEnabled: r.mirror_enabled === undefined ? true : Boolean(r.mirror_enabled),
    copyrightZoom: r.copyright_zoom === null || r.copyright_zoom === undefined ? null : Number(r.copyright_zoom),
    subtitlePreset: r.subtitle_preset as MovieRecapProject["subtitlePreset"],
    subtitleSize: r.subtitle_size == null ? null : Number(r.subtitle_size),
    recapShare: r.recap_share == null ? null : Number(r.recap_share),
    subtitlesEnabled: r.subtitles_enabled === undefined ? true : Boolean(r.subtitles_enabled),
    subtitlePosition: r.subtitle_position as MovieRecapProject["subtitlePosition"],
    subtitleOffset: Number(r.subtitle_offset),
    hookTitle: (r.hook_title as string) ?? null,
    hookTitlePosition: (r.hook_title_position as MovieRecapProject["hookTitlePosition"]) ?? "bottom",
    hookTitleOffset: r.hook_title_offset == null ? 8 : Number(r.hook_title_offset),
    logoEnabled: r.logo_enabled as boolean,
    logoFileName: (r.logo_file_name as string) ?? null,
    logoObjectKey: (r.logo_object_key as string) ?? null,
    logoUrl: (r.logo_url as string) ?? null,
    logoContentType: (r.logo_content_type as string) ?? null,
    logoSizeBytes: r.logo_size_bytes == null ? null : Number(r.logo_size_bytes),
    logoWatermarkText: (r.logo_watermark_text as string) ?? null,
    logoTemplateId: (r.logo_template_id as string) ?? null,
    logoPlacement: r.logo_placement as MovieRecapProject["logoPlacement"],
    logoOpacity: Number(r.logo_opacity),
    blurRegions: Array.isArray(r.blur_regions) ? (r.blur_regions as MovieRecapProject["blurRegions"]) : [],
    currentStep: Number(r.current_step) as MovieRecapProject["currentStep"],
    maxStep: Number(r.max_step) as MovieRecapProject["maxStep"],
    status: r.status as MovieRecapProject["status"],
    transcript: (r.transcript as MovieRecapProject["transcript"]) ?? null,
    transcriptText: (r.transcript_text as string) ?? null,
    transcriptScript: (r.transcript_script as string) ?? null,
    transcriptStory: (r.transcript_story as string) ?? null,
    transcriptSource: (r.transcript_source as MovieRecapProject["transcriptSource"]) ?? null,
    transcriptStatus: (r.transcript_status as MovieRecapProject["transcriptStatus"]) ?? "idle",
    transcriptStoryOnly: Boolean(r.transcript_story_only),
    transcriptDialogueOnly: Boolean(r.transcript_dialogue_only),
    transcriptStage: (r.transcript_stage as MovieRecapProject["transcriptStage"]) ?? null,
    transcriptProgressCurrent: r.transcript_progress_current == null ? null : Number(r.transcript_progress_current),
    transcriptProgressTotal: r.transcript_progress_total == null ? null : Number(r.transcript_progress_total),
    transcriptProgressPartial: r.transcript_progress_partial == null ? null : Number(r.transcript_progress_partial),
    transcriptError: (r.transcript_error as string) ?? null,
    renderStatus: r.render_status as MovieRecapProject["renderStatus"],
    renderIsMock: Boolean(r.render_is_mock),
    renderError: (r.render_error as string) ?? null,
    renderWarning: (r.render_warning as string) ?? null,
    renderStage: (r.render_stage as MovieRecapProject["renderStage"]) ?? null,
    renderProgressCurrent: r.render_progress_current == null ? null : Number(r.render_progress_current),
    renderProgressTotal: r.render_progress_total == null ? null : Number(r.render_progress_total),
    scriptStatus: (r.script_status as MovieRecapProject["scriptStatus"]) ?? "idle",
    scriptStage: (r.script_stage as MovieRecapProject["scriptStage"]) ?? null,
    scriptProgressCurrent: (r.script_progress_current as number | null) ?? null,
    scriptProgressTotal: (r.script_progress_total as number | null) ?? null,
    scriptError: (r.script_error as string | null) ?? null,
    scriptApproved: Boolean(r.script_approved),
    renderScript: normalizeMovieRecapNarrationManifest((r.render_script as MovieRecapProject["renderScript"]) ?? null),
    renderAnalysisKey: (r.render_analysis_key as string | null) ?? null,
    renderOutputUrl: (r.render_output_url as string) ?? null,
    renderAudioUrl: (r.render_audio_url as string) ?? null,
    renderAudioObjectKey: (r.render_audio_object_key as string) ?? null,
    renderFootageUrl: (r.render_footage_url as string) ?? null,
    renderStartedAt: (r.render_started_at as string) ?? null,
    renderCompletedAt: (r.render_completed_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapMovieRecapProgress(r: Row): MovieRecapProgress {
  return {
    renderStatus: r.render_status as MovieRecapProgress["renderStatus"],
    renderStage: (r.render_stage as MovieRecapProgress["renderStage"]) ?? null,
    renderProgressCurrent: r.render_progress_current == null ? null : Number(r.render_progress_current),
    renderProgressTotal: r.render_progress_total == null ? null : Number(r.render_progress_total),
    scriptStatus: (r.script_status as MovieRecapProgress["scriptStatus"]) ?? "idle",
    scriptStage: (r.script_stage as MovieRecapProgress["scriptStage"]) ?? null,
    scriptProgressCurrent: (r.script_progress_current as number | null) ?? null,
    scriptProgressTotal: (r.script_progress_total as number | null) ?? null,
    transcriptStatus: (r.transcript_status as MovieRecapProgress["transcriptStatus"]) ?? "idle",
    transcriptStage: (r.transcript_stage as MovieRecapProgress["transcriptStage"]) ?? null,
    transcriptProgressCurrent: r.transcript_progress_current == null ? null : Number(r.transcript_progress_current),
    transcriptProgressTotal: r.transcript_progress_total == null ? null : Number(r.transcript_progress_total),
    transcriptProgressPartial: r.transcript_progress_partial == null ? null : Number(r.transcript_progress_partial),
  };
}

export function mapMovieRecapLogoTemplate(r: Row) {
  return {
    id: r.id as string,
    name: r.name as string,
    logoFileName: r.logo_file_name as string,
    logoObjectKey: r.logo_object_key as string,
    logoUrl: r.logo_url as string,
    logoContentType: r.logo_content_type as string,
    logoSizeBytes: Number(r.logo_size_bytes),
    logoWatermarkText: (r.logo_watermark_text as string) ?? null,
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
    format: resolveStoryFormat(r.format),
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
    siteMap: parseSiteMap(r.site_map),
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
  const looks = asset ? parseLooks(asset.looks) : [];
  const look = looks.length ? findLook(looks, r.look_key as string | null) : null;
  const linkedLabel = asset
    ? look
      ? `${asset.name as string} · ${look.label}`
      : (asset.name as string)
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
    lookKey: (r.look_key as string) ?? null,
    stationKey: (r.station_key as string) ?? null,
    linkedLabel,
  };
}

export function mapChapterAsset(r: Row): ChapterAsset {
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    kind: r.kind as ChapterAsset["kind"],
    name: r.name as string,
    meta: (r.meta as string) ?? null,
    spaceKind: (r.space_kind as SpaceKind) ?? null,
    realPrompt: r.real_prompt as string,
    looks: parseLooks(r.looks),
    isGroup: Boolean(r.is_group),
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
    soundPrompt: (r.sound_prompt_override as string) ?? (r.sound_prompt as string) ?? null,
    soundPromptEdited: r.sound_prompt_override != null,
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
