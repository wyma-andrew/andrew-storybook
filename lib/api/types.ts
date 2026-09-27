import type { UserFeatures } from "@/lib/constants/features";
import type { Region } from "@/lib/constants/regions";
import type { ShotScale } from "@/lib/constants/shot-scales";
import type { MotionMode } from "@/lib/constants/motion-styles";
import type {
  MovieRecapAspectRatio,
  MovieRecapFitMode,
  MovieRecapLanguage,
  MovieRecapLogoPlacement,
  MovieRecapSubtitlePosition,
  MovieRecapSubtitlePreset,
  MovieRecapVoiceId,
} from "@/lib/constants/movie-recap";

/**
 * One shot as it was actually cut, reported back by a render so the browser can
 * keep a history of them. NOT stored server-side: the client puts these in
 * localStorage, because it is a debugging record of how a generation turned out,
 * not project data (see history/movie-recap.md).
 */
export type MovieRecapRenderShot = {
  /** 1-based, so it reads like the render log. */
  beat: number;
  shot: number;
  /** How long this shot is on screen. */
  slotS: number;
  sourceStartS: number;
  sourceEndS: number;
  /** Seconds of ORIGINAL footage behind it. */
  sourceS: number;
  /** Seconds with no footage behind them — a held frame. Should be 0. */
  padS: number;
  /** Playback speed this shot ran at; identical for every shot in one beat. */
  speed: number;
  /** Source seconds jumped since the previous shot ended. Null for the first. */
  skipS: number | null;
};

export type MovieRecapRenderLog = {
  createdAt: string;
  mock: boolean;
  /** Full-source, silent 3-on/1-off cadence diagnostic. */
  timingTest?: boolean;
  /** Total recap length: the sum of every slot. */
  durationS: number;
  beats: number;
  shots: MovieRecapRenderShot[];
  /** Total held-frame seconds across the render. */
  padS: number;
  /** One narration rate shared by every beat in this render. */
  narrationRate?: number;
};

export type MovieRecapRangeRender = {
  id: string;
  projectId: string;
  startBeat: number;
  endBeat: number;
  status: "running" | "done" | "failed";
  error: string | null;
  warning: string | null;
  outputUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
};

