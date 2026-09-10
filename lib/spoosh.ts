"use client";

import { Spoosh } from "@spoosh/core";
import { create } from "@spoosh/react";
import { invalidationPlugin } from "@spoosh/plugin-invalidation";
import { cachePlugin } from "@spoosh/plugin-cache";
import { optimisticPlugin } from "@spoosh/plugin-optimistic";
import type { Story, StoryListItem, Chapter, BibleEntry, ChapterAsset, ReferenceImage, Scene, Shot, VoiceOverSegment, Me } from "@/lib/api/types";

type ApiSchema = {
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
  stories: {
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
