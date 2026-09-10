import type { Region } from "@/lib/constants/regions";
import type { MotionMode } from "@/lib/constants/motion-styles";

export type Story = {
  id: string;
  title: string;
  description: string | null;
  visualStyleId: string | null;
  visualStyleName: string | null;
  aspectRatio: string;
  region: Region;
  motionStyleId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  aspectRatio: string | null; // null = use the story's default
  createdAt: string;
  updatedAt: string;
};

// Locked reference image for a location asset (URL-only — no upload/Storage).
// See ChapterAsset.images (chapter-scoped, pending) vs BibleEntry.images
// (promoted, shared across every chapter reusing that location).
export type ReferenceImage = {
  id: string;
  angleLabel: string;
  imageUrl: string | null;
  isCanonical: boolean;
};

// Locations only (null on characters, and on rows extracted before the field
// existed): which reference-image preset this location renders with — an
// interior view + floor plan, or an exterior view + site plan.
export type SpaceKind = "interior" | "exterior";
export type AssetKind = "character" | "location" | "prop";

export type BibleEntry = {
  id: string;
  storyId: string;
  kind: AssetKind;
  name: string;
  meta: string | null;
  spaceKind: SpaceKind | null;
  realPrompt: string;
  seed: string | null;
  locked: boolean;
  images: ReferenceImage[];
};

export type ChapterAsset = {
  id: string;
  chapterId: string;
  kind: AssetKind;
  bibleEntryId: string | null;
  name: string;
  meta: string | null;
  spaceKind: SpaceKind | null;
  realPrompt: string;
  matchStatus: "matched" | "new" | "local" | "stale";
  images: ReferenceImage[];
};

// The shots table still carries frame_mode / end_frame_prompt /
// end_frame_prompt_override columns from the removed start+end-frame
// interpolation feature. It was generated for 0 of 154 shots — the model never
// met its "same uninterrupted camera move into the next shot" condition — so
// generation and UI for it are gone. Columns kept (all null) in case a
// redesigned version returns: an end frame pinned to the shot's OWN closing
// state, reused as the next shot's start image when the ledger says the state
// carries over.
export type Shot = {
  id: string;
  sceneId: string;
  index: number;
  label: string | null;
  // Why this shot exists: the script line(s) it covers and what it adds over
  // the previous shot. Generated metadata, read-only in the UI.
  beat: string | null;
  durationS: number | null;
  aspect: string | null;
  camera: string | null;
  // Which motion register this shot copies with. The motion paragraph itself
  // is never stored — it is composed from the story's motion style at copy
  // time (lib/constants/motion-styles.ts), so changing the style re-renders
  // every video prompt with no regeneration. Null on shots generated before
  // motion modes existed; those copy with the style's default text.
  motionMode: MotionMode | null;
  // Effective prompts: the user's edit when there is one, else the generated text.
  prompt: string; // Start Frame image prompt
  videoPrompt: string | null; // Google Flow motion prompt (start->end or isolated action)
  // True while an edit overrides the generated text — the generated version is
  // still on the row and comes back by clearing the override.
  promptEdited: boolean;
  videoPromptEdited: boolean;
  // Continuity ledger: startState should match the previous shot's endState
  // unless the script changes something between them. Generated metadata —
  // read-only in the UI, so no *_override counterpart like the prompts have.
  startState: string | null;
  endState: string | null;
  assetsUsed: ShotAsset[]; // which known characters/locations to attach as reference when generating this shot
};

export type ShotAsset = { name: string; kind: AssetKind };

export type Scene = {
  id: string;
  chapterId: string;
  index: number;
  title: string | null;
  slug: string | null;
  shots: Shot[];
};

export type VoiceOverSegment = {
  id: string;
  chapterId: string;
  sourceIndex: number;
  // Effective text: storyboard override when present, otherwise the script
  // snapshot captured at generation time.
  text: string;
  textEdited: boolean;
  startShotId: string;
  endShotId: string;
};

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
};
