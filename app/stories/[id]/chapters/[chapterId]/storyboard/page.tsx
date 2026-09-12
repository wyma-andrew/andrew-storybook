"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, ArrowRight, Clapperboard, Paperclip, User, MapPin, Package, ChevronDown, Copy, Square, Loader2, Pencil, Undo2, GitCommitHorizontal, Target, Mic, Gauge, Sun, Focus } from "lucide-react";
import { ConfirmDialog, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, MiniButton, MiniLoadingButton } from "@/components/ui/Button";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Toolbar, ToolbarButton, ToolbarLoadingButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { withStyle, withFrameDescription } from "@/lib/prompt-copy";
import { copyText } from "@/lib/copy";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import { MOTION_MODE_OPTIONS, resolveMotionStyle, resolveMotionText } from "@/lib/constants/motion-styles";
import { SCENE_BADGE_CLASS, SCENE_PILL_CLASS, sceneColorVars } from "@/lib/constants/scene-colors";
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
      <div className="flex items-start gap-3 rounded-lg border border-line-2 bg-[#080808] p-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[120px] flex-1 font-mono text-[12.5px]"
          />
        ) : (
          <div className="flex-1 font-mono text-[12.5px] whitespace-pre-wrap text-[#c2c2c2]">{text}</div>
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

function ShotPrompts({
  shot,
  chapterId,
  styleContext,
  motionStyleId,
  lighting,
}: {
  shot: Shot;
  chapterId: string;
  styleContext: string | null;
  motionStyleId: string;
  lighting: string | null;
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

  return (
    <>
      <PromptBox
        key={`start-${shot.id}-${shot.prompt}-${shot.promptEdited}`}
        label="Start Frame"
        text={shot.prompt}
        edited={shot.promptEdited}
        saving={saving}
        onCopy={() => copyText(withStyle(shot.prompt, styleContext, lighting, optics), "Start Frame prompt")}
        onSave={async (next) => void (await write({ prompt: next }))}
        onRestore={async () => void (await write({ prompt: null }))}
      />
      {shot.videoPrompt && (
        <PromptBox
          key={`video-${shot.id}-${shot.videoPrompt}-${shot.videoPromptEdited}`}
          label="Video Prompt"
          text={shot.videoPrompt}
          edited={shot.videoPromptEdited}
          saving={saving}
          onCopy={() =>
            copyText(
              withFrameDescription(shot.videoPrompt!, shot.prompt, styleContext, motionText, lighting, optics),
              "Video prompt"
            )
          }
          onSave={async (next) => void (await write({ videoPrompt: next }))}
          onRestore={async () => void (await write({ videoPrompt: null }))}
        />
      )}
      {/* Temporarily hidden from the UI - the picker still writes shotScale and the
          optics line is still composed into copied prompts. */}
      <div hidden className="mt-2 rounded-lg border border-line-2 bg-[#080808] p-3">
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
        <div hidden className="mt-2 rounded-lg border border-line-2 bg-[#080808] p-3">
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

// Shot labels ("1.2 — Close reaction · Child in arms") overflow the Select
// trigger. GeckoUI has no prop for the value span, and its own styles rule out
// truncation twice over: `__content` is `flex-wrap: wrap; overflow-x: scroll`,
// and `__value` is `display: flex`, which makes `truncate` a no-op. Override
// both through `wrapperClassName`.
//
// `String.raw` is required, not style: a bare `_` in a Tailwind arbitrary
// variant means a space, so the underscores have to be backslash-escaped — and
// Tailwind generates utilities by scanning this file's raw text, so a normal
// string literal would register a class with two backslashes while the runtime
// value has one, and nothing would match.
const TRUNCATE_SELECT_VALUE = String.raw`[&_.GeckoUISelectButton\_\_content]:flex-nowrap [&_.GeckoUISelectButton\_\_content]:overflow-hidden [&_.GeckoUISelectButton\_\_value]:block [&_.GeckoUISelectButton\_\_value]:min-w-0 [&_.GeckoUISelectButton\_\_value]:truncate`;

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
    <div className="rounded-[10px] border border-line bg-[#0c0c0c] p-3.5">
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
            className="min-h-[100px] flex-1 font-mono text-[12.5px]"
          />
        ) : (
          <div className="min-h-10 flex-1 whitespace-pre-wrap text-[13px] text-[#cfcfcf]">{segment.text}</div>
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

function readCollapsedScenes(chapterId: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = localStorage.getItem(collapsedStorageKey(chapterId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
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

  // Default open for every scene; a scene id in this set is collapsed.
  // Persisted per-chapter in localStorage so a viewer's fold state survives reloads.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsedScenes(chapterId));

  const [voiceOverCollapsed, setVoiceOverCollapsed] = useState<boolean>(() => readVoiceOverCollapsed(chapterId));

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
      const wasCollapsed = prev.has(sceneId);
      const allIds = (scenes ?? []).map((s) => s.id);
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

  function confirmRegenerateScene(scene: Scene) {
    ConfirmDialog.show({
      title: `Regenerate scene ${scene.index}?`,
      content:
        "Re-shoots only this scene against the script, keeping every other scene. Its current shots and any prompt edits in it are replaced, and Voice Over ranges are remapped across the chapter — narration text edits are discarded. Cannot be undone.",
      confirmButtonLabel: "Regenerate scene",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        dismiss();
        setRegeneratingSceneId(scene.id);
        const { data, error } = await regenerateScene({ params: { id: scene.id } });
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

  function voiceOversForShot(shotId: string) {
    const order = shotOrder.get(shotId);
    if (order === undefined) return [];
    return (voiceOvers ?? []).filter((segment) => {
      const start = shotOrder.get(segment.startShotId);
      const end = shotOrder.get(segment.endShotId);
      return start !== undefined && end !== undefined && order >= start && order <= end;
    });
  }

  if (!story || !chapter) return null;

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
        <span className="mr-1.5 text-fg-3">Storyboard:</span>
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
            <span>{sceneCount} scenes</span>
            <div className={toolbarSep} />
            <span>{shotCount} shots</span>
            <div className={toolbarSep} />
            <span>~{totalDurationLabel} total</span>
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
                className={`flex w-full flex-wrap items-center gap-2 text-left ${voiceOverCollapsed ? "" : "mb-3.5"}`}
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
            const isCollapsed = collapsed.has(scene.id);
            const sceneVars = sceneColorVars(scene.index);
            return (
            <section
              key={scene.id}
              ref={(el) => {
                if (el) sceneRefs.current.set(scene.id, el);
                else sceneRefs.current.delete(scene.id);
              }}
              className={`mb-4.5 overflow-hidden rounded-xl border bg-panel-2 ${
                isCollapsed ? "border-line" : "border-accent/50"
              }`}
            >
              <div
                className={`flex w-full items-center gap-2.5 border-b px-4.5 py-4 ${
                  isCollapsed ? "border-line bg-[#101010]" : "border-accent/30 bg-accent-dim"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                >
                  {/* Not AccentTag: its own bg-accent-dim/text-accent would collide with the
                      per-scene hue, and which class wins is decided by CSS order, not by
                      the order they are listed here. */}
                  <span
                    style={sceneVars}
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-bold tracking-normal normal-case ${SCENE_BADGE_CLASS}`}
                  >
                    SC {String(scene.index).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold">{scene.slug ?? scene.title}</h3>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    <Tag>{scene.shots.length} shots</Tag>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-fg-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </div>
                </button>
                <MiniLoadingButton
                  ghost
                  loading={regeneratingSceneId === scene.id}
                  disabled={generating || regeneratingSceneId !== null}
                  onClick={() => confirmRegenerateScene(scene)}
                  title="Regenerate this scene only"
                  className="shrink-0"
                >
                  <RefreshCw size={13} />
                </MiniLoadingButton>
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

                  const sceneName = scene.shots[0]?.label ?? scene.title;
                  const shotNumber = `${scene.index}.${shot.index}`;

                  return (
                  <div key={shot.id} className="rounded-[10px] border border-line bg-[#0c0c0c] p-3.5">
                    <div>
                      <div className="mb-2 flex flex-wrap items-baseline gap-2.5">
                        <span style={sceneVars} className={`rounded-full px-2 py-0.5 font-mono text-[11.5px] ${SCENE_PILL_CLASS}`}>
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
                        <b className="text-[13px] font-semibold">
                          {sceneName}
                          {shot.label && shot.label !== sceneName && <> · {shot.label}</>}
                        </b>
                        {shot.durationS != null && <Tag>{shot.durationS}s</Tag>}
                        {shot.aspect && <AccentTag>{shot.aspect}</AccentTag>}
                        {coveringVoiceOvers.map((segment) => (
                          <AccentTag
                            key={segment.id}
                            className="inline-flex items-center gap-1 bg-style-badge-bg text-style-badge"
                          >
                            <Mic size={10} /> VO {String(segment.sourceIndex).padStart(2, "0")}
                          </AccentTag>
                        ))}
                        {shot.camera && <span className="text-[11.5px] text-fg-3">{shot.camera}</span>}
                      </div>
                      {!!shot.assetsUsed.length && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
                          <Paperclip size={12} className="shrink-0" />
                          Attach:
                          {shot.assetsUsed.map((a) => (
                            <span
                              key={`${a.kind}-${a.name}`}
                              className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-[#101010]"
                            >
                              {a.kind === "character" ? <User size={11} /> : a.kind === "location" ? <MapPin size={11} /> : <Package size={11} />}
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {referenceHints.map((hint) => (
                        <div
                          key={`${hint.sceneIndex}.${hint.shotIndex}`}
                          className="mb-2 flex items-center gap-1.5 text-[11.5px] text-isnew"
                        >
                          <Paperclip size={12} className="shrink-0" />
                          Also attach shot {hint.sceneIndex}.{hint.shotIndex}&apos;s image —{" "}
                          {hint.names.join(" and ")} continuity.
                        </div>
                      ))}
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

      <Foot />
    </Frame>
  );
}