export type MovieRecapProject = {
  id: string;
  name: string;
  outputLanguage: MovieRecapLanguage;
  voiceProfileId: MovieRecapVoiceId;
  sourceFileName: string;
  sourceObjectKey: string;
  sourceUrl: string | null;
  sourceContentType: string;
  sourceSizeBytes: number;
  sourceDurationSeconds: number;
  // Source pixel size, null when the browser could not read it.
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceLastModified: number;
  sourceUploadStatus: "pending" | "uploading" | "ready" | "failed";
  aspectRatio: MovieRecapAspectRatio;
  fitMode: MovieRecapFitMode;
  dynamicBackgroundBlurEnabled: boolean;
  mirrorEnabled: boolean;
  // Divisor on the source crop; 1 is no zoom. NULL means the user has not chosen
  // one and the recommendation for the fit mode applies — see
  // effectiveMovieRecapZoom().
  copyrightZoom: number | null;
  subtitlePreset: MovieRecapSubtitlePreset;
  subtitlesEnabled: boolean;
  subtitlePosition: MovieRecapSubtitlePosition;
  subtitleOffset: number;
  hookTitle: string | null;
  hookTitlePosition: MovieRecapSubtitlePosition;
  hookTitleOffset: number;
  logoEnabled: boolean;
  logoFileName: string | null;
  logoObjectKey: string | null;
  logoUrl: string | null;
  logoContentType: string | null;
  logoSizeBytes: number | null;
  logoWatermarkText: string | null;
  logoTemplateId: string | null;
  logoPlacement: MovieRecapLogoPlacement;
  logoOpacity: number;
  // Every area of the frame to blur out, as PERCENTAGES of the output. A source
  // can carry a channel logo, a watermark and a burned-in subtitle at once, so
  // this is a list — empty means no blur at all.
  blurRegions: MovieRecapBlurRegion[];
  currentStep: 1 | 2 | 3 | 4 | 5;
  status: "draft" | "ready_for_generation";
  // What the source says, read once at the Transcript step rather than inside
  // every render. `transcriptStory` is that dialogue retold in Burmese as one
  // flowing story — deliberately not aligned to the lines above it.
  transcript: MovieRecapTranscriptSegment[] | null;
  // The transcript as typed in by hand. The AI read is disconnected for now, so
  // this is the transcript — `transcript` above only holds what an earlier
  // automatic run left behind.
  transcriptText: string | null;
  transcriptStory: string | null;
  // Whether the lines came from the file's own subtitle track or from Whisper.
  transcriptSource: "captions" | "whisper" | null;
  transcriptStatus: "idle" | "running" | "done" | "failed";
  // Whether the last run only redid the retelling, so the progress bar can show
  // the steps it skipped instead of claiming them.
  transcriptStoryOnly: boolean;
  transcriptStage: MovieRecapTranscriptStage | null;
  transcriptProgressCurrent: number | null;
  transcriptProgressTotal: number | null;
  // 0-100 through the passage in flight, so the bar moves during one that takes
  // minutes instead of only when a whole passage lands.
  transcriptProgressPartial: number | null;
  transcriptError: string | null;
  // The script run: reading the source, dividing the story across its scenes and
  // MEASURING each beat's narration. Separate from the render because the whole
  // point is to stop before the cut and let the user fix a line
  // (history/movie-recap.md, 2026-09-19).
  scriptStatus: "idle" | "running" | "ready" | "failed";
  scriptStage: MovieRecapRenderStage | null;
  scriptProgressCurrent: number | null;
  scriptProgressTotal: number | null;
  scriptError: string | null;
  // Cleared whenever a beat's text changes, so a render can never cut words
  // nobody checked.
  scriptApproved: boolean;
  renderStatus: "idle" | "running" | "done" | "failed";
  renderIsMock: boolean;
  renderError: string | null;
  renderWarning: string | null;
  renderStage: MovieRecapRenderStage | null;
  renderProgressCurrent: number | null;
  renderProgressTotal: number | null;
  // The script the last full render wrote, and the only part of a render the
  // user can edit and re-run. Patchable: fixing one awkward line must not cost
  // a fresh analysis of the source or reroll the lines that were fine.
  renderScript: MovieRecapNarrationSegment[] | null;
  // R2 key for the analysis that goes with `renderScript`. Null means no full
  // render has finished yet, so re-rendering from the script is not offered.
  renderAnalysisKey: string | null;
  renderOutputUrl: string | null;
  renderAudioUrl: string | null;
  renderAudioObjectKey: string | null;
  renderFootageUrl: string | null;
  renderStartedAt: string | null;
  renderCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MovieRecapLogoTemplate = {
  id: string;
  name: string;
  logoFileName: string;
  logoObjectKey: string;
  logoUrl: string;
  logoContentType: string;
  logoSizeBytes: number;
  logoWatermarkText: string | null;
  createdAt: string;
  updatedAt: string;
};

// One line of the source's dialogue, timed against the ORIGINAL source video.
export type MovieRecapTranscriptSegment = { start: number; end: number; text: string };

// Mirrors the stage names lib/movie-recap-transcript.ts writes as it runs.
export type MovieRecapTranscriptStage =
  | "downloading_source"
  | "reading_captions"
  | "extracting_audio"
  | "transcribing"
  | "translating";

// Mirrors the stage names lib/movie-recap-render.ts writes as it runs, for
// progress display — see history/movie-recap.md, "real render progress".
export type MovieRecapRenderStage =
  | "downloading_source"
  | "detecting_scenes"
  | "extracting_keyframes"
  | "describing_scenes"
  | "reading_captions"
  | "extracting_audio"
  | "transcribing"
  | "writing_script"
  | "synthesizing_narration"
  | "rendering_segments"
  | "concatenating"
  | "applying_overlays"
  | "uploading";

// One narration line from the render pipeline's script-generation step, timed
// against the ORIGINAL source video (sourceStartS/sourceEndS). The synthesized
// audio's own length is measured during the render and used to size the video
// segment; it is not stored here — see lib/movie-recap-render.ts.
export type MovieRecapBlurRegion = { x: number; y: number; width: number; height: number };

export type MovieRecapNarrationSegment = {
  // The shots this beat cuts between while its line is spoken, in order. One
  // entry is a beat that holds a single shot; several is the normal case.
  // `keyframeFraction` is where inside the shot the vision pass found the moment
  // it described, so a re-render cuts on the same action the first one did.
  shots: { sourceStartS: number; sourceEndS: number; keyframeFraction?: number }[];
  text: string;
  // Provider-output duration before the fixed global playback rate. Persisting
  // it means a later rate change can rebuild timing without measuring an
  // unchanged cached file again.
  rawAudioS?: number;
  // Duration after the fixed global playback rate, in seconds. Written by the
  // script run and re-written when one beat is rebuilt; absent on old scripts
  // and mocks.
  //
  // Against the beat's own footage it is the only number that matters at the
  // script step: more audio than footage is a held frame in the finished video,
  // and the fix — fewer words, or a later timestamp — is the user's.
  audioS?: number;
  // One pair of rates applies to the entire script. They are repeated on
  // each beat because render_script is the durable narration manifest and a
  // single-beat preview must reproduce the rendered audio exactly.
  narrationRate?: number;
  videoSpeed?: number;
  // The line as the script run first wrote it. Written once, at the birth of the
  // beat, and carried through every edit — the restore point for a paste or a
  // rewrite that turned out worse than what it replaced.
  originalText?: string;
  // Which hand-timed block this beat's words came from, and that block's own
  // start and end. Carried on the beat so the footage can be laid out again —
  // after one line is re-spoken, say — without re-reading the transcript.
  blockIndex?: number;
  blockStartS?: number;
  blockEndS?: number;
  // The RIBBON GROUP this beat belongs to: a run of consecutive blocks merged
  // until it spans MOVIE_RECAP_RIBBON_GROUP_S. A beat shares footage with its
  // neighbours INSIDE these bounds and never across them, which is what keeps
  // the group's two stamps exact while the ones between them can give.
  //
  // Absent on a script built before groups existed; the ribbon falls back to the
  // block bounds there, which is what those scripts were laid out with.
  groupIndex?: number;
  groupStartS?: number;
  groupEndS?: number;
  // The text changed after `audioS` was measured, so the number beside it is the
  // OLD line's. Set by saving a beat without re-speaking it — sometimes a typo
  // fix plainly cannot move the timing, and a TTS call for it is spend for
  // nothing. Cleared by a re-check or a fresh script run.
  audioStale?: boolean;
};

// Source framing data prepared before rendering and stored in R2.
export type MovieRecapRenderAnalysis = {
  // The rectangle of the source that is actually picture, when the file carries
  // letterbox bars of its own. Null when the whole frame is picture, which is
  // the common case. See lib/movie-recap-crop.ts.
  crop?: { width: number; height: number; x: number; y: number } | null;
};

export type MovieRecapProjectPatch = Partial<{
  name: string;
  outputLanguage: MovieRecapProject["outputLanguage"];
  voiceProfileId: MovieRecapProject["voiceProfileId"];
  aspectRatio: MovieRecapProject["aspectRatio"];
  fitMode: MovieRecapProject["fitMode"];
  dynamicBackgroundBlurEnabled: boolean;
  mirrorEnabled: boolean;
  copyrightZoom: number | null;
  subtitlePreset: MovieRecapProject["subtitlePreset"];
  subtitlesEnabled: boolean;
  subtitlePosition: MovieRecapProject["subtitlePosition"];
  subtitleOffset: number;
  hookTitle: string | null;
  hookTitlePosition: MovieRecapProject["hookTitlePosition"];
  hookTitleOffset: number;
  logoEnabled: boolean;
  logoPlacement: MovieRecapProject["logoPlacement"];
  logoOpacity: number;
  logoWatermarkText: string | null;
  blurRegions: MovieRecapBlurRegion[];
  renderScript: MovieRecapNarrationSegment[];
  transcriptText: string;
  transcriptStory: string;
  currentStep: MovieRecapProject["currentStep"];
  status: MovieRecapProject["status"];
}>;

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
  features: UserFeatures;
};

export type AdminUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  features: UserFeatures;
};
