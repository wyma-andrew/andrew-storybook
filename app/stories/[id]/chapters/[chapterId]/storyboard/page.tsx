"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Clapperboard, Paperclip, User, MapPin, Package, ChevronDown, Copy, Square, Loader2, MoreVertical, Pencil, Undo2, GitCommitHorizontal, Target, Mic, Gauge, Sun, Focus, Minus, Plus, Sparkles, MapPinned, X, Image as ImageIcon, Video } from "lucide-react";
import { ConfirmDialog, Menu, MenuItem, MenuTrigger, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, ToolbarLoadingButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";
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
import type { Scene, Shot, VoiceOverSegment } from "@/lib/api/types";

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
      <div className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
        {label}
        {edited && <Tag>Edited</Tag>}
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-line-2 bg-sunken p-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[120px] flex-1 text-[14px] leading-relaxed"
          />
        ) : (
          <div className="flex-1 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">{text}</div>
        )}
        <div className="flex shrink-0 flex-col gap-1.5">
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
  // shot, so both move the place marker to the same place.
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

  // A shot with no video prompt falls back to the start frame rather than
  // rendering an empty card — the chapter-wide tab must not blank out shots
  // that simply have nothing to show in that mode.
  const showVideo = tab === "video" && !!shot.videoPrompt;

  return (
    <>
      {showVideo ? (
        <PromptBox
          key={`video-${shot.id}-${shot.videoPrompt}-${shot.videoPromptEdited}`}
          label="Video Prompt"
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
          label={tab === "video" ? "Start Frame — no video prompt for this shot" : "Start Frame"}
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
      {/* Temporarily hidden from the UI - motionMode is still written and appended. */}
      {shot.videoPrompt && (
        <div hidden className="mt-2 rounded-lg border border-line-2 bg-sunken p-3">
          <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">
            <Gauge size={12} /> Motion · {motionStyle.name}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={activeMode}
              onChange={(value) => void write({ motionMode: value })}
              disabled={saving}
              wrapperClassName="sm:w-[190px]"
            >
              {motionModes.map((option) => (
                <SelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </Select>
            <p className="flex-1 text-[11.5px] text-fg-3">
              {motionModes.find((option) => option.value === activeMode)?.hint} · appended to the copied video prompt
            </p>
          </div>
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

      <div className="flex items-start gap-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[100px] flex-1 text-[14px] leading-relaxed"
          />
        ) : (
          <div className="min-h-10 flex-1 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-code">{segment.text}</div>
        )}
        <div className="flex shrink-0 flex-col gap-1.5">
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

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
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

function lastCopiedKey(chapterId: string) {
  return `storyboard-last-copied:${chapterId}`;
}

// Only the shot id is stored, never its number or label. Those are resolved
// from the live scene list on every render, so a marker pointing at a shot that
// no longer exists simply disappears instead of showing a stale "3.2". A scene
// regeneration deletes and reinserts its shots, so it clears the marker — which
// is right: the shots that were being walked are gone.
function readLastCopiedShot(chapterId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(lastCopiedKey(chapterId));
  } catch {
    return null;
  }
}

// Sits under the scrolling body, not in the toolbar. It only appears after the
// first copy, and at the top that arrival shoves the whole scroll region down
// mid-read — under the very card the user just clicked. It is also a navigation
// aid, not chrome, so it does not belong beside Regenerate.
//
// A place marker, not a progress readout: it answers "where was I and what's
// next", so it carries no
// count of what has been copied and no completion state — copying a shot again
// is a normal thing to do, and a tally would make it read as backwards motion.
function ShotPlaceMarker({
  current,
  next,
  onJump,
  onClear,
}: {
  current: { number: string; label: string | null };
  next: { number: string; label: string | null } | null;
  onJump: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-line bg-panel-2 px-5 py-2 text-[12px] text-fg-2">
      <MapPinned size={13} className="shrink-0 text-fg-3" />
      <span className="shrink-0">
        At shot <span className="font-mono text-fg">{current.number}</span>
      </span>
      {current.label && <span className="truncate text-fg-3">{current.label}</span>}
      <div className="flex-1" />
      {next ? (
        <MiniButton ghost onClick={onJump} className="shrink-0">
          Next <span className="font-mono">{next.number}</span>
          {next.label && <span className="hidden max-w-[220px] truncate text-fg-3 sm:inline">{next.label}</span>}
          <ArrowRight size={12} />
        </MiniButton>
      ) : (
        <span className="shrink-0 text-fg-3">End of chapter</span>
      )}
      <MiniButton ghost onClick={onClear} className="!h-5.5 !w-5.5 shrink-0 !p-0" title="Clear marker">
        <X size={12} />
      </MiniButton>
    </div>
  );
}

export default function StoryboardPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: scenes, trigger: refetchScenes } = useRead((api) =>
    api("chapters/:id/storyboard").GET({ params: { id: chapterId } })
  );
  const { data: voiceOvers, trigger: refetchVoiceOvers } = useRead((api) =>
    api("chapters/:id/voice-overs").GET({ params: { id: chapterId } })
  );
  const { trigger: generate, loading: generating, abort: abortGenerate } = useWrite((api) =>
    api("chapters/:id/storyboard/generate").POST()
  );
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

  // Last shot whose prompt was copied. Last copy wins outright, including a
  // copy of an earlier shot — going back is deliberate, so the marker follows.
  const [lastCopiedShotId, setLastCopiedShotId] = useState<string | null>(() => readLastCopiedShot(chapterId));

  function markCopied(shotId: string) {
    setLastCopiedShotId(shotId);
    try {
      localStorage.setItem(lastCopiedKey(chapterId), shotId);
    } catch {
      // Private window or blocked storage — the marker still works this session.
    }
  }

  function clearCopiedMark() {
    setLastCopiedShotId(null);
    try {
      localStorage.removeItem(lastCopiedKey(chapterId));
    } catch {
      // Same as above.
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
    const { data, error } = await generate({ params: { id: chapterId } });
    if (data) {
      refetchScenes();
      refetchVoiceOvers();
    }
    if (error) toast.error(error.error);
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
      label: `${scene.index}.${shot.index} — ${shot.label ?? scene.title ?? "Untitled shot"}`,
    }))
  ).map((shot, order) => ({ ...shot, order }));
  const shotOrder = new Map(shotOptions.map((shot) => [shot.id, shot.order]));

  // Flat chapter-order walk, used by the place marker to answer "what's next".
  const shotWalk = (scenes ?? []).flatMap((scene) =>
    scene.shots.map((shot) => ({
      id: shot.id,
      sceneId: scene.id,
      number: `${scene.index}.${shot.index}`,
      label: shot.label ?? null,
    }))
  );
  const markerPosition = lastCopiedShotId ? shotWalk.findIndex((s) => s.id === lastCopiedShotId) : -1;
  // -1 covers both "nothing copied yet" and "that shot no longer exists" — a
  // regenerated scene, or a chapter opened on another device.
  const markerCurrent = markerPosition === -1 ? null : shotWalk[markerPosition];
  const markerNext = markerPosition === -1 ? null : (shotWalk[markerPosition + 1] ?? null);

  function jumpToShot(target: { id: string; sceneId: string }) {
    // Scenes are an accordion, so the target's scene has to be the open one
    // before its shot can be scrolled to — and the shot only mounts once it is.
    setCollapsed((prev) => {
      const allIds = (scenes ?? []).map((s) => s.id);
      const alreadyOpen = prev !== null && !prev.has(target.sceneId);
      if (alreadyOpen) return prev;
      const next = new Set(allIds.filter((sceneId) => sceneId !== target.sceneId));
      try {
        localStorage.setItem(collapsedStorageKey(chapterId), JSON.stringify([...next]));
      } catch {
        // ignore (private browsing / storage disabled)
      }
      return next;
    });
    // Two frames: one for the scene to expand, one for its shots to lay out.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(`shot-${target.id}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-accent");
        setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1400);
      })
    );
  }

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
      <Frame>
        <Body>
          <Wrap wide>
            <div className="pt-6">
              <SkeletonCards count={3} label="Loading storyboard" columns="grid-cols-1" />
            </div>
          </Wrap>
        </Body>
      </Frame>
    );
  }

  const styleContext = resolveStyleContext(story.region, story.visualStyleId);

  return (
    <Frame>
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
          <ToolbarButton onClick={() => abortGenerate()} className="!text-danger">
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
                  ["start", "Image Prompt", ImageIcon],
                  ["video", "Video Prompt", Video],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changePromptTab(value)}
                  aria-pressed={promptTab === value}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-[5px] px-3 py-1 text-[12px] font-medium whitespace-nowrap ${
                    promptTab === value ? "bg-raised text-fg shadow-sm" : "text-fg-3 hover:text-fg"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <div className={toolbarSep} />
            {/* One comma-joined line, not three rules-separated cells: these are
                one reading of the chapter, and a divider between each made them
                look like three separate controls next to the actual ones. */}
            <span className="whitespace-nowrap">
              {sceneCount} scenes, {shotCount} shots, ~{totalDurationLabel} total
            </span>
          </>
        )}
      </Toolbar>

      <Body>
        <Wrap wide>
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

          {!!voiceOvers?.length && !!shotOptions.length && (
            <section className="mb-4.5 rounded-xl border border-style-badge-border bg-panel-2 p-4.5">
              <button
                type="button"
                onClick={toggleVoiceOver}
                className={`flex w-full cursor-pointer flex-wrap items-center gap-2 text-left ${voiceOverCollapsed ? "" : "mb-3.5"}`}
              >
                <Mic size={15} className="text-style-badge" />
                <h2 className="text-[14px] font-semibold">Voice Over</h2>
                <Tag>{voiceOvers.length} segments</Tag>
                <span className="text-[11.5px] text-fg-3 sm:ml-auto">Separate narration overlay · not added to video prompts</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-fg-3 transition-transform ${voiceOverCollapsed ? "-rotate-90" : ""}`}
                />
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
              className={`mb-4.5 overflow-hidden rounded-xl border bg-panel-2 shadow-sm ${
                isCollapsed ? "border-line" : SCENE_BORDER_CLASS
              }`}
            >
              {/* The header's bottom rule only exists to separate it from the shot
                  list; collapsed there is no list under it, and the rule read as a
                  stray second border inside the card. */}
              <div
                className={`flex w-full items-center gap-2.5 px-4.5 py-4 ${
                  isCollapsed ? "bg-sunken" : `border-b ${SCENE_BORDER_CLASS} ${SCENE_SURFACE_CLASS}`
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 text-left"
                >
                  {/* Not AccentTag: its own bg-accent-dim/text-accent would collide with the
                      per-scene hue, and which class wins is decided by CSS order, not by
                      the order they are listed here. */}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-bold tracking-normal normal-case ${SCENE_BADGE_CLASS}`}
                  >
                    {scene.index}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] leading-normal font-semibold">{scene.slug ?? scene.title}</h3>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${
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
              <div className="flex flex-col gap-3 px-4.5 py-4">
                {scene.lighting && (
                  <div className="flex items-start gap-1.5 text-[11.5px] text-fg-3">
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
                    className="scroll-mt-4 rounded-[10px] border border-line bg-panel-3 p-3.5 shadow-sm transition-shadow"
                  >
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2.5">
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[11.5px] ${SCENE_PILL_CLASS}`}>
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
                        {/* Plain text, not tags: duration and ratio are glanceable facts,
                            and outlining each one made the row read as a toolbar. */}
                        {(shot.durationS != null || shot.aspect) && (
                          <span className="text-[12px] font-medium text-fg-2">
                            {[shot.durationS != null ? `${shot.durationS}s` : null, shot.aspect]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {coveringVoiceOvers.map((segment) => (
                          <AccentTag
                            key={segment.id}
                            className="inline-flex items-center gap-1 bg-style-badge-bg text-style-badge"
                          >
                            <Mic size={10} /> VO {String(segment.sourceIndex).padStart(2, "0")}
                          </AccentTag>
                        ))}
                      </div>
                      {(!!shot.assetsUsed.length || !!referenceHints.length) && (
                        // One attach block, one paperclip: the reference list and the
                        // continuity note are the same instruction, and opening both with
                        // the same icon read as two unrelated warnings.
                        <div className="mb-2 flex gap-1.5 text-[11.5px]">
                          <Paperclip size={12} className="mt-[3px] shrink-0 text-fg-3" />
                          <div className="min-w-0 flex-1">
                            {!!shot.assetsUsed.length && (
                              // Badges here, plain text for duration/ratio above: these
                              // name things that have to be ATTACHED before the prompt is
                              // used, so they are targets to check off, not facts to skim.
                              <div className="flex flex-wrap items-center gap-1.5">
                                {shot.assetsUsed.map((a) => (
                                  <span
                                    key={`${a.kind}-${a.name}`}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-chip px-2.5 py-0.5 text-fg-2"
                                  >
                                    {a.kind === "character" ? (
                                      <User size={11} className="shrink-0 text-fg-3" />
                                    ) : a.kind === "location" ? (
                                      <MapPin size={11} className="shrink-0 text-fg-3" />
                                    ) : (
                                      <Package size={11} className="shrink-0 text-fg-3" />
                                    )}
                                    {a.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {referenceHints.map((hint) => (
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
                  );
                })}
              </div>
              )}
            </section>
            );
          })}
        </Wrap>
      </Body>

      {/* The marker takes the footer's slot rather than stacking above it — two
          bottom strips read as a wall, and a wordmark is the one thing here with
          nothing to say while the user is mid-walk. Clearing the marker restores it. */}
      {markerCurrent ? (
        <ShotPlaceMarker
          current={markerCurrent}
          next={markerNext}
          onJump={() => markerNext && jumpToShot(markerNext)}
          onClear={clearCopiedMark}
        />
      ) : (
        <Foot />
      )}
    </Frame>
  );
}
