import type { Region } from "@/lib/constants/regions";
import type { ShotScale } from "@/lib/constants/shot-scales";
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

// One image generated in an external tool and uploaded to R2 for this chapter.
// Distinct from ReferenceImage: that is a hand-pasted identity/layout reference,
// this is a finished render produced FROM the chapter's prompts. `url` is a
// stored public URL rather than one composed from the bucket base, so an image
// keeps resolving if R2_PUBLIC_BASE_URL later changes.
export type ChapterImage = {
  id: string;
  chapterId: string;
  fileName: string;
  objectKey: string;
  url: string;
  contentType: string;
  sizeBytes: number | null;
  createdAt: string;
  // At most one of these. Both are ON DELETE SET NULL, so deleting an asset or
  // regenerating a scene drops the link on its own and the image becomes unused.
  chapterAssetId: string | null;
  shotId: string | null;
  // What it is attached to, resolved server-side for display: the asset's name,
  // or "1.2" for a shot. Null means unused — never linked, or the target is gone.
  linkedLabel: string | null;
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
  // Framing scale. Selects the optics line (depth of field, background
  // treatment) composed into the copied prompt at copy time
  // (lib/constants/shot-scales.ts). Null on shots generated before scales
  // existed; those copy with no [Framing] line at all.
  shotScale: ShotScale | null;
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
  // Scene lighting/atmosphere, shared by every shot in the scene and composed
  // into copied prompts at copy time (lib/prompt-copy.ts).
  lighting: string | null;
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
