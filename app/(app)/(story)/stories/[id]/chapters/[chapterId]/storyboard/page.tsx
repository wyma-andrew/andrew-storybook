"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Clapperboard, Paperclip, User, MapPin, Package, Copy, Square, Loader2, MoreVertical, Pencil, Undo2, GitCommitHorizontal, Target, Mic, Clock, Sun, Focus, Minus, Plus, Sparkles, Image as ImageIcon, Video, Eye, EyeOff } from "lucide-react";
import { ConfirmDialog, Menu, MenuItem, MenuTrigger, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, ToolbarLoadingButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap } from "@/components/ui/Layout";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";
import { startStoryboardGeneration, stopStoryboardGeneration, useStoryboardGenerating } from "@/lib/storyboard-generation";
import { AttachedImages } from "@/components/AttachedImages";
import { CameraPlates } from "@/components/CameraPlates";
import { REFERENCE_STATION } from "@/lib/site-map";
import { withStyle, withFrameDescription } from "@/lib/prompt-copy";
import { copyText } from "@/lib/copy";
import { TRUNCATE_SELECT_VALUE } from "@/lib/constants/select-truncate";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import { COVERAGE_MODES, COVERAGE_MODE_LABELS, type CoverageMode } from "@/lib/constants/coverage-modes";
import { MOTION_MODE_OPTIONS, resolveMotionStyle, resolveMotionText } from "@/lib/constants/motion-styles";
import {
  SCENE_BADGE_CLASS,
  SCENE_BORDER_CLASS,
  SCENE_CHIP_CLASS,
  SCENE_PILL_CLASS,
  SCENE_SURFACE_CLASS,
  sceneColorVars,
} from "@/lib/constants/scene-colors";
import {
  DEFAULT_SHOT_SCALE,
  SHOT_SCALE_OPTIONS,
  findShotScale,
  resolveShotOptics,
} from "@/lib/constants/shot-scales";
import type { Scene, Shot, VoiceOverSegment, ChapterImage } from "@/lib/api/types";

// Which prompt a shot is actually showing. The chapter-wide tab asks for one,
// but a shot with no video prompt falls back to its start frame rather than
// rendering an empty card — so the tab alone cannot answer this, and the card's
// badge and its box must agree.
function resolveShotView(tab: PromptTab, shot: Shot): PromptTab {
  return tab === "video" && !!shot.videoPrompt ? "video" : "start";
}

