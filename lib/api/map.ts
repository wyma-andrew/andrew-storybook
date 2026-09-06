import type {
  VisualStyle,
  Story,
  Chapter,
  BibleEntry,
  ChapterAsset,
  Scene,
  Shot,
} from "./types";
import type { ResolvedVisualStyle } from "@/lib/visual-styles";

type Row = Record<string, unknown>;

export function mapVisualStyle(r: ResolvedVisualStyle): VisualStyle {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    swatch: r.swatch,
    locked: r.locked,
  };
}

export function mapStory(r: Row, style?: ResolvedVisualStyle | null): Story {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    visualStyleId: (r.visual_style_id as string) ?? null,
    visualStyleName: style?.name ?? null,
    visualStyleDescription: style?.description ?? null,
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
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapBibleEntry(r: Row): BibleEntry {
  return {
    id: r.id as string,
    storyId: r.story_id as string,
    kind: r.kind as BibleEntry["kind"],
    name: r.name as string,
    meta: (r.meta as string) ?? null,
    realPrompt: r.real_prompt as string,
    seed: (r.seed as string) ?? null,
    locked: r.locked as boolean,
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
    realPrompt: r.real_prompt as string,
    matchStatus: r.match_status as ChapterAsset["matchStatus"],
  };
}

export function mapShot(r: Row): Shot {
  return {
    id: r.id as string,
    sceneId: r.scene_id as string,
    index: r.index as number,
    label: (r.label as string) ?? null,
    durationS: (r.duration_s as number) ?? null,
    aspect: (r.aspect as string) ?? null,
    camera: (r.camera as string) ?? null,
    prompt: r.prompt as string,
    endFramePrompt: (r.end_frame_prompt as string) ?? null,
    videoPrompt: (r.video_prompt as string) ?? null,
    frameMode: (r.frame_mode as Shot["frameMode"]) ?? "start_frame_only",
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
    shots: shots.map(mapShot).sort((a, b) => a.index - b.index),
  };
}
