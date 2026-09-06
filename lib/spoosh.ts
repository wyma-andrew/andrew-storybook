"use client";

import { Spoosh } from "@spoosh/core";
import { create } from "@spoosh/react";
import { invalidationPlugin } from "@spoosh/plugin-invalidation";
import { cachePlugin } from "@spoosh/plugin-cache";
import type {
  VisualStyle,
  Story,
  StoryListItem,
  Chapter,
  BibleEntry,
  ChapterAsset,
  Scene,
  Me,
} from "@/lib/api/types";

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
  "visual-styles": {
    GET: { data: VisualStyle[] };
    POST: { data: VisualStyle; body: { name: string; description?: string; swatch?: string } };
  };
  "visual-styles/:id": {
    PATCH: { data: VisualStyle; body: Partial<{ name: string; description: string; swatch: string }> };
    DELETE: { data: null };
  };
  stories: {
    GET: { data: StoryListItem[] };
    POST: { data: Story; body: { title: string; description?: string; visualStyleId?: string | null } };
  };
  "stories/:id": {
    GET: { data: Story & { chapters: Chapter[] } };
    PATCH: { data: Story; body: Partial<{ title: string; description: string; visualStyleId: string | null }> };
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
    PATCH: { data: Chapter; body: Partial<{ title: string; script: unknown; status: Chapter["status"] }> };
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
  "chapters/:id/storyboard": {
    GET: { data: Scene[] };
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
]);

export const { useRead, useWrite, usePages, useQueue, useSubscription } = create(spoosh);
