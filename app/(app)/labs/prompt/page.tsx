"use client";

import { useState } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { ConfirmDialog, Dialog, Input, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { ArrowRight, ChevronDown, ChevronRight, Columns2, Copy, Eye, FlaskConical, Save, Play, RefreshCw, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { Button, LoadingButton, MiniButton } from "@/components/ui/Button";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import { Tag } from "@/components/ui/Tag";
import { useRead, useWrite } from "@/lib/spoosh";
import { copyText } from "@/lib/copy";
import { withAssetContext, withFrameDescription, withStyle } from "@/lib/prompt-copy";
import { resolveShotOptics } from "@/lib/constants/shot-scales";
import { MOTION_MODE_OPTIONS, resolveMotionStyle, resolveMotionText, type MotionMode } from "@/lib/constants/motion-styles";
import { resolveMotionMode } from "@/lib/motion";
import { SYSTEM_PROMPTS, locationViewPreset } from "@/lib/constants/system-prompts";
import { joinPromptParts, type PromptPart } from "@/lib/prompts/parts";
import { sceneScopePrompt } from "@/lib/prompts/storyboard";
import { COVERAGE_MODES, COVERAGE_MODE_LABELS, DEFAULT_COVERAGE_MODE, type CoverageMode } from "@/lib/constants/coverage-modes";
import {
  PROMPT_LAB_EFFORTS,
  PROMPT_LAB_MODELS,
  PROMPT_LAB_PASSES,
  applyOverrides,
  hasMotionOverrides,
  labSceneTarget,
  passLabel,
  promptOverrides,
  sceneRegenLabel,
  type ExtractedAssetsOutput,
  type PromptLabMotionOverrides,
  type PromptLabEffort,
  type PromptLabModel,
  type PromptLabPass,
  type PromptLabPreview,
  type PromptLabRun,
  type PromptLabRunSummary,
  type PromptLabVersion,
} from "@/lib/prompt-lab";
import type { ExtractedAsset, ExtractedCharacter, ExtractedLocation, GeneratedScene, GeneratedShot, GeneratedStoryboard } from "@/lib/openai";

const PASS_VALUES = PROMPT_LAB_PASSES.map((p) => p.value);

function formatTokens(n: number | null | undefined) {
  if (n == null) return "–";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatSeconds(ms: number | null) {
  return ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function runName(run: { label: string | null; createdAt: string }) {
  return run.label || formatTime(run.createdAt);
}

function Picker({
  storyId,
  chapterId,
  pass,
  onStory,
  onChapter,
  onPass,
}: {
  storyId: string | null;
  chapterId: string | null;
  pass: PromptLabPass;
  onStory: (id: string) => void;
  onChapter: (id: string) => void;
  onPass: (pass: PromptLabPass) => void;
}) {
  const { data: stories } = useRead((api) => api("stories").GET());
  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id: storyId ?? "" } }), {
    enabled: Boolean(storyId),
  });
  const chapters = storyId ? story?.chapters ?? [] : [];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <span className="text-xs text-fg-3">Story</span>
        <Select value={storyId ?? ""} onChange={(value) => onStory(value as string)} wrapperClassName="mt-1.5" placeholder="Pick a story">
          {(stories ?? []).map((s) => <SelectOption key={s.id} value={s.id} label={s.title} />)}
        </Select>
      </div>
      <div>
        <span className="text-xs text-fg-3">Chapter</span>
        <Select
          value={chapterId ?? ""}
          onChange={(value) => onChapter(value as string)}
          wrapperClassName="mt-1.5"
          placeholder="Pick a chapter"
          disabled={!chapters.length}
        >
          {chapters.map((c) => <SelectOption key={c.id} value={c.id} label={`${c.index}. ${c.title}`} />)}
        </Select>
      </div>
      <div>
        <span className="text-xs text-fg-3">Pass</span>
        <Select value={pass} onChange={(value) => onPass(value as PromptLabPass)} wrapperClassName="mt-1.5">
          {PROMPT_LAB_PASSES.map((p) => <SelectOption key={p.value} value={p.value} label={p.label} />)}
        </Select>
      </div>
    </div>
  );
}

function samePart(a: PromptPart | undefined, b: PromptPart) {
  return a?.key === b.key && a.text === b.text;
}

function PromptBlock({
  part,
  original,
  index,
  open,
  onToggle,
  onChange,
}: {
  part: PromptPart;
  original: PromptPart | undefined;
  index: number;
  open: boolean;
  onToggle: () => void;
  onChange: (text: string) => void;
}) {
  const edited = !samePart(original, part);
  return (
    <li className="border-t border-line">
      <div className="flex flex-wrap items-center gap-2 py-2 pr-4 pl-6">
        <Button variant="ghost" className="!px-1" onClick={onToggle}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-[13px]">
            <span className="text-fg-3">{index + 1}.</span> {part.label}
          </span>
        </Button>
        <Tag>{part.source}</Tag>
        <span className="text-xs text-fg-3">{part.text.length.toLocaleString()} chars</span>
        {edited && <Tag className="!border-warn !text-warn">Edited</Tag>}
        <div className="ml-auto flex gap-1.5">
          <MiniButton onClick={() => copyText(part.text, part.label)}><Copy size={13} /> Copy</MiniButton>
          {original && (
            <MiniButton onClick={() => onChange(original.text)} disabled={!edited}><RotateCcw size={13} /> Reset</MiniButton>
          )}
        </div>
      </div>
      {open && (
        <div className="pr-4 pb-3 pl-6">
          <Textarea
            value={part.text}
            onChange={(event) => onChange(event.target.value)}
            rows={Math.min(18, Math.max(4, Math.ceil(part.text.length / 140)))}
            className="font-mono text-xs leading-relaxed"
          />
        </div>
      )}
    </li>
  );
}

// For reading a prompt outside the app. Not what the pass sends — Copy raw is.
function labeledPrompt(parts: PromptPart[]) {
  return parts
    .map((p, i) => `===== ${i + 1}. ${p.label} (${p.source}) =====\n${p.text.trim()}`)
    .join("\n\n");
}

