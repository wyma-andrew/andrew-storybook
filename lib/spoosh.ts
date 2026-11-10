"use client";

import { createClient, Spoosh } from "@spoosh/core";
import { create } from "@spoosh/react";
import { invalidationPlugin } from "@spoosh/plugin-invalidation";
import { cachePlugin } from "@spoosh/plugin-cache";
import { optimisticPlugin } from "@spoosh/plugin-optimistic";
import type { AdminUser, Story, StoryListItem, Chapter, ChapterAsset, ReferenceImage, ChapterImage, Scene, Shot, VoiceOverSegment, Me, MovieRecapLogoTemplate, MovieRecapProgress, MovieRecapProject, MovieRecapProjectPatch, MovieRecapRenderLog, MovieRecapRangeRender, MovieRecapSocialPost } from "@/lib/api/types";
import type { CoverageMode } from "@/lib/constants/coverage-modes";
import type { CharacterLook } from "@/lib/character-looks";
import type { UserFeatures } from "@/lib/constants/features";
import type { StoryBundle } from "@/lib/story-transfer";
import type { MovieRecapSceneTimingPlan } from "@/lib/movie-recap-scene-plan";
import type { VoiceLabItem, VoiceLabProject } from "@/lib/voice-lab";
import type { PromptLabPreview, PromptLabRun, PromptLabRunBody, PromptLabRunSummary, PromptLabSceneRunBody, PromptLabVersion, PromptLabVersionBody } from "@/lib/prompt-lab";
import type { TranslateProgress, TranslateProject, TranslateProjectListItem, TranslateProjectPatch } from "@/lib/translate";
import type { TranscriptProgress, TranscriptProject, TranscriptProjectListItem } from "@/lib/transcript-project";

