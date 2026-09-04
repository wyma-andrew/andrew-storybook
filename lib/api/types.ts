export type VisualStyle = {
  id: string;
  scope: "global" | "story";
  storyId: string | null;
  name: string;
  description: string | null;
  swatch: string | null;
  source: "built_in" | "custom";
};

export type SystemPrompt = {
  kind: "character" | "location";
  prompt: string;
  updatedBy: string | null;
  updatedAt: string;
};

export type Story = {
  id: string;
  title: string;
  description: string | null;
  visualStyleId: string | null;
  visualStyleName: string | null;
  visualStyleDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoryListItem = Story & {
  chapterCount: number;
};

export type Chapter = {
  id: string;
  storyId: string;
  index: number;
  title: string;
  status: "script" | "assets" | "storyboard" | "done";
  script: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type BibleEntry = {
  id: string;
  storyId: string;
  kind: "character" | "location";
  name: string;
  meta: string | null;
  realPrompt: string;
  seed: string | null;
  locked: boolean;
};

export type ChapterAsset = {
  id: string;
  chapterId: string;
  kind: "character" | "location";
  bibleEntryId: string | null;
  name: string;
  meta: string | null;
  realPrompt: string;
  matchStatus: "matched" | "new" | "local" | "stale";
};

export type Shot = {
  id: string;
  sceneId: string;
  index: number;
  label: string | null;
  durationS: number | null;
  aspect: string | null;
  camera: string | null;
  prompt: string; // Start Frame image prompt
  endFramePrompt: string | null; // set only when frameMode is "start_and_end_frame"
  videoPrompt: string | null; // Google Flow motion prompt (start->end or isolated action)
  frameMode: "start_frame_only" | "start_and_end_frame";
  assetsUsed: ShotAsset[]; // which known characters/locations to attach as reference when generating this shot
};

export type ShotAsset = { name: string; kind: "character" | "location" };

export type Scene = {
  id: string;
  chapterId: string;
  index: number;
  title: string | null;
  slug: string | null;
  shots: Shot[];
};

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
};
