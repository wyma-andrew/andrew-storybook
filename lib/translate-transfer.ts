import type { TranslateCue, TranslateProject, TranslateProjectPatch, TranslateRect } from "@/lib/translate";

export const TRANSLATE_BUNDLE_FORMAT = "ai-storybook/translate-project";

export type TranslateBundle = {
  format: typeof TRANSLATE_BUNDLE_FORMAT;
  version: 1;
  exportedAt: string;
  project: {
    name: string;
    sourceFileName: string;
    sourceDurationSeconds: number;
    srtFileName: string | null;
    srtText: string | null;
    subtitleCues: TranslateCue[] | null;
    translatedSrtFileName: string | null;
    translatedSrtText: string | null;
    subtitleTimingMode: TranslateProject["subtitleTimingMode"];
    blurRegions: TranslateRect[];
    subtitleY: number;
    subtitleSize: number;
  };
};

export function toTranslateBundle(project: TranslateProject): TranslateBundle {
  return {
    format: TRANSLATE_BUNDLE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      sourceFileName: project.sourceFileName,
      sourceDurationSeconds: project.sourceDurationSeconds,
      srtFileName: project.srtFileName,
      srtText: project.srtText,
      subtitleCues: project.subtitleCues,
      translatedSrtFileName: project.translatedSrtFileName,
      translatedSrtText: project.translatedSrtText,
      subtitleTimingMode: project.subtitleTimingMode,
      blurRegions: project.blurRegions,
      subtitleY: project.subtitleY,
      subtitleSize: project.subtitleSize,
    },
  };
}

export function translateBundleFileName(bundle: TranslateBundle) {
  const slug = bundle.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "translate";
  return `${slug}-${bundle.exportedAt.slice(0, 10)}.translate.json`;
}

// The route handler validates every field again; this only rejects files that are not a bundle at all.
export function parseTranslateBundle(text: string): TranslateBundle {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("That file is not valid JSON."); }
  const bundle = value as TranslateBundle;
  if (bundle?.format !== TRANSLATE_BUNDLE_FORMAT || bundle.version !== 1 || typeof bundle.project?.name !== "string") {
    throw new Error("That file is not a Translate project export.");
  }
  return bundle;
}

// Two patches because PATCH resets timing to "original" whenever the SRT text changes,
// so the synced cues and timing mode must be sent after the SRT is stored.
export function translateBundlePatches(bundle: TranslateBundle): [TranslateProjectPatch, TranslateProjectPatch] {
  const p = bundle.project;
  const content: TranslateProjectPatch = { name: p.name, blurRegions: p.blurRegions, subtitleY: p.subtitleY, subtitleSize: p.subtitleSize };
  if (p.srtText && p.srtFileName) Object.assign(content, { srtText: p.srtText, srtFileName: p.srtFileName });
  if (p.translatedSrtText && p.translatedSrtFileName) Object.assign(content, { translatedSrtText: p.translatedSrtText, translatedSrtFileName: p.translatedSrtFileName });
  const timing: TranslateProjectPatch = {};
  if (p.srtText && p.subtitleCues?.length) timing.subtitleCues = p.subtitleCues;
  if ((p.subtitleTimingMode === "aligned" && timing.subtitleCues) || (p.subtitleTimingMode === "translated" && content.translatedSrtText)) {
    timing.subtitleTimingMode = p.subtitleTimingMode;
  }
  return [content, timing];
}
