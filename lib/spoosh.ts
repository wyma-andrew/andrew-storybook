"use client";

import { createClient, Spoosh } from "@spoosh/core";
import { create } from "@spoosh/react";
import { invalidationPlugin } from "@spoosh/plugin-invalidation";
import { cachePlugin } from "@spoosh/plugin-cache";
import { optimisticPlugin } from "@spoosh/plugin-optimistic";
import type { AdminUser, Story, StoryListItem, Chapter, BibleEntry, ChapterAsset, ReferenceImage, ChapterImage, Scene, Shot, VoiceOverSegment, Me, MovieRecapLogoTemplate, MovieRecapProject, MovieRecapProjectPatch, MovieRecapRenderLog } from "@/lib/api/types";
import type { CoverageMode } from "@/lib/constants/coverage-modes";
import type { UserFeatures } from "@/lib/constants/features";
import type { StoryBundle } from "@/lib/story-transfer";
import type { MovieRecapSceneTimingPlan } from "@/lib/movie-recap-scene-plan";

export type ApiSchema = {
  "labs/voice/health": {
    GET: {
      data: {
        configured: boolean;
        reachable: boolean;
        model?: string;
        device?: string;
        loaded?: boolean;
        message: string;
      };
    };
  };
  "labs/voice/generate": {
    POST: {
      data: {
        audioBase64: string;
        contentType: "audio/wav";
        durationSeconds: number;
        sampleRate: number;
        generationMs: number;
        // Which service spoke this clip — the lab offers voices from more than
        // one provider so they can be compared.
        providerId: string;
      };
      body: {
        text: string;
        voiceId: string;
      };
    };
  };
  "voices/preview": {
    POST: {
      data: { audioBase64: string; contentType: "audio/wav"; cached: boolean };
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
      };
    };
  };
  "movie-recaps/:id/source/multipart/part": {
    POST: { data: { uploadUrl: string }; body: { partNumber: number } };
  };
  "movie-recaps/:id/source/multipart/complete": {
    POST: { data: MovieRecapProject; body: { parts: { partNumber: number; etag: string }[] } };
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
  // Reads the source's dialogue and translates it — the wizard's Transcript
  // step. Synchronous like the render: the request stays open for the whole
  // run, and the browser polls the project row for its stage meanwhile.
  // storyOnly: redo just the Burmese retelling from the stored transcript.
  "movie-recaps/:id/transcript": {
    POST: { data: MovieRecapProject; body: { storyOnly?: boolean } };
  };
  "movie-recaps/:id/transcript/cancel": {
    POST: { data: { cancelled: boolean } };
  };
  // Builds and MEASURES the script without cutting anything: reads the source,
  // divides the story across the film's own scenes, and speaks every beat so an
  // overrun is a number the user can act on. Synchronous like the render, with
  // the browser polling the project row for its stage.
  "movie-recaps/:id/script": {
    POST: { data: MovieRecapProject };
  };
  // Speaks and measures every beat again as they stand — the beats are read, the
  // transcript is not. Answers "does each line still fit its footage" without
  // moving a shot or a word.
  "movie-recaps/:id/script/recheck": {
    POST: { data: MovieRecapProject };
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
    // localStorage. Null when the render failed.
    POST: {
      data: MovieRecapProject & { renderLog: MovieRecapRenderLog | null };
      body: { mock?: boolean };
    };
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
  "stories/:id/bible": {
    GET: { data: BibleEntry[] };
  };
  "stories/:id/chapters": {
    GET: { data: Chapter[] };
    POST: { data: Chapter; body: { title?: string } };
  };
  "bible-entries/:id": {
    PATCH: { data: BibleEntry; body: Partial<{ realPrompt: string; locked: boolean; name: string; meta: string }> };
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
    PATCH: { data: ChapterAsset; body: Partial<{ realPrompt: string; name: string; meta: string }> };
    DELETE: { data: null };
  };
  "chapter-assets/:id/promote": {
    POST: { data: ChapterAsset };
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
  "chapter-asset-images/:id/promote": {
    POST: { data: ReferenceImage };
  };
  "bible-entry-images/:id": {
    PATCH: { data: ReferenceImage; body: Partial<{ angleLabel: string; imageUrl: string | null; isCanonical: boolean }> };
    DELETE: { data: null };
  };
  "shots/:id": {
    // null on a field clears the edit and restores the generated prompt
    PATCH: {
      data: Shot;
      body: Partial<{ prompt: string | null; videoPrompt: string | null; motionMode: Shot["motionMode"] }>;
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