// One group per prompt, one child per block in the order they are joined.
function PromptGroup({
  title,
  parts,
  original,
  onChange,
  defaultOpen,
}: {
  title: string;
  parts: PromptPart[];
  original: PromptPart[];
  onChange: (parts: PromptPart[]) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openKeys, setOpenKeys] = useState<Set<number>>(new Set());
  const joined = joinPromptParts(parts);
  const edited = joined !== joinPromptParts(original);
  const editedCount = parts.filter((p, i) => !samePart(original[i], p)).length;
  const allOpen = openKeys.size === parts.length;

  function toggle(i: number) {
    const next = new Set(openKeys);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOpenKeys(next);
  }

  return (
    <section className="rounded-xl border border-line bg-panel-2">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button variant="ghost" className="!px-1" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="text-sm font-medium">{title}</span>
        </Button>
        <span className="text-xs text-fg-3">
          {parts.length} blocks · {joined.length.toLocaleString()} chars · ~{formatTokens(Math.round(joined.length / 4))} tokens
        </span>
        {edited && <Tag className="!border-warn !text-warn">{editedCount ? `${editedCount} edited` : "Edited"}</Tag>}
        <div className="ml-auto flex gap-1.5">
          {open && (
            <MiniButton onClick={() => setOpenKeys(allOpen ? new Set() : new Set(parts.map((_, i) => i)))}>
              {allOpen ? "Collapse all" : "Expand all"}
            </MiniButton>
          )}
          <MiniButton onClick={() => copyText(labeledPrompt(parts), title)}><Copy size={13} /> Copy all</MiniButton>
          <MiniButton onClick={() => copyText(joined, `${title} (raw)`)} title="Exactly what the pass sends, without block labels">
            <Copy size={13} /> Copy raw
          </MiniButton>
          <MiniButton onClick={() => onChange(original)} disabled={!edited}><RotateCcw size={13} /> Reset all</MiniButton>
        </div>
      </div>
      {open && (
        <ul>
          {parts.map((part, i) => (
            <PromptBlock
              key={`${part.key}-${i}`}
              part={part}
              original={original[i]?.key === part.key ? original[i] : undefined}
              index={i}
              open={openKeys.has(i)}
              onToggle={() => toggle(i)}
              onChange={(text) => onChange(parts.map((p, j) => (j === i ? { ...p, text } : p)))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ContextTags({ preview }: { preview: PromptLabPreview }) {
  const c = preview.context;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag>Region: {c.region}</Tag>
      <Tag>Style: {c.visualStyleId ?? "none"}</Tag>
      {preview.pass === "storyboard" && (
        <>
          <Tag>Format: {c.format}</Tag>
          <Tag>Aspect: {c.aspectRatio ?? "default"}</Tag>
          <Tag>Motion: {c.motionStyleId ?? "default"}</Tag>
          <Tag>Assets: {c.assetCount}</Tag>
        </>
      )}
    </div>
  );
}

function RunRow({
  run,
  versionName,
  viewing,
  comparing,
  onView,
  onCompare,
}: {
  run: PromptLabRunSummary;
  versionName: string | null;
  viewing: boolean;
  comparing: boolean;
  onView: () => void;
  onCompare: () => void;
}) {
  const { trigger: remove, loading: removing } = useWrite((api) => api("labs/prompt/runs/:id").DELETE());

  function handleDelete() {
    ConfirmDialog.show({
      title: "Delete this run?",
      content: "The run and its output will be deleted.",
      confirmButtonLabel: "Delete",
      onConfirm: async () => {
        const result = await remove({ params: { id: run.id } });
        if (result.error) toast.error(result.error.error);
      },
    });
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 ${
        viewing ? "border-accent bg-hover" : comparing ? "border-line-3 bg-hover" : "border-line"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{runName(run)}</span>
          {run.error && <Tag className="!border-danger-border !bg-danger-bg !text-danger">Failed</Tag>}
          {run.systemPromptEdited && <Tag>System edited</Tag>}
          {run.userPromptEdited && <Tag>User edited</Tag>}
          {run.assetRunId && <Tag>Lab assets</Tag>}
          {run.sceneRegen && <Tag>Re-shot {sceneRegenLabel(run.sceneRegen)}</Tag>}
          {versionName && <Tag>Version: {versionName}</Tag>}
        </div>
        <div className="mt-0.5 text-xs text-fg-3">
          {run.label ? `${formatTime(run.createdAt)} · ` : ""}
          {run.model} · effort {run.reasoningEffort ?? "none"} · {formatSeconds(run.latencyMs)} ·{" "}
          {formatTokens(run.usage?.totalTokens)} tokens · {run.outputSummary}
        </div>
      </div>
      <div className="flex gap-1.5">
        <MiniButton onClick={onView}>{viewing ? "Viewing" : "View"}</MiniButton>
        <MiniButton onClick={onCompare} disabled={viewing}>
          <Columns2 size={13} /> {comparing ? "Comparing" : "Compare"}
        </MiniButton>
        <MiniButton onClick={handleDelete} disabled={removing} aria-label="Delete run"><Trash2 size={13} /></MiniButton>
      </div>
    </li>
  );
}

function CopiedPrompt({ text, label }: { text: string; label: string }) {
  return (
    <>
      <div className="mt-2 flex justify-end">
        <MiniButton onClick={() => copyText(text, label)}><Copy size={13} /> Copy</MiniButton>
      </div>
      <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-sunken p-2.5 font-mono text-[11.5px] leading-relaxed text-fg-code">
        {text}
      </pre>
    </>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-3 text-xs text-fg-3">{children}</div>;
}

type MotionOverrides = Partial<Record<MotionMode, string>>;

// The two texts a shot is copied as, built the same way the storyboard page
// copies them, so the lab's copies match production's.
function shotCopyTexts(
  shot: GeneratedShot,
  styleContext: string | null,
  lighting: string,
  motionStyleId: string | null,
  motionOverrides: MotionOverrides
) {
  const optics = resolveShotOptics(shot.shotScale);
  const motionMode = resolveMotionMode(shot.motionMode, shot.videoPrompt, motionStyleId);
  const motionText = motionOverrides[motionMode] ?? resolveMotionText(motionStyleId, motionMode);
  return {
    motionMode,
    start: withStyle(shot.prompt, styleContext, lighting || null, optics),
    video: withFrameDescription(shot.videoPrompt, shot.prompt, styleContext, motionText, lighting || null, optics),
  };
}

function sceneCopyText(
  scene: GeneratedScene,
  styleContext: string | null,
  motionStyleId: string | null,
  motionOverrides: MotionOverrides
) {
  const shots = scene.shots.map((shot, i) => {
    const copies = shotCopyTexts(shot, styleContext, scene.lighting, motionStyleId, motionOverrides);
    return [`----- Shot ${i + 1}${shot.label ? ` · ${shot.label}` : ""} -----`, "[Start Frame prompt]", copies.start, "[Video prompt]", copies.video].join(
      "\n\n"
    );
  });
  const header = [`===== ${scene.title} =====`, scene.lighting && `Lighting: ${scene.lighting}`].filter(Boolean).join("\n");
  return [header, ...shots].join("\n\n");
}

function ShotCard({
  shot,
  index,
  styleContext,
  lighting,
  motionStyleId,
  motionOverrides,
}: {
  shot: GeneratedShot;
  index: number;
  styleContext: string | null;
  lighting: string;
  motionStyleId: string | null;
  motionOverrides: MotionOverrides;
}) {
  const { motionMode, start: copied, video: videoCopied } = shotCopyTexts(shot, styleContext, lighting, motionStyleId, motionOverrides);
  const [showVideo, setShowVideo] = useState(false);
  return (
    <article className="rounded-lg border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold">Shot {index + 1}</span>
        <span className="text-xs text-fg-2">{shot.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Tag>{shot.shotScale}</Tag>
        <Tag>{shot.camera}</Tag>
        <Tag>{shot.durationS}s</Tag>
        <Tag>Motion: {MOTION_MODE_OPTIONS.find((o) => o.value === motionMode)?.label}</Tag>
        {shot.assetsUsed.map((a) => (
          <Tag key={`${a.kind}-${a.name}`} title={[a.look, a.station].filter(Boolean).join(" · ") || undefined}>
            {a.name}
          </Tag>
        ))}
      </div>
      <CopiedPrompt text={copied} label="Start Frame prompt" />
      <Button variant="ghost" className="!mt-1 !px-1 !text-xs" onClick={() => setShowVideo(!showVideo)}>
        {showVideo ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Video prompt
      </Button>
      {showVideo && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">{shot.videoPrompt}</p>
          <CopiedPrompt text={videoCopied} label="Video prompt" />
        </>
      )}
    </article>
  );
}

function SceneColumn({
  scene,
  styleContext,
  motionStyleId,
  motionOverrides,
  reshot,
  onReshoot,
}: {
  scene: GeneratedScene | undefined;
  styleContext: string | null;
  motionStyleId: string | null;
  motionOverrides: MotionOverrides;
  reshot: boolean;
  onReshoot: () => void;
}) {
  if (!scene) return <Missing>No scene at this index.</Missing>;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{scene.title}</span>
            {reshot && <Tag className="!border-warn !text-warn">Re-shot</Tag>}
          </div>
          {scene.lighting && <div className="mt-0.5 text-xs text-fg-3">Lighting: {scene.lighting}</div>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <MiniButton onClick={onReshoot} title="Regenerate only this scene's shots, as the storyboard page does">
            <RefreshCw size={13} /> Re-shoot
          </MiniButton>
          <MiniButton onClick={() => copyText(sceneCopyText(scene, styleContext, motionStyleId, motionOverrides), scene.title || "Scene")}>
            <Copy size={13} /> Copy scene
          </MiniButton>
        </div>
      </div>
      {scene.shots.map((shot, i) => (
        <ShotCard
          key={i}
          shot={shot}
          index={i}
          styleContext={styleContext}
          lighting={scene.lighting}
          motionStyleId={motionStyleId}
          motionOverrides={motionOverrides}
        />
      ))}
    </div>
  );
}

function StoryboardOutput({
  runs,
  grid,
  motionEdits,
  onReshoot,
}: {
  runs: PromptLabRun[];
  grid: string;
  motionEdits: PromptLabMotionOverrides;
  onReshoot: (run: PromptLabRun, sceneIndex: number) => void;
}) {
  const outputs = runs.map((r) => r.output as GeneratedStoryboard | null);
  const sceneCount = Math.max(0, ...outputs.map((o) => o?.scenes.length ?? 0));
  return (
    <>
      <div className={grid}>
        {runs.map((r, j) => {
          const styleId = resolveMotionStyle(r.context.motionStyleId).id;
          const scenes = outputs[j]?.scenes ?? [];
          return (
            <div key={r.id} className="flex justify-end">
              <MiniButton
                disabled={!scenes.length}
                onClick={() =>
                  copyText(
                    scenes
                      .map((scene) => sceneCopyText(scene, r.context.styleContext, r.context.motionStyleId, motionEdits[styleId] ?? {}))
                      .join("\n\n"),
                    `${runName(r)} scenes`
                  )
                }
              >
                <Copy size={13} /> Copy all scenes
              </MiniButton>
            </div>
          );
        })}
      </div>
      {Array.from({ length: sceneCount }, (_, i) => (
        <section key={i}>
          <div className="mb-2 text-xs font-medium tracking-wider text-fg-3 uppercase">Scene {i + 1}</div>
          <div className={grid}>
            {runs.map((r, j) => (
              <SceneColumn
                key={r.id}
                scene={outputs[j]?.scenes[i]}
                styleContext={r.context.styleContext}
                motionStyleId={r.context.motionStyleId}
                motionOverrides={motionEdits[resolveMotionStyle(r.context.motionStyleId).id] ?? {}}
                reshot={r.context.sceneRegen?.sceneIndex === i + 1}
                onReshoot={() => onReshoot(r, i + 1)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

type AssetKind = "character" | "location" | "prop";
type AnyAsset = ExtractedAsset & Partial<Pick<ExtractedCharacter, "looks" | "isGroup">> & Partial<Pick<ExtractedLocation, "spaceKind">>;

const ASSET_SECTIONS: { kind: AssetKind; key: "characters" | "locations" | "props"; label: string }[] = [
  { kind: "character", key: "characters", label: "Characters" },
  { kind: "location", key: "locations", label: "Locations" },
  { kind: "prop", key: "props", label: "Props" },
];

// Same preset the Assets tab copies with for each kind, so the copy here is
// the text that would go to the image model.
function assetPreset(kind: AssetKind, asset: AnyAsset) {
  if (kind === "location") return locationViewPreset(asset.spaceKind);
  if (kind === "prop") return SYSTEM_PROMPTS.prop;
  return asset.isGroup ? SYSTEM_PROMPTS.characterGroup : SYSTEM_PROMPTS.character;
}

function AssetDetail({ kind, asset, copied, dismiss }: { kind: AssetKind; asset: AnyAsset; copied: string; dismiss: () => void }) {
  return (
    <div className="max-h-[80vh] overflow-auto">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{asset.name}</h3>
          <p className="mt-0.5 text-xs text-fg-2">{asset.meta}</p>
        </div>
        <MiniButton ghost onClick={dismiss} aria-label="Close"><X size={14} /></MiniButton>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Tag>{kind}</Tag>
        {asset.isGroup && <Tag>Group</Tag>}
        {asset.spaceKind && <Tag>{asset.spaceKind}</Tag>}
      </div>
      {asset.scenes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-fg-2">
          {asset.scenes.map((scene) => <li key={scene}>{scene}</li>)}
        </ul>
      )}
      <CopiedPrompt text={copied} label={`${asset.name} prompt`} />
      {!!asset.looks?.length && (
        <div className="mt-3 space-y-1.5">
          {asset.looks.map((look) => (
            <div key={look.key} className="rounded-md border border-line p-2 text-xs">
              <div className="font-medium">
                Look: {look.label} <span className="text-fg-3">({look.key}; scenes {look.scenes.join(", ") || "unspecified"})</span>
              </div>
              <p className="mt-1 leading-relaxed text-fg-2">{look.prompt}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-xs font-medium text-fg-3">Evidence</div>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{asset.evidence}</p>
    </div>
  );
}

function AssetCard({ kind, asset, styleContext }: { kind: AssetKind; asset: AnyAsset | undefined; styleContext: string | null }) {
  if (!asset) return <Missing>Not in this run.</Missing>;
  const found = asset;
  const copied = withAssetContext(found.realPrompt, assetPreset(kind, found), styleContext);

  function openDetail() {
    Dialog.show({
      className: "w-[calc(100vw-2rem)] max-w-[720px]",
      content: ({ dismiss }) => <AssetDetail kind={kind} asset={found} copied={copied} dismiss={dismiss} />,
    });
  }

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-line bg-panel p-3">
      <div className="truncate text-sm font-semibold" title={found.name}>{found.name}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-fg-2">{found.meta}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {found.isGroup && <Tag>Group</Tag>}
        {found.spaceKind && <Tag>{found.spaceKind}</Tag>}
        {found.scenes.length > 0 && <Tag>{found.scenes.length} {found.scenes.length === 1 ? "scene" : "scenes"}</Tag>}
        {!!found.looks?.length && <Tag>{found.looks.length} looks</Tag>}
      </div>
      <div className="mt-auto flex gap-1.5 pt-3">
        <MiniButton onClick={openDetail}><Eye size={13} /> View</MiniButton>
        <MiniButton onClick={() => copyText(copied, `${found.name} prompt`)}><Copy size={13} /> Copy</MiniButton>
      </div>
    </article>
  );
}

// Same layout as sceneCopyText: a section header per kind, then each asset under
// its own name with the prompt the Assets tab would copy for it.
function assetsCopyText(output: ExtractedAssetsOutput, styleContext: string | null) {
  return ASSET_SECTIONS.flatMap(({ kind, key, label }) => {
    const list = (output[key] ?? []) as AnyAsset[];
    if (!list.length) return [];
    const items = list.map((asset) =>
      [`----- ${asset.name} -----`, withAssetContext(asset.realPrompt, assetPreset(kind, asset), styleContext)].join("\n\n")
    );
    return [[`===== ${label} =====`, ...items].join("\n\n")];
  }).join("\n\n");
}

function AssetsOutput({ runs, grid }: { runs: PromptLabRun[]; grid: string }) {
  const outputs = runs.map((r) => r.output as ExtractedAssetsOutput | null);
  const comparing = runs.length > 1;
  return (
    <>
      <div className={grid}>
        {runs.map((r, j) => (
          <div key={r.id} className="flex justify-end">
            <MiniButton
              disabled={!outputs[j]}
              onClick={() => copyText(assetsCopyText(outputs[j]!, r.context.styleContext), `${runName(r)} assets`)}
            >
              <Copy size={13} /> Copy all assets
            </MiniButton>
          </div>
        ))}
      </div>
      {ASSET_SECTIONS.map(({ kind, key, label }) => {
        const lists = outputs.map((o) => (o?.[key] ?? []) as AnyAsset[]);
        const names = [...new Set(lists.flatMap((list) => list.map((a) => a.name)))];
        if (!names.length) return null;
        return (
          <section key={kind}>
            <div className="mb-2 text-xs font-medium tracking-wider text-fg-3 uppercase">
              {label} <span className="normal-case">({lists.map((l) => l.length).join(" vs ")})</span>
            </div>
            {comparing ? (
              <div className="space-y-2">
                {names.map((name) => (
                  <div key={name} className={grid}>
                    {runs.map((r, j) => (
                      <AssetCard key={r.id} kind={kind} asset={lists[j].find((a) => a.name === name)} styleContext={r.context.styleContext} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {lists[0].map((asset) => (
                  <AssetCard key={asset.name} kind={kind} asset={asset} styleContext={runs[0].context.styleContext} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function RunMeta({
  run,
  onLoadPrompts,
  onUseAssets,
}: {
  run: PromptLabRun;
  onLoadPrompts: (run: PromptLabRun) => void;
  onUseAssets: (run: PromptLabRun) => void;
}) {
  const [show, setShow] = useState<"raw" | "analysis" | null>(null);
  const analysis = run.pass === "extract_assets" ? (run.output as ExtractedAssetsOutput | null)?.storyAnalysis : null;
  const toggle = (value: "raw" | "analysis") => setShow(show === value ? null : value);
  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{runName(run)}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {run.pass === "extract_assets" && run.output && (
            <MiniButton onClick={() => onUseAssets(run)}><ArrowRight size={13} /> Use as storyboard input</MiniButton>
          )}
          <MiniButton onClick={() => onLoadPrompts(run)} title={run.context.sceneRegen ? "Loads the storyboard prompt without the scene scope block" : undefined}>
            <Upload size={13} /> Load prompts
          </MiniButton>
          {analysis != null && <MiniButton onClick={() => toggle("analysis")}>Story analysis</MiniButton>}
          <MiniButton onClick={() => toggle("raw")}>Raw JSON</MiniButton>
        </div>
      </div>
      {run.context.sceneRegen && <div className="mt-1 text-xs text-fg-2">Re-shot {sceneRegenLabel(run.context.sceneRegen)}</div>}
      <div className="mt-1 text-xs text-fg-3">
        {run.model} · effort {run.reasoningEffort ?? "none"} · {formatSeconds(run.latencyMs)} · in{" "}
        {formatTokens(run.usage?.promptTokens)} / out {formatTokens(run.usage?.completionTokens)}
        {run.usage?.reasoningTokens ? ` (reasoning ${formatTokens(run.usage.reasoningTokens)})` : ""}
      </div>
      {run.error && <p className="mt-2 text-xs text-danger">{run.error}</p>}
      {show && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-sunken p-2.5 font-mono text-[11px] whitespace-pre-wrap text-fg-code">
          {show === "raw" ? run.rawOutput ?? "No output" : JSON.stringify(analysis, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Experiment only: edits live in this page's state and are never saved to code
// or to a run. They reach the Video prompt copy of shots with the same style.
function MotionPresetEditor({
  styleId,
  edits,
  onChange,
}: {
  styleId: string | null;
  edits: MotionOverrides;
  onChange: (next: MotionOverrides) => void;
}) {
  const style = resolveMotionStyle(styleId);
  const modes = MOTION_MODE_OPTIONS.filter((option) => style.allowedModes.includes(option.value));
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-3 text-xs font-medium tracking-wider text-fg-3 uppercase">Motion preset · {style.name}</div>
      <div className="space-y-3">
        {modes.map((option) => {
          const edited = option.value in edits;
          return (
            <div key={option.value}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  {option.label}
                  {edited && <span className="ml-1.5 font-normal text-warn">edited</span>}
                </span>
                {edited && (
                  <MiniButton
                    onClick={() => {
                      const next = { ...edits };
                      delete next[option.value];
                      onChange(next);
                    }}
                  >
                    <RotateCcw size={13} /> Reset
                  </MiniButton>
                )}
              </div>
              <Textarea
                rows={4}
                value={edits[option.value] ?? style.text[option.value]}
                onChange={(event) => onChange({ ...edits, [option.value]: event.target.value })}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function canonMotion(overrides: PromptLabMotionOverrides) {
  return Object.entries(overrides)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([styleId, modes]) => [styleId, Object.entries(modes ?? {}).sort(([a], [b]) => a.localeCompare(b))] as const)
    .filter(([, modes]) => modes.length > 0);
}

function sameMotion(a: PromptLabMotionOverrides, b: PromptLabMotionOverrides) {
  return JSON.stringify(canonMotion(a)) === JSON.stringify(canonMotion(b));
}

function RunOutput({
  runId,
  compareId,
  motionEdits,
  onMotionChange,
  onLoadPrompts,
  onUseAssets,
  onReshoot,
}: {
  runId: string;
  compareId: string | null;
  motionEdits: PromptLabMotionOverrides;
  onMotionChange: (next: PromptLabMotionOverrides) => void;
  onLoadPrompts: (run: PromptLabRun) => void;
  onUseAssets: (run: PromptLabRun) => void;
  onReshoot: (run: PromptLabRun, sceneIndex: number) => void;
}) {
  const { data: run } = useRead((api) => api("labs/prompt/runs/:id").GET({ params: { id: runId } }));
  const { data: other } = useRead((api) => api("labs/prompt/runs/:id").GET({ params: { id: compareId ?? "" } }), {
    enabled: Boolean(compareId),
  });
  if (!run) return <p className="text-sm text-fg-3">Loading run…</p>;

  const runs = compareId && other ? [run, other] : [run];
  const grid = runs.length === 2 ? "grid gap-4 md:grid-cols-2" : "grid gap-4";
  const storyboard = run.pass !== "extract_assets";
  const styleId = resolveMotionStyle(run.context.motionStyleId).id;

  return (
    <div className="space-y-5">
      <div className={grid}>
        {runs.map((r) => <RunMeta key={r.id} run={r} onLoadPrompts={onLoadPrompts} onUseAssets={onUseAssets} />)}
      </div>
      {storyboard && (
        <MotionPresetEditor
          styleId={run.context.motionStyleId}
          edits={motionEdits[styleId] ?? {}}
          onChange={(next) => onMotionChange({ ...motionEdits, [styleId]: next })}
        />
      )}
      {storyboard ? (
        <StoryboardOutput runs={runs} grid={grid} motionEdits={motionEdits} onReshoot={onReshoot} />
      ) : (
        <AssetsOutput runs={runs} grid={grid} />
      )}
    </div>
  );
}

function SaveVersionDialog({ onSave, dismiss }: { onSave: (name: string) => Promise<boolean>; dismiss: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  async function handleSave() {
    setSaving(true);
    const ok = await onSave(name.trim());
    setSaving(false);
    if (ok) dismiss();
  }
  return (
    <div>
      <h3 className="text-base font-semibold">Save as new version</h3>
      <p className="mt-1 text-xs text-fg-3">
        Only the edited system-prompt blocks and motion preset text are saved, so the version can be applied to any chapter of any story.
      </p>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. parent-site v1" className="mt-3" autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={dismiss}>Cancel</Button>
        <LoadingButton variant="primary" loading={saving} onClick={handleSave} disabled={!name.trim()}>
          <Save size={15} /> Save
        </LoadingButton>
      </div>
    </div>
  );
}

function VersionBar({
  pass,
  versions,
  version,
  overrides,
  motionOverrides,
  skipped,
  dirty,
  onSelect,
}: {
  pass: PromptLabPass;
  versions: PromptLabVersion[];
  version: PromptLabVersion | null;
  overrides: ReturnType<typeof promptOverrides>;
  motionOverrides: PromptLabMotionOverrides;
  skipped: string[];
  dirty: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { trigger: create } = useWrite((api) => api("labs/prompt/passes/:pass/versions").POST());
  const { trigger: update, loading: updating } = useWrite((api) => api("labs/prompt/versions/:id").PATCH());
  const { trigger: remove } = useWrite((api) => api("labs/prompt/versions/:id").DELETE());
  const canSave = overrides.length > 0 || hasMotionOverrides(motionOverrides);

  function select(value: string) {
    const id = value === "code" ? null : value;
    if (id === (version?.id ?? null)) return;
    if (!dirty) return onSelect(id);
    ConfirmDialog.show({
      title: "Discard unsaved block edits?",
      content: "Switching version reloads the prompt. Edits not saved to a version or a run are lost.",
      confirmButtonLabel: "Switch",
      onConfirm: ({ dismiss }) => {
        dismiss();
        onSelect(id);
      },
    });
  }

  function openSave() {
    Dialog.show({
      className: "w-[90vw] !max-w-md",
      content: ({ dismiss }) => (
        <SaveVersionDialog
          dismiss={dismiss}
          onSave={async (name) => {
            const result = await create({ params: { pass }, body: { name, overrides, motionOverrides } });
            if (result.error) {
              toast.error(result.error.error);
              return false;
            }
            toast.success(`Saved "${name}"`);
            if (result.data) onSelect(result.data.id);
            return true;
          }}
        />
      ),
    });
  }

  async function handleUpdate() {
    if (!version) return;
    const result = await update({ params: { id: version.id }, body: { overrides, motionOverrides } });
    if (result.error) toast.error(result.error.error);
    else toast.success(`Updated "${version.name}"`);
  }

  function handleDelete() {
    if (!version) return;
    ConfirmDialog.show({
      title: `Delete version "${version.name}"?`,
      content: "Runs made with it keep their saved prompts.",
      confirmButtonLabel: "Delete",
      onConfirm: async ({ dismiss }) => {
        dismiss();
        const result = await remove({ params: { id: version.id } });
        if (result.error) toast.error(result.error.error);
        else onSelect(null);
      },
    });
  }

  return (
    <section className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <span className="text-xs text-fg-3">Prompt version</span>
          <Select value={version?.id ?? "code"} onChange={(value) => select(value as string)} wrapperClassName="mt-1.5">
            <SelectOption value="code" label="Code default" />
            {versions.map((v) => (
              <SelectOption
              key={v.id}
              value={v.id}
              label={`${v.name} (${v.overrides.length} ${v.overrides.length === 1 ? "block" : "blocks"}${hasMotionOverrides(v.motionOverrides) ? " + motion" : ""})`}
            />
            ))}
          </Select>
        </div>
        <Button onClick={openSave} disabled={!canSave}><Save size={15} /> Save as new</Button>
        {version && (
          <>
            <LoadingButton loading={updating} onClick={handleUpdate} disabled={!dirty || !canSave}>
              Update &quot;{version.name}&quot;
            </LoadingButton>
            <Button variant="danger" onClick={handleDelete}><Trash2 size={15} /> Delete</Button>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-fg-3">
        A version keeps only edited system-prompt blocks and motion preset text, and swaps them into whichever chapter is open. Style,
        region and the user message still come from that chapter.
      </p>
      {skipped.length > 0 && (
        <p className="mt-1.5 text-xs text-warn">Not in this chapter&apos;s prompt, so not applied: {skipped.join(", ")}</p>
      )}
    </section>
  );
}

function ReshootDialog({
  source,
  sceneIndex,
  model,
  effort,
  dismiss,
  onRun,
}: {
  source: PromptLabRun;
  sceneIndex: number;
  model: PromptLabModel;
  effort: PromptLabEffort;
  dismiss: () => void;
  onRun: (coverageMode: CoverageMode, sceneScope: string, label: string) => Promise<boolean>;
}) {
  const output = source.output as GeneratedStoryboard;
  const [coverageMode, setCoverageMode] = useState<CoverageMode>(DEFAULT_COVERAGE_MODE);
  const defaultScope = sceneScopePrompt(labSceneTarget(output, sceneIndex, coverageMode));
  const [editedScope, setEditedScope] = useState<string | null>(null);
  const scope = editedScope ?? defaultScope;
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    const ok = await onRun(coverageMode, scope, label);
    setRunning(false);
    if (ok) dismiss();
  }

  return (
    <div className="max-h-[85vh] overflow-auto">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Re-shoot scene {sceneIndex}: {output.scenes[sceneIndex - 1]?.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            Sends the system prompt and user message in the editor, plus the scope block below. Its neighbouring states, site map and
            lighting come from run <span className="font-medium text-fg-2">{runName(source)}</span>. The result is a new run that is
            this run with only scene {sceneIndex} replaced, opened in compare against it.
          </p>
        </div>
        <MiniButton ghost onClick={dismiss} aria-label="Close"><X size={14} /></MiniButton>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <span className="text-xs text-fg-3">Coverage</span>
          <Select value={coverageMode} onChange={(value) => setCoverageMode(value as CoverageMode)} wrapperClassName="mt-1.5">
            {COVERAGE_MODES.map((m) => <SelectOption key={m} value={m} label={COVERAGE_MODE_LABELS[m]} />)}
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <span className="text-xs text-fg-3">Label</span>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. scene 3, tighter" className="mt-1.5" />
        </div>
      </div>
      <div className="mt-3 mb-1 flex items-center gap-2">
        <span className="text-xs font-medium">Single scene scope</span>
        {editedScope !== null && <Tag className="!border-warn !text-warn">Edited</Tag>}
        <div className="ml-auto flex gap-1.5">
          <MiniButton onClick={() => copyText(scope, "Scene scope")}><Copy size={13} /> Copy</MiniButton>
          <MiniButton onClick={() => setEditedScope(null)} disabled={editedScope === null}><RotateCcw size={13} /> Reset</MiniButton>
        </div>
      </div>
      <Textarea
        value={scope}
        onChange={(event) => setEditedScope(event.target.value)}
        rows={14}
        className="font-mono text-xs leading-relaxed"
      />
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-fg-3">{model} · effort {effort}</span>
        <Button onClick={dismiss}>Cancel</Button>
        <LoadingButton variant="primary" loading={running} loadingText="Re-shooting…" onClick={handleRun}>
          <RefreshCw size={15} /> Re-shoot
        </LoadingButton>
      </div>
    </div>
  );
}

function Workbench({
  chapterId,
  preview,
  versions,
  version,
  onSelectVersion,
  onUseAssets,
  onClearAssets,
}: {
  chapterId: string;
  preview: PromptLabPreview;
  versions: PromptLabVersion[];
  version: PromptLabVersion | null;
  onSelectVersion: (id: string | null) => void;
  onUseAssets: (run: PromptLabRun) => void;
  onClearAssets: () => void;
}) {
  const title = passLabel(preview.pass);
  const applied = version ? applyOverrides(preview.systemParts, version.overrides) : { parts: preview.systemParts, skipped: [] };
  const [systemParts, setSystemParts] = useState(applied.parts);
  const overrides = promptOverrides(systemParts, preview.systemParts);
  const [motionEdits, setMotionEdits] = useState<PromptLabMotionOverrides>(version?.motionOverrides ?? {});
  const dirty =
    joinPromptParts(systemParts) !== joinPromptParts(applied.parts) || !sameMotion(motionEdits, version?.motionOverrides ?? {});
  const [userParts, setUserParts] = useState(preview.userParts);
  const [model, setModel] = useState<PromptLabModel>(preview.model);
  const [effort, setEffort] = useState<PromptLabEffort>("default");
  const [label, setLabel] = useState("");
  const [runId, setRunId] = useQueryState("run", parseAsString);
  const [compareId, setCompareId] = useQueryState("compare", parseAsString);

  const { data: allRuns } = useRead((api) => api("labs/prompt/chapters/:id/runs").GET({ params: { id: chapterId } }));
  const runs = allRuns?.filter((r) => r.pass === preview.pass);
  const assetRun = preview.assetRunId ? allRuns?.find((r) => r.id === preview.assetRunId) : null;
  const { trigger: run, loading: running } = useWrite((api) => api("labs/prompt/runs").POST());
  const { trigger: reshoot } = useWrite((api) => api("labs/prompt/runs/:id/scenes/:index").POST());

  async function handleRun() {
    const result = await run({
      body: {
        chapterId,
        pass: preview.pass,
        assetRunId: preview.assetRunId,
        versionId: version?.id ?? null,
        label,
        model,
        reasoningEffort: effort,
        systemParts,
        userParts,
      },
    });
    if (result.error) {
      toast.error(result.error.error);
      return;
    }
    if (result.data?.error) toast.error(`Run failed: ${result.data.error}`);
    else toast.success("Run finished");
    setLabel("");
    setCompareId(null);
    setRunId(result.data?.id ?? null);
  }

  function openReshoot(source: PromptLabRun, sceneIndex: number) {
    Dialog.show({
      className: "w-[calc(100vw-2rem)] max-w-[760px]",
      content: ({ dismiss }) => (
        <ReshootDialog
          source={source}
          sceneIndex={sceneIndex}
          model={model}
          effort={effort}
          dismiss={dismiss}
          onRun={async (coverageMode, sceneScope, runLabel) => {
            const result = await reshoot({
              params: { id: source.id, index: String(sceneIndex) },
              body: {
                assetRunId: preview.assetRunId,
                versionId: version?.id ?? null,
                label: runLabel,
                model,
                reasoningEffort: effort,
                systemParts,
                userParts,
                coverageMode,
                sceneScope,
              },
            });
            if (result.error) {
              toast.error(result.error.error);
              return false;
            }
            if (result.data?.error) toast.error(`Re-shoot failed: ${result.data.error}`);
            else toast.success(`Scene ${sceneIndex} re-shot`);
            setRunId(result.data?.id ?? null);
            setCompareId(source.id);
            return true;
          }}
        />
      ),
    });
  }

  function loadPrompts(from: PromptLabRun) {
    setSystemParts(from.systemParts.filter((p) => p.key !== "sceneScope"));
    setUserParts(from.userParts);
    toast.success("Prompts loaded into the editor");
  }

  return (
    <div className="space-y-4">
      <ContextTags preview={preview} />
      {preview.assetRunId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-isnew-border bg-isnew-bg px-3 py-2.5 text-xs text-fg-2">
          <span>
            Known assets come from asset run <span className="font-medium text-fg">{assetRun ? runName(assetRun) : "…"}</span>, not the
            chapter&apos;s stored assets.
          </span>
          <MiniButton className="ml-auto" onClick={onClearAssets}><X size={13} /> Use chapter assets</MiniButton>
        </div>
      )}
      <VersionBar
        pass={preview.pass}
        versions={versions}
        version={version}
        overrides={overrides}
        motionOverrides={motionEdits}
        skipped={applied.skipped.map((o) => o.label)}
        dirty={dirty}
        onSelect={onSelectVersion}
      />
      <PromptGroup title={`System prompt — ${title}`} parts={systemParts} original={preview.systemParts} onChange={setSystemParts} defaultOpen />
      <PromptGroup title={`User message — ${title}`} parts={userParts} original={preview.userParts} onChange={setUserParts} defaultOpen={false} />

      <section className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <span className="text-xs text-fg-3">Model</span>
            <Select value={model} onChange={(value) => setModel(value as PromptLabModel)} wrapperClassName="mt-1.5">
              {PROMPT_LAB_MODELS.map((m) => <SelectOption key={m} value={m} label={m} />)}
            </Select>
          </div>
          <div className="min-w-40">
            <span className="text-xs text-fg-3">Reasoning effort</span>
            <Select value={effort} onChange={(value) => setEffort(value as PromptLabEffort)} wrapperClassName="mt-1.5">
              {PROMPT_LAB_EFFORTS.map((e) => (
                <SelectOption key={e} value={e} label={e === "default" ? `default (${preview.productionEffort ?? "none"})` : e} />
              ))}
            </Select>
          </div>
          <div className="min-w-48 flex-1">
            <span className="text-xs text-fg-3">Label</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. stricter lighting rule" className="mt-1.5" />
          </div>
          <LoadingButton variant="primary" loading={running} loadingText="Running…" onClick={handleRun} disabled={running}>
            <Play size={15} /> Run
          </LoadingButton>
        </div>
        <p className="mt-2 text-xs text-fg-3">Runs are saved here only. The chapter&apos;s assets, scenes and shots are never changed.</p>
      </section>

      {!!runs?.length && (
        <section>
          <div className="mb-2 text-xs font-medium tracking-wider text-fg-3 uppercase">Runs — {title}</div>
          <ul className="space-y-1.5">
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                versionName={versions.find((v) => v.id === r.versionId)?.name ?? null}
                viewing={r.id === runId}
                comparing={r.id === compareId}
                onView={() => {
                  setRunId(r.id);
                  if (compareId === r.id) setCompareId(null);
                }}
                onCompare={() => setCompareId(compareId === r.id ? null : r.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {runId && runs?.some((r) => r.id === runId) && (
        <RunOutput
          runId={runId}
          compareId={compareId}
          motionEdits={motionEdits}
          onMotionChange={setMotionEdits}
          onLoadPrompts={loadPrompts}
          onUseAssets={onUseAssets}
          onReshoot={openReshoot}
        />
      )}
    </div>
  );
}

function ChapterWorkbench({
  chapterId,
  pass,
  assetRunId,
  onUseAssets,
  onClearAssets,
}: {
  chapterId: string;
  pass: PromptLabPass;
  assetRunId: string | null;
  onUseAssets: (run: PromptLabRun) => void;
  onClearAssets: () => void;
}) {
  const chained = pass === "storyboard" && Boolean(assetRunId);
  const direct = useRead(
    (api) => api("labs/prompt/chapters/:id/preview/:pass").GET({ params: { id: chapterId, pass } }),
    { enabled: !chained }
  );
  const fromAssets = useRead(
    (api) => api("labs/prompt/runs/:id/storyboard-preview").GET({ params: { id: assetRunId ?? "" } }),
    { enabled: chained }
  );
  const { data: preview, error } = chained ? fromAssets : direct;
  const { data: versions } = useRead((api) => api("labs/prompt/passes/:pass/versions").GET({ params: { pass } }));
  const [versionId, setVersionId] = useQueryState(`version_${pass}`, parseAsString);
  if (error) return <p className="text-sm text-danger">{error.error}</p>;
  if (!preview || !versions) return <p className="text-sm text-fg-3">Building prompts…</p>;
  const version = versions.find((v) => v.id === versionId) ?? null;
  return (
    <Workbench
      key={`${chapterId}:${pass}:${preview.assetRunId ?? ""}:${version?.id ?? ""}`}
      chapterId={chapterId}
      preview={preview}
      versions={versions}
      version={version}
      onSelectVersion={setVersionId}
      onUseAssets={onUseAssets}
      onClearAssets={onClearAssets}
    />
  );
}

export default function PromptLabPage() {
  const [storyId, setStoryId] = useQueryState("story", parseAsString);
  const [chapterId, setChapterId] = useQueryState("chapter", parseAsString);
  const [pass, setPass] = useQueryState("pass", parseAsStringLiteral(PASS_VALUES).withDefault("storyboard"));
  const [assetRunId, setAssetRunId] = useQueryState("assets", parseAsString);
  const [, setRunId] = useQueryState("run", parseAsString);
  const [, setCompareId] = useQueryState("compare", parseAsString);

  function clearRuns() {
    setRunId(null);
    setCompareId(null);
  }

  function chainAssets(run: PromptLabRun) {
    setAssetRunId(run.id);
    setPass("storyboard");
    clearRuns();
  }

  return (
    <>
      <TopBar>
        <Crumb><Link href="/labs/prompt">Labs</Link> / <span className="text-fg">Prompt</span></Crumb>
        <span className="ml-auto rounded-full border border-isnew-border bg-isnew-bg px-2.5 py-1 text-[10px] font-medium tracking-wide text-isnew uppercase">
          Experimental
        </span>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-accent">
              <FlaskConical size={18} />
              <span className="text-xs font-medium tracking-wider uppercase">Story pass test bench</span>
            </div>
            <h1 className="text-2xl font-semibold">Stories Lab</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
              See exactly what a pass sends for a chapter, edit it, run it on any model, and compare the copied prompts side by side.
            </p>
          </div>

          <section className="mb-5 rounded-xl border border-line bg-panel-2 p-4">
            <Picker
              storyId={storyId}
              chapterId={chapterId}
              pass={pass}
              onStory={(id) => {
                setStoryId(id);
                setChapterId(null);
                setAssetRunId(null);
                clearRuns();
              }}
              onChapter={(id) => {
                setChapterId(id);
                setAssetRunId(null);
                clearRuns();
              }}
              onPass={(value) => {
                setPass(value);
                clearRuns();
              }}
            />
          </section>

          {chapterId ? (
            <ChapterWorkbench
              chapterId={chapterId}
              pass={pass}
              assetRunId={assetRunId}
              onUseAssets={chainAssets}
              onClearAssets={() => {
                setAssetRunId(null);
                clearRuns();
              }}
            />
          ) : (
            <p className="text-sm text-fg-3">Pick a chapter to load its prompts.</p>
          )}
        </Wrap>
      </Body>
    </>
  );
}