function PromptBox({
  label,
  text,
  edited,
  onCopy,
  onSave,
  onRestore,
  saving,
}: {
  label: string;
  text: string;
  edited: boolean;
  onCopy: () => void;
  onSave: (next: string) => Promise<void>;
  onRestore: () => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  return (
    <div className="mb-2 last:mb-0">
      {(label || edited) && (
        <div className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
          {label}
          {edited && <Tag>Edited</Tag>}
        </div>
      )}
      {/* Stacked below md: the action column is ~90px of a ~300px card, which
          wrapped the prompt every four words and made a shot three screens
          tall. Actions go ABOVE the text, not below — a long prompt would
          otherwise put Copy past a full screen of scrolling. */}
      <div className="flex flex-col gap-2 rounded-lg border border-line-2 bg-sunken p-3 md:flex-row md:items-start md:gap-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[120px] min-w-0 flex-1 text-[14px] leading-relaxed"
          />
        ) : (
          <div className="min-w-0 flex-1 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">{text}</div>
        )}
        <div className="-order-1 flex shrink-0 justify-end gap-1.5 md:order-none md:flex-col">
          {editing ? (
            <>
              <MiniLoadingButton
                loading={saving}
                onClick={async () => {
                  await onSave(draft);
                  setEditing(false);
                }}
              >
                Save
              </MiniLoadingButton>
              <MiniButton
                ghost
                onClick={() => {
                  setDraft(text);
                  setEditing(false);
                }}
              >
                Cancel
              </MiniButton>
            </>
          ) : (
            <>
              <MiniButton onClick={onCopy}>Copy</MiniButton>
              <MiniButton ghost onClick={() => setEditing(true)} className="flex items-center gap-1">
                <Pencil size={12} /> Edit
              </MiniButton>
              {edited && (
                <MiniLoadingButton
                  ghost
                  loading={saving}
                  onClick={onRestore}
                  className="flex items-center gap-1"
                  title="Restore generated version"
                >
                  <Undo2 size={12} /> Restore
                </MiniLoadingButton>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Which of a shot's two prompts is on screen. One choice for the whole chapter,
// not per shot: the reader is working in one mode at a time — writing start
// frames, or writing video prompts — and a per-shot switch would mean setting it
// again on every card.
export type PromptTab = "start" | "video";

function promptTabKey(chapterId: string) {
  return `storyboard-prompt-tab:${chapterId}`;
}

function readPromptTab(chapterId: string): PromptTab {
  if (typeof window === "undefined") return "start";
  try {
    return localStorage.getItem(promptTabKey(chapterId)) === "video" ? "video" : "start";
  } catch {
    return "start";
  }
}

function ShotPrompts({
  shot,
  chapterId,
  styleContext,
  motionStyleId,
  lighting,
  tab,
  onCopied,
}: {
  shot: Shot;
  chapterId: string;
  styleContext: string | null;
  motionStyleId: string;
  lighting: string | null;
  tab: PromptTab;
  // Fired on either prompt copy — Image and Video are two prompts for ONE
  // shot, so both mark the same card.
  onCopied: () => void;
}) {
  const { trigger: patchShot, loading: saving } = useWrite((api) => api("shots/:id").PATCH());

  // The storyboard is read as chapters/:id/storyboard, so a shots/:id mutation
  // doesn't auto-invalidate it — name it explicitly.
  const invalidate = [`chapters/${chapterId}/storyboard`];
  const write = (body: Record<string, string | null>) => patchShot({ params: { id: shot.id }, body, invalidate });

  const motionStyle = resolveMotionStyle(motionStyleId);
  // The motion paragraph is never stored on the shot — it is composed here from
  // the story's motion style, so switching that style restyles every video
  // prompt with no regeneration.
  const motionText = resolveMotionText(motionStyleId, shot.motionMode);
  // Framing optics, like the motion paragraph, are composed at copy time from
  // a constant rather than stored on the shot.
  const optics = resolveShotOptics(shot.shotScale);
  const motionModes = MOTION_MODE_OPTIONS.filter((option) => motionStyle.allowedModes.includes(option.value));
  const activeMode = shot.motionMode ?? motionStyle.defaultMode;
  const activeScale = shot.shotScale ?? DEFAULT_SHOT_SCALE;

  const showVideo = resolveShotView(tab, shot) === "video";

  function handleMotionModeChange(value: string) {
    const option = motionModes.find((o) => o.value === value);
    ConfirmDialog.show({
      title: `Switch motion to "${option?.label}"?`,
      content: `${option?.hint} — appended to this shot's copied video prompt.`,
      confirmButtonLabel: "Switch",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        await write({ motionMode: value });
        dismiss();
      },
    });
  }

  return (
    <>
      {showVideo ? (
        <PromptBox
          key={`video-${shot.id}-${shot.videoPrompt}-${shot.videoPromptEdited}`}
          label=""
          text={shot.videoPrompt!}
          edited={shot.videoPromptEdited}
          saving={saving}
          onCopy={async () => {
            const copied = await copyText(
              withFrameDescription(shot.videoPrompt!, shot.prompt, styleContext, motionText, lighting, optics),
              "Video prompt"
            );
            if (copied) onCopied();
          }}
          onSave={async (next) => void (await write({ videoPrompt: next }))}
          onRestore={async () => void (await write({ videoPrompt: null }))}
        />
      ) : (
        <PromptBox
          key={`start-${shot.id}-${shot.prompt}-${shot.promptEdited}`}
          // Only the exception is worth a line here; the card's badge already
          // names the mode, and repeating it above every box was noise.
          label={tab === "video" ? "No video prompt for this shot — showing its start frame" : ""}
          text={shot.prompt}
          edited={shot.promptEdited}
          saving={saving}
          onCopy={async () => {
            const copied = await copyText(withStyle(shot.prompt, styleContext, lighting, optics), "Start Frame prompt");
            if (copied) onCopied();
          }}
          onSave={async (next) => void (await write({ prompt: next }))}
          onRestore={async () => void (await write({ prompt: null }))}
        />
      )}
      {showVideo && shot.soundPrompt && (
        <PromptBox
          key={`sound-${shot.id}-${shot.soundPrompt}-${shot.soundPromptEdited}`}
          label="Sound"
          text={shot.soundPrompt}
          edited={shot.soundPromptEdited}
          saving={saving}
          onCopy={() => void copyText(shot.soundPrompt!, "Sound prompt")}
          onSave={async (next) => void (await write({ soundPrompt: next }))}
          onRestore={async () => void (await write({ soundPrompt: null }))}
        />
      )}
      {/* Temporarily hidden from the UI - the picker still writes shotScale and the
          optics line is still composed into copied prompts. */}
      <div hidden className="mt-2 rounded-lg border border-line-2 bg-sunken p-3">
        <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
          <Focus size={12} /> Framing
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={activeScale}
            onChange={(value) => void write({ shotScale: value })}
            disabled={saving}
            wrapperClassName="sm:w-[190px]"
          >
            {SHOT_SCALE_OPTIONS.map((option) => (
              <SelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </Select>
          <p className="flex-1 text-[11.5px] text-fg-3">
            {findShotScale(activeScale).hint} · sets the depth of field appended to copied prompts
          </p>
        </div>
      </div>
      {tab === "video" && shot.videoPrompt && (
        <div
          className="mt-3.5 flex items-center"
          title={`${motionModes.find((option) => option.value === activeMode)?.hint} · appended to the copied video prompt`}
        >
          <Select
            value={activeMode}
            onChange={handleMotionModeChange}
            disabled={saving}
            wrapperClassName="w-full max-w-[150px]"
          >
            {motionModes.map((option) => (
              <SelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </Select>
        </div>
      )}
    </>
  );
}

type ShotOption = {
  id: string;
  order: number;
  label: string;
};


function VoiceOverCard({
  segment,
  chapterId,
  shotOptions,
  minOrder,
  maxOrder,
}: {
  segment: VoiceOverSegment;
  chapterId: string;
  shotOptions: ShotOption[];
  minOrder: number;
  maxOrder: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const { trigger: patchVoiceOver, loading: saving } = useWrite((api) => api("voice-overs/:id").PATCH());
  const availableShots = shotOptions.filter((shot) => shot.order >= minOrder && shot.order <= maxOrder);
  const startOrder = shotOptions.find((shot) => shot.id === segment.startShotId)?.order ?? minOrder;
  const endOrder = shotOptions.find((shot) => shot.id === segment.endShotId)?.order ?? startOrder;

  async function patch(body: Partial<{ text: string | null; startShotId: string; endShotId: string }>) {
    const { error } = await patchVoiceOver({
      params: { id: segment.id },
      body,
      invalidate: `chapters/${chapterId}/voice-overs`,
    });
    if (error) {
      toast.error(error.error);
      return false;
    }
    return true;
  }

  async function changeStart(startShotId: string) {
    const nextOrder = shotOptions.find((shot) => shot.id === startShotId)?.order ?? startOrder;
    await patch({
      startShotId,
      endShotId: nextOrder > endOrder ? startShotId : segment.endShotId,
    });
  }

  async function changeEnd(endShotId: string) {
    const nextOrder = shotOptions.find((shot) => shot.id === endShotId)?.order ?? endOrder;
    await patch({
      startShotId: nextOrder < startOrder ? endShotId : segment.startShotId,
      endShotId,
    });
  }

  return (
    <div className="rounded-[10px] border border-line bg-panel-3 p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-style-badge uppercase">
          <Mic size={12} /> Voice Over {String(segment.sourceIndex).padStart(2, "0")}
        </span>
        {segment.textEdited && <Tag>Edited</Tag>}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[100px] min-w-0 flex-1 text-[14px] leading-relaxed"
          />
        ) : (
          <div className="min-h-10 min-w-0 flex-1 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">{segment.text}</div>
        )}
        <div className="-order-1 flex shrink-0 justify-end gap-1.5 md:order-none md:flex-col">
          {editing ? (
            <>
              <MiniLoadingButton
                loading={saving}
                disabled={!draft.trim()}
                onClick={async () => {
                  if (await patch({ text: draft })) setEditing(false);
                }}
              >
                Save
              </MiniLoadingButton>
              <MiniButton
                ghost
                onClick={() => {
                  setDraft(segment.text);
                  setEditing(false);
                }}
              >
                Cancel
              </MiniButton>
            </>
          ) : (
            <>
              <MiniButton onClick={() => copyText(segment.text, `Voice Over ${segment.sourceIndex}`)}>Copy</MiniButton>
              <MiniButton ghost onClick={() => setEditing(true)} className="flex items-center gap-1">
                <Pencil size={12} /> Edit
              </MiniButton>
              {segment.textEdited && (
                <MiniLoadingButton ghost loading={saving} onClick={() => patch({ text: null })}>
                  <Undo2 size={12} /> Restore
                </MiniLoadingButton>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
          Starts at
          <Select
            value={segment.startShotId}
            onChange={changeStart}
            disabled={saving}
            wrapperClassName={`mt-1.5 ${TRUNCATE_SELECT_VALUE}`}
          >
            {availableShots.map((shot) => <SelectOption key={shot.id} value={shot.id} label={shot.label} />)}
          </Select>
        </label>
        <label className="text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
          Ends at
          <Select
            value={segment.endShotId}
            onChange={changeEnd}
            disabled={saving}
            wrapperClassName={`mt-1.5 ${TRUNCATE_SELECT_VALUE}`}
          >
            {availableShots.map((shot) => <SelectOption key={shot.id} value={shot.id} label={shot.label} />)}
          </Select>
        </label>
      </div>
    </div>
  );
}

// Which already-generated shot images are worth attaching alongside this shot's
// reference sheets. Reference sheets pin identity; a previously rendered shot
// pins what the sheets can't — lighting, wardrobe as actually drawn, proportions
// as the model resolved them — so a recurring CHARACTER is the only thing that
// justifies one. Locations are already covered by their own reference sheet in
// the "Attach:" row.
//
// Picking rules, in order:
// - Search the whole chapter up to this shot, not just this scene: a character
//   drifts hardest ACROSS scenes, which is exactly where a scene-scoped search
//   goes silent.
// - Never suggest a shot that contains a character this shot doesn't have —
//   that character leaks into the generation.
// - Prefer closer framing. The first shot of a scene is the establishing wide
//   (see the storyboard prompt's Establishing Master Shot rule), where the
//   character is smallest and least usable as an identity reference.
// - Tie-break to the EARLIEST such shot, so every later shot keeps pointing at
//   the same master rather than chaining copy-of-a-copy drift.
const FRAMING_RANK: [RegExp, number][] = [
  [/\b(close-?up|close|macro|insert|detail)\b/, 3],
  [/\b(medium|two-?shot|over-?the-?shoulder|ots|reaction|portrait)\b/, 2],
  [/\b(wide|establishing|extreme|aerial|master|panorama)\b/, 1],
];

function framingScore(shot: Shot): number {
  const text = `${shot.label ?? ""} ${shot.camera ?? ""}`.toLowerCase();
  for (const [re, score] of FRAMING_RANK) if (re.test(text)) return score;
  return 2;
}

type ReferenceHint = { sceneIndex: number; shotIndex: number; names: string[] };

function characterReferenceHints(scenes: Scene[], sceneIdx: number, shotIdx: number): ReferenceHint[] {
  const shot = scenes[sceneIdx].shots[shotIdx];
  const characters = shot.assetsUsed.filter((a) => a.kind === "character").map((a) => a.name);
  if (!characters.length) return [];
  // A shot of the same character in a different look is not continuity for
  // this one — it shows another stage of them.
  const lookOf = (s: Shot, name: string) =>
    s.assetsUsed.find((a) => a.kind === "character" && a.name === name)?.look ?? null;

  const here = new Set(characters);
  const prior: { sceneIndex: number; shot: Shot }[] = [];
  for (let i = 0; i <= sceneIdx; i++) {
    const shots = i === sceneIdx ? scenes[i].shots.slice(0, shotIdx) : scenes[i].shots;
    for (const s of shots) prior.push({ sceneIndex: scenes[i].index, shot: s });
  }

  const byShot = new Map<string, ReferenceHint>();
  for (const name of characters) {
    const candidates = prior.filter(
      ({ shot: s }) =>
        s.assetsUsed.some((a) => a.kind === "character" && a.name === name) &&
        lookOf(s, name) === lookOf(shot, name) &&
        s.assetsUsed.every((a) => a.kind !== "character" || here.has(a.name))
    );
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) => {
      const d = framingScore(b.shot) - framingScore(a.shot);
      return d > 0 ? b : a; // ties keep `a`, the earlier shot
    });
    const key = `${best.sceneIndex}.${best.shot.index}`;
    const hint = byShot.get(key) ?? { sceneIndex: best.sceneIndex, shotIndex: best.shot.index, names: [] };
    hint.names.push(name);
    byShot.set(key, hint);
  }
  return [...byShot.values()];
}

function collapsedStorageKey(chapterId: string) {
  return `storyboard-collapsed:${chapterId}`;
}

function voiceOverCollapsedKey(chapterId: string) {
  return `storyboard-vo-collapsed:${chapterId}`;
}

// The narration list is long and is reference material, not per-shot work, so
// it starts folded; the choice persists per chapter like the scene accordion.
function readVoiceOverCollapsed(chapterId: string) {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(voiceOverCollapsedKey(chapterId));
    return raw === null ? true : (JSON.parse(raw) as boolean);
  } catch {
    return true;
  }
}

// null means "this viewer has never folded anything here" — distinct from an
// empty set, which means they deliberately left every scene open. Without the
// distinction there is no way to default to closed only on a first visit.
function readCollapsedScenes(chapterId: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(collapsedStorageKey(chapterId));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function hintsHiddenKey(chapterId: string) {
  return `storyboard-hints-hidden:${chapterId}`;
}

// The continuity hints are working notes — they matter while you are generating
// a chapter's images and are noise the rest of the time, so they start hidden
// and the toolbar toggle brings them back. SHOWN is the stored value, which is
// what makes hidden the default for a chapter nobody has touched.
function readHintsHidden(chapterId: string) {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(hintsHiddenKey(chapterId)) !== "0";
  } catch {
    return true;
  }
}

function lastCopiedKey(chapterId: string) {
  return `storyboard-last-copied:${chapterId}`;
}

// Only the shot id is stored. The highlight is resolved by matching that id
// against the live scene list on every render, so a mark pointing at a shot
// that no longer exists simply highlights nothing. A scene regeneration deletes
// and reinserts its shots, so it drops the mark — which is right: the shot that
// was copied is gone.
function readLastCopiedShot(chapterId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(lastCopiedKey(chapterId));
  } catch {
    return null;
  }
}

export default function StoryboardPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter, trigger: refetchChapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: scenes, trigger: refetchScenes } = useRead((api) =>
    api("chapters/:id/storyboard").GET({ params: { id: chapterId } })
  );
  const { data: voiceOvers, trigger: refetchVoiceOvers } = useRead((api) =>
    api("chapters/:id/voice-overs").GET({ params: { id: chapterId } })
  );
  // One read for every shot on the page. A regenerated scene deletes and
  // reinserts its shots, so the FK nulls those links — the renders survive and
  // show as unused in the chapter gallery rather than disappearing.
  const { data: chapterImages, trigger: refetchImages } = useRead((api) =>
    api("chapters/:id/images").GET({ params: { id: chapterId } })
  );
  const { data: chapterAssets } = useRead((api) => api("chapters/:id/assets").GET({ params: { id: chapterId } }));
  const lookLabels = new Map<string, string>();
  for (const asset of chapterAssets ?? []) {
    for (const look of asset.looks) lookLabels.set(`${asset.name}\u0000${look.key}`, look.label);
  }
  const stationLabels = new Map<string, string>();
  for (const place of chapter?.siteMap?.places ?? []) {
    for (const station of place.stations) {
      // The reference station's plate is the location card's own image, so the
      // chip names it that way rather than by the model's label for the view.
      const label = station.key === REFERENCE_STATION ? "Reference" : `${station.label} plate`;
      stationLabels.set(`${place.location}\u0000${station.key}`, label);
    }
  }
  const imagesByShot = new Map<string, ChapterImage[]>();
  for (const image of chapterImages ?? []) {
    if (!image.shotId) continue;
    const list = imagesByShot.get(image.shotId) ?? [];
    list.push(image);
    imagesByShot.set(image.shotId, list);
  }
  const generating = useStoryboardGenerating(chapterId);
  // Also fires when this page remounts mid-generation and the job finishes
  // afterwards — the instance that started it may be long gone.
  const wasGenerating = useRef(generating);
  useEffect(() => {
    if (wasGenerating.current && !generating) {
      refetchScenes();
      refetchVoiceOvers();
      // The site map, and with it the camera stations, is rewritten by every full generation.
      refetchChapter();
    }
    wasGenerating.current = generating;
  }, [generating, refetchScenes, refetchVoiceOvers, refetchChapter]);
  const { trigger: regenerateScene } = useWrite((api) => api("scenes/:id/regenerate").POST());
  // Which scene is mid-regeneration — the shared `loading` flag can't say which
  // card fired, and only that card's button should spin.
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  // A scene id in this set is collapsed. Persisted per-chapter in localStorage so
  // a viewer's fold state survives reloads; null until they have folded anything,
  // and the fallback for null is EVERY scene closed — a chapter opens as a
  // readable list of scene headings rather than one long wall of shots.
  const [collapsed, setCollapsed] = useState<Set<string> | null>(() => readCollapsedScenes(chapterId));

  const [voiceOverCollapsed, setVoiceOverCollapsed] = useState<boolean>(() => readVoiceOverCollapsed(chapterId));

  // Last shot whose prompt was copied — highlighted so the user can find their
  // place again after leaving the page for the image tool. It persists until
  // another shot is copied: it marks where they are, not a transient toast, so
  // it never fades on its own. Last copy wins outright, including a copy of an
  // earlier shot — going back is deliberate, so the highlight follows.
  const [lastCopiedShotId, setLastCopiedShotId] = useState<string | null>(() => readLastCopiedShot(chapterId));

  const [hintsHidden, setHintsHidden] = useState<boolean>(() => readHintsHidden(chapterId));

  function toggleHints() {
    setHintsHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(hintsHiddenKey(chapterId), next ? "1" : "0");
      } catch {
        // ignore (private browsing / storage disabled) — the choice just won't persist
      }
      return next;
    });
  }

  function markCopied(shotId: string) {
    setLastCopiedShotId(shotId);
    try {
      localStorage.setItem(lastCopiedKey(chapterId), shotId);
    } catch {
      // Private window or blocked storage — the highlight still works this session.
    }
  }

  // Chapter-wide, so switching on one shot switches every shot in every scene.
  const [promptTab, setPromptTab] = useState<PromptTab>(() => readPromptTab(chapterId));

  function changePromptTab(next: PromptTab) {
    setPromptTab(next);
    try {
      localStorage.setItem(promptTabKey(chapterId), next);
    } catch {
      // ignore (private browsing / storage disabled) — the choice just won't persist
    }
  }

  const sceneRefs = useRef<Map<string, HTMLElement>>(new Map());

  function toggleVoiceOver() {
    setVoiceOverCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(voiceOverCollapsedKey(chapterId), JSON.stringify(next));
      } catch {
        // ignore (private browsing / storage disabled) — fold state just won't persist
      }
      return next;
    });
  }

  function toggleScene(sceneId: string) {
    setCollapsed((prev) => {
      // Accordion: opening a scene collapses every other one, so only one
      // scene's shots are ever on screen at a time — no more guessing which
      // scene a shot list belongs to.
      const allIds = (scenes ?? []).map((s) => s.id);
      // null (never folded) means everything is currently closed.
      const wasCollapsed = prev === null || prev.has(sceneId);
      const next = wasCollapsed
        ? new Set(allIds.filter((id) => id !== sceneId)) // was collapsed -> expand it, collapse rest
        : new Set(allIds); // was expanded -> collapse it (and everything else already is)
      try {
        localStorage.setItem(collapsedStorageKey(chapterId), JSON.stringify([...next]));
      } catch {
        // ignore (private browsing / storage disabled) — fold state just won't persist
      }
      if (wasCollapsed) {
        // Scrolled *into* view, not just onto screen — the header can otherwise
        // land mid-viewport, leaving the card's top (and its "which scene" cue)
        // scrolled past.
        requestAnimationFrame(() => sceneRefs.current.get(sceneId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      return next;
    });
  }

  async function handleGenerate() {
    const { error, aborted } = await startStoryboardGeneration(chapterId);
    if (error && !aborted) toast.error(error);
  }

  // The mode only sizes the new shot list — the destructive part is identical
  // across all four, so they share one confirm.
  function confirmRegenerateScene(scene: Scene, coverageMode: CoverageMode) {
    const coverage =
      coverageMode === "free"
        ? "The model decides how many shots the scene needs."
        : coverageMode === "same"
          ? `Aims for the same ${scene.shots.length} shots.`
          : coverageMode === "tighter"
            ? `Aims for fewer than ${scene.shots.length} shots.`
            : `Aims for more than ${scene.shots.length} shots.`;
    ConfirmDialog.show({
      title: `Regenerate scene ${scene.index}?`,
      content:
        `${coverage} Re-shoots only this scene against the script, keeping every other scene. ` +
        "Its current shots and any prompt edits in it are replaced, and Voice Over ranges are remapped across the chapter — narration text edits are discarded. Cannot be undone.",
      confirmButtonLabel: "Regenerate scene",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        dismiss();
        setRegeneratingSceneId(scene.id);
        const { data, error } = await regenerateScene({ params: { id: scene.id }, body: { coverageMode } });
        setRegeneratingSceneId(null);
        if (data) {
          refetchScenes();
          refetchVoiceOvers();
        }
        if (error) toast.error(error.error);
      },
    });
  }

  const sceneCount = scenes?.length ?? 0;
  const shotCount = scenes?.reduce((sum, s) => sum + s.shots.length, 0) ?? 0;
  const totalDurationS = scenes?.reduce((sum, s) => sum + s.shots.reduce((sSum, shot) => sSum + (shot.durationS ?? 0), 0), 0) ?? 0;
  const totalDurationLabel =
    totalDurationS >= 60 ? `${Math.floor(totalDurationS / 60)}m ${totalDurationS % 60}s` : `${totalDurationS}s`;
  const shotOptions: ShotOption[] = (scenes ?? []).flatMap((scene) =>
    scene.shots.map((shot) => ({
      id: shot.id,
      order: 0,
      label: `${scene.index}.${shot.index}`,
    }))
  ).map((shot, order) => ({ ...shot, order }));
  const shotOrder = new Map(shotOptions.map((shot) => [shot.id, shot.order]));

  function voiceOversForShot(shotId: string) {
    const order = shotOrder.get(shotId);
    if (order === undefined) return [];
    return (voiceOvers ?? []).filter((segment) => {
      const start = shotOrder.get(segment.startShotId);
      const end = shotOrder.get(segment.endShotId);
      return start !== undefined && end !== undefined && order >= start && order <= end;
    });
  }

  if (!story || !chapter) {
    return (
      <>
        <Body>
          <Wrap wide>
            <div className="pt-6">
              <SkeletonCards count={3} label="Loading storyboard" columns="grid-cols-1" />
            </div>
          </Wrap>
        </Body>
      </>
    );
  }

  const styleContext = resolveStyleContext(story.region, story.visualStyleId);

  return (
    <>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="storyboard"
        styleName={story.visualStyleName ?? "None"}
        storyAspectRatio={story.aspectRatio}
        chapterAspectRatio={chapter.aspectRatio}
      />

      <Toolbar>
        {generating ? (
          <ToolbarButton onClick={() => stopStoryboardGeneration(chapterId)} className="!text-danger">
            <Loader2 size={13} className="animate-spin" />
            Generating…
            <span className="ml-1 inline-flex items-center gap-1 border-l border-danger/40 pl-2 text-[12.5px]">
              <Square size={11} /> Stop
            </span>
          </ToolbarButton>
        ) : (
          <ToolbarLoadingButton onClick={handleGenerate} loading={false}>
            {!!scenes?.length && <RefreshCw size={13} />}
            {scenes?.length ? "Regenerate" : "Generate storyboard"}
          </ToolbarLoadingButton>
        )}
        {!!scenes?.length && (
          <>
            <div className={toolbarSep} />
            {/* One switch for the whole chapter, in the toolbar rather than on every
                card: the mode is chapter-wide, and a copy per shot implied otherwise
                while adding a bordered box to each one.

                Deliberately NOT the accent pill the chapter tabs use. The two sat
                forty pixels apart in identical clothing — same rounded-full border,
                same bg-accent active state — so a view filter read as a fourth
                destination. Navigation keeps the pill and the accent; this is a
                squarer, quieter segmented control with icons, because it changes
                what a card SHOWS, not where you are. */}
            <div className="flex shrink-0 gap-0.5 rounded-md border border-line-2 bg-sunken p-0.5">
              {(
                [
                  ["start", "Image", ImageIcon],
                  ["video", "Video", Video],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changePromptTab(value)}
                  aria-pressed={promptTab === value}
                  title={`${label} prompt`}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-[5px] px-3 py-1 text-[12px] font-medium whitespace-nowrap ${
                    promptTab === value ? "bg-raised text-accent shadow-sm" : "text-fg-3 hover:text-fg"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <div className={toolbarSep} />
            <ToolbarButton onClick={toggleHints} title="Continuity hints on each shot">
              {hintsHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              Hints
            </ToolbarButton>
          </>
        )}
      </Toolbar>

      <Body>
        <Wrap wide>
          {/* Read of the chapter, not a control — so it sits with the content it
              describes rather than in the toolbar, where it was the widest item
              and forced the row to wrap on a phone. One comma-joined line, not
              three rules-separated cells: a divider between each made them look
              like three separate controls. */}
          {!!scenes?.length && (
            <div className="mb-3.5 text-[12.5px] text-fg-3">
              {sceneCount} scenes, {shotCount} shots, ~{totalDurationLabel} total
            </div>
          )}

          {!scenes?.length && !generating && (
            <EmptyCta
              title="No storyboard yet"
              icon={<Clapperboard size={19} />}
              action={
                <Button variant="primary" onClick={handleGenerate} className="flex items-center gap-1.5">
                  Generate storyboard <ArrowRight size={15} />
                </Button>
              }
            >
              Generate scenes and shots from the script and its extracted assets.
            </EmptyCta>
          )}

          {!!scenes?.length && (
            <CameraPlates
              chapterId={chapterId}
              siteMap={chapter?.siteMap ?? null}
              assets={chapterAssets ?? []}
              images={chapterImages ?? []}
              styleContext={styleContext}
              onUploaded={refetchImages}
            />
          )}

          {!!voiceOvers?.length && !!shotOptions.length && (
            <section className="mb-4.5 rounded-xl border border-style-badge-border bg-panel-2 p-3 md:p-4.5">
              <button
                type="button"
                onClick={toggleVoiceOver}
                className={`flex w-full cursor-pointer flex-wrap items-center gap-2 text-left ${voiceOverCollapsed ? "" : "mb-3.5"}`}
              >
                <Mic size={15} className="text-style-badge" />
                <h2 className="text-[14px] font-semibold">Voice Over</h2>
                <Tag>{voiceOvers.length} segments</Tag>
                {/* Below md the caption takes its own line; from md it is
                    pushed to the right of the title row. */}
                <span className="w-full text-[11.5px] text-fg-3 md:ml-auto md:w-auto">
                  Separate narration overlay · not added to video prompts
                </span>
              </button>
              <div className={`grid-cols-1 gap-3 xl:grid-cols-2 ${voiceOverCollapsed ? "hidden" : "grid"}`}>
                {voiceOvers.map((segment, index) => {
                  const previous = voiceOvers[index - 1];
                  const next = voiceOvers[index + 1];
                  const minOrder = previous ? (shotOrder.get(previous.endShotId) ?? -1) + 1 : 0;
                  const maxOrder = next
                    ? (shotOrder.get(next.startShotId) ?? shotOptions.length) - 1
                    : shotOptions.length - 1;
                  return (
                    <VoiceOverCard
                      key={`${segment.id}-${segment.text}-${segment.textEdited}-${segment.startShotId}-${segment.endShotId}`}
                      segment={segment}
                      chapterId={chapterId}
                      shotOptions={shotOptions}
                      minOrder={minOrder}
                      maxOrder={maxOrder}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {scenes?.map((scene, sceneIdx) => {
            const isCollapsed = collapsed === null || collapsed.has(scene.id);
            const sceneVars = sceneColorVars(scene.index);
            return (
            <section
              key={scene.id}
              ref={(el) => {
                if (el) sceneRefs.current.set(scene.id, el);
                else sceneRefs.current.delete(scene.id);
              }}
              // --scene-hue is set here so the header, the badge and every shot
              // pill inside this card all read the same scene color.
              style={sceneVars}
              className={`mb-4.5 overflow-hidden rounded-xl border bg-panel-2 shadow-sm last:mb-0 ${
                isCollapsed ? "border-line" : SCENE_BORDER_CLASS
              }`}
            >
              {/* The header's bottom rule only exists to separate it from the shot
                  list; collapsed there is no list under it, and the rule read as a
                  stray second border inside the card. */}
              <div
                className={`flex w-full items-center gap-2.5 px-3 py-3.5 md:px-4.5 md:py-4 ${
                  isCollapsed ? "bg-sunken" : `border-b ${SCENE_BORDER_CLASS} ${SCENE_SURFACE_CLASS}`
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left md:gap-3.5"
                >
                  {/* Not AccentTag: its own bg-accent-dim/text-accent would collide with the
                      per-scene hue, and which class wins is decided by CSS order, not by
                      the order they are listed here. */}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tracking-normal normal-case md:px-2.5 md:py-1 md:text-xs ${SCENE_BADGE_CLASS}`}
                  >
                    {scene.index}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] leading-normal font-semibold md:text-[15px]">{scene.slug ?? scene.title}</h3>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium md:px-2.5 md:py-1 md:text-[10.5px] ${
                        isCollapsed ? "border-line-2 bg-chip text-fg-2" : SCENE_CHIP_CLASS
                      }`}
                    >
                      {scene.shots.length} shots
                    </span>
                  </div>
                </button>
                {/* shrink-0: the wrapper is a flex child next to a flex-1 button and
                    was being squeezed, clipping the trigger against the card's
                    rounded edge. floatingStrategy="fixed": the section is
                    overflow-hidden, which would otherwise clip the open menu. */}
                <Menu
                  className="mr-0.5 shrink-0"
                  floatingStrategy="fixed"
                  placement="bottom-end"
                  menuClassName="w-[210px] rounded-[10px] border border-line bg-panel-2 shadow-[0_12px_30px_rgba(0,0,0,.5)] py-1"
                >
                  <MenuTrigger>
                    {({ toggleMenu }) => (
                      <MiniButton
                        ghost
                        className="!h-8 !w-8 !min-w-0 shrink-0 cursor-pointer justify-center !p-0"
                        onClick={toggleMenu}
                        disabled={generating || regeneratingSceneId !== null}
                        aria-label={`More actions for scene ${scene.index}`}
                        title="More actions"
                      >
                        {regeneratingSceneId === scene.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <MoreVertical size={14} />
                        )}
                      </MiniButton>
                    )}
                  </MenuTrigger>
                  {/* One entry per coverage size. A regeneration never sees the
                      shots it replaces, so without a target the new take drifts
                      longer every time — see lib/constants/coverage-modes.ts. */}
                  <div className="px-3 pt-1 pb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-fg-3">
                    Regenerate scene
                  </div>
                  {COVERAGE_MODES.map((mode) => (
                    <MenuItem
                      key={mode}
                      disabled={generating || regeneratingSceneId !== null}
                      onClick={() => confirmRegenerateScene(scene, mode)}
                    >
                      <span className="flex items-center gap-2 text-[13px]">
                        {mode === "tighter" ? (
                          <Minus size={14} />
                        ) : mode === "more" ? (
                          <Plus size={14} />
                        ) : mode === "free" ? (
                          <Sparkles size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        {COVERAGE_MODE_LABELS[mode]}
                      </span>
                    </MenuItem>
                  ))}
                </Menu>
              </div>
              {!isCollapsed && (
              <div className="flex flex-col gap-3 px-3 py-3.5 md:px-4.5 md:py-4">
                {scene.lighting && (
                  <div className="flex items-start gap-1.5 text-[11px] text-fg-3 md:text-[11.5px]">
                    <Sun size={12} className="mt-[3px] shrink-0" />
                    <span>{scene.lighting}</span>
                  </div>
                )}
                {scene.shots.map((shot, shotIdx) => {
                  const referenceHints = characterReferenceHints(scenes, sceneIdx, shotIdx);
                  const coveringVoiceOvers = voiceOversForShot(shot.id);

                  const shotNumber = `${scene.index}.${shot.index}`;

                  return (
                  <div
                    key={shot.id}
                    id={`shot-${shot.id}`}
                    className={`scroll-mt-4 rounded-[10px] border bg-panel-3 p-3 shadow-sm transition-shadow md:p-3.5 ${
                      shot.id === lastCopiedShotId ? "border-ok" : "border-line"
                    }`}
                  >
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1.5 md:gap-2.5">
                        <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10.5px] md:px-2 md:text-[11.5px] ${SCENE_PILL_CLASS}`}>
                          {shotNumber}
                        </span>
                        <MiniButton
                          ghost
                          className="!h-5.5 !w-5.5 !p-0"
                          onClick={() => copyText(shotNumber, "Shot number")}
                          title="Copy shot number"
                        >
                          <Copy size={12} />
                        </MiniButton>
                        {/* Plain text, not tags: duration, ratio and which prompt is
                            showing are glanceable facts, and outlining each one made
                            the row read as a toolbar. The view is last because it is
                            the one that changes under the reader, from the toolbar
                            toggle — and it reads the RESOLVED view, not the tab, since
                            a shot with no video prompt falls back to its start frame. */}
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg-2 md:text-[12px]">
                          {shot.durationS != null && (
                            <span className="inline-flex items-center gap-1" title="Recommended clip duration">
                              <Clock size={12} className="text-fg-3" />
                              {shot.durationS}s
                            </span>
                          )}
                          {shot.durationS != null && shot.aspect && (
                            <span aria-hidden className="hidden md:inline">
                              ·
                            </span>
                          )}
                          {shot.aspect && <span className="hidden md:inline">{shot.aspect}</span>}
                          <span aria-hidden>·</span>
                          {/* Icon + colour, not a third word in the list: the mode is
                              chapter-wide, so every card carries the same text and
                              repeated identical words stop being read. A shape and a
                              colour survive that; a word does not. */}
                          {resolveShotView(promptTab, shot) === "video" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-accent">
                              <Video size={12} /> Video
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-style-badge">
                              <ImageIcon size={12} /> Image
                            </span>
                          )}
                        </span>
                        {coveringVoiceOvers.map((segment) => (
                          <AccentTag
                            key={segment.id}
                            className="inline-flex items-center gap-1 bg-style-badge-bg text-style-badge"
                          >
                            <Mic size={10} /> VO {String(segment.sourceIndex).padStart(2, "0")}
                          </AccentTag>
                        ))}
                      </div>
                      {(!!shot.assetsUsed.length || (!hintsHidden && !!referenceHints.length)) && (
                        // One attach block, one paperclip: the reference list and the
                        // continuity note are the same instruction, and opening both with
                        // the same icon read as two unrelated warnings.
                        <div className="mb-2 flex gap-1.5 text-[11px] md:text-[11.5px]">
                          <Paperclip size={12} className="mt-[3px] shrink-0 text-fg-3" />
                          <div className="min-w-0 flex-1">
                            {!!shot.assetsUsed.length && (
                              // Badges here, plain text for duration/ratio above: these
                              // name things that have to be ATTACHED before the prompt is
                              // used, so they are targets to check off, not facts to skim.
                              <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap">
                                {shot.assetsUsed.map((a) => (
                                  <span
                                    key={`${a.kind}-${a.name}`}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-2 bg-chip px-2 py-0.5 whitespace-nowrap text-fg-2 md:gap-1.5 md:px-2.5"
                                  >
                                    {a.kind === "character" ? (
                                      <User size={11} className="shrink-0 text-fg-3" />
                                    ) : a.kind === "location" ? (
                                      <MapPin size={11} className="shrink-0 text-fg-3" />
                                    ) : (
                                      <Package size={11} className="shrink-0 text-fg-3" />
                                    )}
                                    {a.name}
                                    {a.look && lookLabels.has(`${a.name}\u0000${a.look}`) && (
                                      <span className="text-fg-3">· {lookLabels.get(`${a.name}\u0000${a.look}`)}</span>
                                    )}
                                    {a.station && stationLabels.has(`${a.name}\u0000${a.station}`) && (
                                      <span className="text-fg-3">· {stationLabels.get(`${a.name}\u0000${a.station}`)}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {!hintsHidden &&
                              referenceHints.map((hint) => (
                                <div key={`${hint.sceneIndex}.${hint.shotIndex}`} className="mt-1 text-isnew">
                                  Also attach shot {hint.sceneIndex}.{hint.shotIndex}&apos;s image —{" "}
                                  {hint.names.join(" and ")} continuity.
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {/* Temporarily hidden from the UI - beat and the state ledger are still generated and stored. */}
                      {shot.beat && (
                        <div hidden className="mb-2 flex gap-1.5 text-[11.5px] text-fg-3">
                          <Target size={12} className="mt-[3px] shrink-0" />
                          <div>
                            <span className="text-fg-2">Beat:</span> {shot.beat}
                          </div>
                        </div>
                      )}
                      {(shot.startState || shot.endState) && (
                        <div hidden className="mb-2 flex gap-1.5 text-[11.5px] text-fg-3">
                          <GitCommitHorizontal size={12} className="mt-[3px] shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            {shot.startState && (
                              <div>
                                <span className="text-fg-2">Opens:</span> {shot.startState}
                              </div>
                            )}
                            {shot.endState && shot.endState !== shot.startState && (
                              <div>
                                <span className="text-fg-2">Ends:</span> {shot.endState}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Renders on the left, prompt on the right: the two are
                          read together — you are checking whether the image
                          matches the text — and stacking them meant scrolling
                          between them on a full-width card. Stacks back to one
                          column under sm, where a side column would leave the
                          prompt too narrow to read. */}
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="shrink-0 sm:w-44">
                          <AttachedImages
                            chapterId={chapterId}
                            link={{ shotId: shot.id }}
                            images={imagesByShot.get(shot.id) ?? []}
                            onUploaded={refetchImages}
                            label={`shot ${shotNumber}`}
                            max={1}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <ShotPrompts
                            shot={shot}
                            chapterId={chapterId}
                            styleContext={styleContext}
                            motionStyleId={story.motionStyleId}
                            lighting={scene.lighting}
                            tab={promptTab}
                            onCopied={() => markCopied(shot.id)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </section>
            );
          })}
        </Wrap>
      </Body>
    </>
  );
}