export type ApiSchema = {
  "transcript-projects": {
    GET: { data: TranscriptProjectListItem[] };
    POST: { data: TranscriptProject; body: {
      fileName: string; contentType: string; sizeBytes: number; durationSeconds: number;
      width: number; height: number; lastModified: number;
    } };
  };
  "transcript-projects/:id": {
    GET: { data: TranscriptProject };
    DELETE: { data: null };
  };
  "transcript-projects/:id/progress": {
    GET: { data: TranscriptProgress };
  };
  "transcript-projects/:id/cover": {
    POST: { data: TranscriptProject; body: { sourceObjectKey: string; imageBase64: string } };
  };
  "transcript-projects/:id/source/multipart": {
    GET: { data: { parts: { partNumber: number; etag: string; size: number }[] } };
    POST: { data: TranscriptProject };
  };
  "transcript-projects/:id/source/multipart/part": {
    POST: { data: { uploadUrl: string }; body: { partNumber: number } };
  };
  "transcript-projects/:id/source/multipart/complete": {
    POST: { data: TranscriptProject; body: { parts: { partNumber: number; etag: string }[] } };
  };
  "transcript-projects/:id/transcribe": { POST: { data: TranscriptProject } };
  "translate-projects": {
    GET: { data: TranslateProjectListItem[] };
    POST: { data: TranslateProject; body: {
      fileName: string; contentType: string; sizeBytes: number; durationSeconds: number;
      width: number; height: number; lastModified: number;
    } };
  };
  "translate-projects/:id": {
    GET: { data: TranslateProject };
    PATCH: { data: TranslateProject; body: TranslateProjectPatch };
    DELETE: { data: null };
  };
  "translate-projects/:id/progress": {
    GET: { data: TranslateProgress };
  };
  "translate-projects/:id/cover": {
    POST: { data: TranslateProject; body: { sourceObjectKey: string; imageBase64: string } };
  };
  "translate-projects/:id/source/multipart": {
    GET: { data: { parts: { partNumber: number; etag: string; size: number }[] } };
    POST: { data: TranslateProject };
  };
  "translate-projects/:id/source/multipart/part": {
    POST: { data: { uploadUrl: string }; body: { partNumber: number } };
  };
  "translate-projects/:id/source/multipart/complete": {
    POST: { data: TranslateProject; body: { parts: { partNumber: number; etag: string }[] } };
  };
  "translate-projects/:id/source/replacement": {
    GET: { data: { parts: { partNumber: number; etag: string; size: number }[] } };
    POST: { data: TranslateProject; body: {
      fileName: string; contentType: string; sizeBytes: number; durationSeconds: number;
      width: number; height: number; lastModified: number;
    } };
  };
  "translate-projects/:id/source/replacement/part": {
    POST: { data: { uploadUrl: string }; body: { partNumber: number } };
  };
  "translate-projects/:id/source/replacement/complete": {
    POST: { data: TranslateProject; body: { parts: { partNumber: number; etag: string }[] } };
  };
  "translate-projects/:id/render": {
    POST: { data: TranslateProject; body: { start?: number; end?: number } };
  };
  "translate-projects/:id/align": {
    POST: { data: TranslateProject };
  };
  "translate-projects/:id/generate": {
    POST: { data: TranslateProject };
  };
  "translate-projects/:id/render/download": {
    GET: { data: { url: string } };
  };
  "labs/voice/projects": {
    GET: { data: VoiceLabProject[] };
    POST: { data: VoiceLabProject; body: { name: string } };
  };
  "labs/voice/projects/:id": {
    GET: { data: VoiceLabProject };
    PATCH: { data: VoiceLabProject; body: { name?: string; voiceId?: string } };
    DELETE: { data: null };
  };
  "labs/voice/projects/:id/items": {
    GET: { data: VoiceLabItem[] };
    POST: { data: VoiceLabItem[]; body: { script: string } };
    PATCH: { data: null; body: { order: string[] } };
    DELETE: { data: null };
  };
  "labs/voice/items/:id": {
    PATCH: { data: VoiceLabItem; body: { text?: string; resetAudio?: boolean } };
    DELETE: { data: null };
  };
  "labs/prompt/chapters/:id/preview/:pass": {
    GET: { data: PromptLabPreview };
  };
  "labs/prompt/runs/:id/storyboard-preview": {
    GET: { data: PromptLabPreview };
  };
  "labs/prompt/chapters/:id/runs": {
    GET: { data: PromptLabRunSummary[] };
  };
  "labs/prompt/passes/:pass/versions": {
    GET: { data: PromptLabVersion[] };
    POST: { data: PromptLabVersion; body: Omit<PromptLabVersionBody, "pass"> };
  };
  "labs/prompt/versions/:id": {
    PATCH: { data: PromptLabVersion; body: Partial<Pick<PromptLabVersionBody, "name" | "overrides" | "motionOverrides">> };
    DELETE: { data: null };
  };
  "labs/prompt/runs": {
    POST: { data: PromptLabRun; body: PromptLabRunBody };
  };
  "labs/prompt/runs/:id": {
    GET: { data: PromptLabRun };
    DELETE: { data: null };
  };
  "labs/prompt/runs/:id/scenes/:index": {
    POST: { data: PromptLabRun; body: PromptLabSceneRunBody };
  };
  "labs/voice/generate": {
    POST: { data: VoiceLabItem[]; body: { projectId: string; voiceId: string; itemIds?: string[] } };
  };
  "voices/preview": {
    GET: { data: Record<string, string | null> };
    POST: {
      data: { url: string; cached: boolean };
      body: { voiceId: string };
    };
  };
  "movie-recaps": {
    GET: { data: MovieRecapProject[] };
    POST: {
      data: MovieRecapProject;
      body: {
        // Source pixel dimensions, read from the file in the browser. Optional:
        // a file whose metadata cannot be read still uploads.
        width?: number;
        height?: number;
        fileName: string;
        contentType: string;
        sizeBytes: number;
        durationSeconds: number;
        lastModified: number;
      };
    };
  };
  "movie-recaps/:id": {
    GET: { data: MovieRecapProject };
    PATCH: {
      data: MovieRecapProject;
      body: MovieRecapProjectPatch;
    };
    DELETE: { data: null };
  };
  "movie-recaps/:id/progress": {
    GET: { data: MovieRecapProgress };
  };
  "movie-recaps/:id/source/multipart": {
    GET: { data: { parts: { partNumber: number; etag: string; size: number }[] } };
    POST: { data: MovieRecapProject };
    DELETE: { data: null };
  };
  "movie-recaps/:id/source/replace": {
    POST: {
      data: MovieRecapProject;
      body: {
        fileName: string;
        contentType: string;
        sizeBytes: number;
        durationSeconds: number;
        width?: number;
        height?: number;
        lastModified: number;
        // "same" keeps the narrative script for a better-quality copy of the
        // same video; anything else clears it.
        mode: "same" | "different";
      };
    };
  };
  "movie-recaps/:id/source/multipart/part": {
    POST: { data: { uploadUrl: string }; body: { partNumber: number } };
  };
  "movie-recaps/:id/source/multipart/complete": {
    POST: { data: MovieRecapProject; body: { parts: { partNumber: number; etag: string }[] } };
  };
  "movie-recaps/:id/cover": {
    POST: { data: MovieRecapProject; body: { sourceObjectKey: string; imageBase64: string } };
  };
  "movie-recaps/:id/logo/presign": {
    POST: {
      data: { fileName: string; objectKey: string; contentType: string; url: string; uploadUrl: string };
      body: { fileName: string; contentType: string; sizeBytes: number };
    };
  };
  "movie-recaps/:id/logo": {
    POST: {
      data: MovieRecapProject;
      body: { fileName: string; objectKey: string; url: string; contentType: string; sizeBytes: number };
    };
    DELETE: { data: MovieRecapProject };
  };
  "movie-recap-logo-templates": {
    GET: { data: MovieRecapLogoTemplate[] };
    POST: { data: MovieRecapLogoTemplate; body: { projectId: string; name: string; logoWatermarkText?: string | null } };
  };
  "movie-recap-logo-templates/:id": {
    POST: { data: MovieRecapProject; body: { projectId: string } };
    PATCH: { data: MovieRecapLogoTemplate; body: { projectId?: string; name?: string; logoWatermarkText?: string | null; replaceLogo?: boolean } };
    DELETE: { data: null };
  };
  // The Transcript step's Auto mode: reads the source's dialogue and describes
  // its scenes into `transcriptText`. Synchronous like the render: the request
  // stays open for the whole run, and the browser polls the project row for its
  // stage meanwhile. storyOnly: redo the parked Burmese retelling instead.
  "movie-recaps/:id/transcript": {
    POST: { data: MovieRecapProject; body: { storyOnly?: boolean; dialogueOnly?: boolean } };
  };
  "movie-recaps/:id/transcript/cancel": {
    POST: { data: { cancelled: boolean } };
  };
  // Builds and MEASURES the script without cutting anything: reads the source,
  // divides the story across the film's own scenes, and speaks every beat so an
  // overrun is a number the user can act on. Synchronous like the render, with
  // the browser polling the project row for its stage.
  "movie-recaps/:id/script": {
    POST: { data: MovieRecapProject; body?: { revoice?: boolean } };
  };
  "movie-recaps/:id/script/cancel": {
    POST: { data: MovieRecapProject };
  };
  // Rebuilds ONE edited beat: writes its text, replaces its audio and timing,
  // and rebuilds the combined narration master from cached neighbours. The
  // legacy `measure: false` path remains server-compatible but has no UI action.
  "movie-recaps/:id/script/beat": {
    POST: { data: MovieRecapProject; body: { index: number; text: string; measure?: boolean } };
  };
  "movie-recaps/:id/script/beat/preview": {
    POST: {
      data: { audioBase64: string; contentType: "audio/wav"; durationSeconds: number; cached: boolean };
      body: { index: number };
    };
  };
  // Writes SEVERAL edited beats back in one go — the paste half of the copyable
  // prompt. Never speaks them: changed beats are marked stale and must each be
  // rebuilt from the Narrative Script panel.
  "movie-recaps/:id/script/beats": {
    POST: {
      data: MovieRecapProject & { changed: number };
      body: { edits: { index: number; text: string }[] };
    };
  };
  "movie-recaps/:id/script/scene-plan": {
    POST: { data: { plan: MovieRecapSceneTimingPlan; measured: boolean } };
  };
  "movie-recaps/:id/render": {
    // mock: skip the paid AI steps and render canned narration instead — for
    // iterating on overlay/subtitle design.
    // `renderLog` is how every shot actually came out. It rides on the response
    // instead of being stored: the browser keeps a per-project history of it in
    // localStorage. Null when the render failed — and when it was queued on
    // GitHub Actions (renderStatus comes back "running"; poll the row).
    POST: {
      data: MovieRecapProject & { renderLog: MovieRecapRenderLog | null };
      body: { mock?: boolean };
    };
  };
  "movie-recaps/:id/render/ranges": {
    GET: { data: MovieRecapRangeRender[] };
    POST: {
      // `queued`: handed to GitHub Actions; the range row is still "running".
      data: { project: MovieRecapProject; range: MovieRecapRangeRender; renderLog: MovieRecapRenderLog | null; queued?: boolean };
      body: { startBeat: number; endBeat: number };
    };
  };
  "movie-recaps/:id/render/ranges/:rangeId": {
    DELETE: { data: null };
  };
  "movie-recaps/:id/render/ranges/:rangeId/download": {
    GET: { data: { url: string } };
  };
  "movie-recaps/:id/render/download": {
    GET: { data: { url: string } };
  };
  "facebook/page": {
    GET: { data: { name: string; pictureUrl: string | null } };
  };
  "movie-recaps/:id/facebook": {
    POST: { data: MovieRecapSocialPost; body: { description: string; publishAt: string } };
  };
  "movie-recaps/:id/social-posts": {
    GET: { data: MovieRecapSocialPost[] };
  };
  "movie-recap-social-posts/:id": {
    PATCH: { data: MovieRecapSocialPost; body: { description?: string; publishAt?: string } };
    DELETE: { data: MovieRecapSocialPost };
  };
  "movie-recaps/:id/render/cancel": {
    POST: { data: { cancelled: boolean } };
  };
  "auth/me": {
    GET: { data: Me };
  };
  "auth/sign-up": {
    POST: { data: { email: string; needsEmailConfirmation: boolean }; body: { email: string; password: string } };
  };
  "auth/sign-in": {
    POST: { data: { email: string }; body: { email: string; password: string } };
  };
  "auth/sign-out": {
    POST: { data: null };
  };
  "auth/password": {
    PATCH: { data: null; body: { password: string } };
  };
  "admin/users": {
    GET: { data: AdminUser[] };
    POST: { data: AdminUser; body: { email: string; password: string; isAdmin?: boolean; features?: Partial<UserFeatures> } };
  };
  "admin/users/:id": {
    PATCH: { data: AdminUser; body: { isAdmin?: boolean; features?: Partial<UserFeatures> } };
    DELETE: { data: null };
  };
  "stories": {
    GET: { data: StoryListItem[] };
    POST: { data: Story; body: { title: string; description?: string; visualStyleId?: string | null } };
  };
  "stories/:id": {
    GET: { data: Story & { chapters: Chapter[] } };
    PATCH: {
      data: Story;
      body: Partial<{
        title: string;
        description: string;
        visualStyleId: string | null;
        aspectRatio: string;
        region: Story["region"];
        motionStyleId: string;
        format: Story["format"];
      }>;
    };
    DELETE: { data: null };
  };
  // Portable story transfer between accounts: the export is read as JSON and
  // saved to a file by the browser; the import posts a parsed file back.
  "stories/:id/export": {
    GET: { data: StoryBundle };
  };
  "stories/import": {
    POST: { data: Story; body: { bundle: StoryBundle; title?: string } };
  };
  "stories/trash": {
    GET: { data: StoryListItem[] };
  };
  "stories/:id/restore": {
    POST: { data: Story };
  };
  "stories/:id/permanent": {
    DELETE: { data: null };
  };
  "stories/:id/chapters": {
    GET: { data: Chapter[] };
    POST: { data: Chapter; body: { title?: string } };
  };
  "chapters/:id": {
    GET: { data: Chapter };
    PATCH: {
      data: Chapter;
      body: Partial<{
        title: string;
        script: unknown;
        status: Chapter["status"];
        aspectRatio: string | null;
      }>;
    };
    DELETE: { data: null };
  };
  "chapters/:id/duplicate": {
    POST: { data: Chapter };
  };
  "chapters/:id/assets": {
    GET: { data: ChapterAsset[] };
  };
  "chapters/:id/analyze": {
    POST: { data: ChapterAsset[] };
  };
  "chapters/:id/sync": {
    POST: { data: ChapterAsset[] };
  };
  "chapter-assets/:id": {
    PATCH: { data: ChapterAsset; body: Partial<{ realPrompt: string; looks: CharacterLook[]; name: string; meta: string }> };
    DELETE: { data: null };
  };
  "chapter-assets/:id/regenerate": {
    POST: { data: ChapterAsset };
  };
  "chapter-assets/:id/images": {
    POST: { data: ReferenceImage; body: { angleLabel: string; imageUrl?: string | null; isCanonical?: boolean } };
  };
  "chapter-asset-images/:id": {
    PATCH: { data: ReferenceImage; body: Partial<{ angleLabel: string; imageUrl: string | null; isCanonical: boolean }> };
    DELETE: { data: null };
  };
  "shots/:id": {
    // null on a field clears the edit and restores the generated prompt
    PATCH: {
      data: Shot;
      body: Partial<{
        prompt: string | null;
        videoPrompt: string | null;
        soundPrompt: string | null;
        motionMode: Shot["motionMode"];
      }>;
    };
  };
  "chapters/:id/storyboard": {
    GET: { data: Scene[] };
  };
  // Uploaded renders for a chapter. POST records rows for objects the browser
  // has already PUT to R2 — the bytes never pass through this API, so there is
  // no body-size limit to work around.
  "chapters/:id/images": {
    GET: { data: ChapterImage[] };
    POST: {
      data: ChapterImage[];
      body: {
        images: { fileName: string; objectKey: string; url: string; contentType: string; sizeBytes: number }[];
        // At most one. Omitted from a gallery upload, which starts unused.
        chapterAssetId?: string | null;
        shotId?: string | null;
        // Which look of the linked character this render is the sheet for.
        lookKey?: string | null;
        // Which site-map camera station of the linked location this render is the plate for.
        stationKey?: string | null;
      };
    };
  };
  "chapters/:id/images/presign": {
    POST: {
      data: { fileName: string; objectKey: string; contentType: string; url: string; uploadUrl: string }[];
      body: { files: { fileName: string; contentType: string }[] };
    };
  };
  "chapter-images/:id": {
    // Renames the display name only; the R2 object key never changes.
    PATCH: { data: ChapterImage; body: { fileName: string } };
    DELETE: { data: null };
  };
  "chapters/:id/voice-overs": {
    GET: { data: VoiceOverSegment[] };
  };
  "voice-overs/:id": {
    PATCH: {
      data: VoiceOverSegment;
      body: Partial<{ text: string | null; startShotId: string; endShotId: string }>;
    };
  };
  "chapters/:id/storyboard/generate": {
    POST: { data: Scene[] };
  };
  // Re-shoots one scene and returns the chapter's full scene list, because
  // narration ranges are remapped chapter-wide by the same request.
  "scenes/:id/regenerate": {
    POST: { data: Scene[]; body: { coverageMode: CoverageMode } };
  };
};

// Caching + auto-invalidation are NOT built into @spoosh/core itself — they
// ship as separate plugin packages (@spoosh/plugin-cache,
// @spoosh/plugin-invalidation) and must be registered here, or mutations
// never refresh other components' reads of the same resource.
const spoosh = new Spoosh<ApiSchema, { error: string }>("/api").use([
  cachePlugin(),
  invalidationPlugin(),
  optimisticPlugin(),
]);

export const { useRead, useWrite, usePages, useQueue, useSubscription } = create(spoosh);
export const apiClient = createClient<ApiSchema, { error: string }>("/api");
