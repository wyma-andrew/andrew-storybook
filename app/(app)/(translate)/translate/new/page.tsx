"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileJson, Film, Upload, X } from "lucide-react";
import { toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LinkButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { formatDuration } from "@/lib/movie-recap";
import { useWrite } from "@/lib/spoosh";
import type { TranslateProject } from "@/lib/translate";
import { readTranslateVideo, uploadTranslateVideo } from "@/lib/translate-upload";
import { captureFirstVideoCover } from "@/lib/video-cover";
import { parseTranslateBundle, translateBundlePatches, type TranslateBundle } from "@/lib/translate-transfer";

export default function NewTranslateProjectPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [active, setActive] = useState<TranslateProject | null>(null);
  const [bundle, setBundle] = useState<TranslateBundle | null>(null);
  const [bundleApplied, setBundleApplied] = useState(false);
  const { trigger: create } = useWrite((api) => api("translate-projects").POST());
  const { trigger: patch } = useWrite((api) => api("translate-projects/:id").PATCH());
  const { trigger: saveCover } = useWrite((api) => api("translate-projects/:id/cover").POST());

  async function begin(file: File) {
    if (busy) return;
    setBusy(true);
    setPercent(0);
    try {
      let project = active;
      if (!project) {
        const metadata = await readTranslateVideo(file);
        if (bundle?.project.subtitleCues?.length && Math.abs(metadata.duration - bundle.project.sourceDurationSeconds) > 1) {
          toast.info(`This video's length differs from the exported project (${formatDuration(bundle.project.sourceDurationSeconds)}); synced timing may not match.`);
        }
        const result = await create({ body: {
          fileName: file.name, contentType: file.type, sizeBytes: file.size,
          durationSeconds: metadata.duration, width: metadata.width, height: metadata.height,
          lastModified: file.lastModified,
        } });
        if (!result.data) throw new Error(result.error?.error ?? "Could not create project.");
        project = result.data;
        setActive(project);
      }
      if (bundle && !bundleApplied) {
        for (const body of translateBundlePatches(bundle)) {
          if (!Object.keys(body).length) continue;
          const result = await patch({ params: { id: project.id }, body });
          if (!result.data) throw new Error(`Project created, but importing its data failed: ${result.error?.error ?? "unknown error"}`);
          project = result.data;
        }
        setActive(project);
        setBundleApplied(true);
      }
      project = await uploadTranslateVideo(project, file, setPercent);
      try {
        const imageBase64 = await captureFirstVideoCover(file);
        if (!imageBase64) throw new Error("Could not capture cover.");
        const result = await saveCover({ params: { id: project.id }, body: { sourceObjectKey: project.sourceObjectKey, imageBase64 }, invalidate: ["translate-projects"] });
        if (!result.data) throw new Error(result.error?.error ?? "Could not save cover.");
      } catch {
        toast.info("Video uploaded. You can set its cover from the editor.");
      }
      router.push(`/translate/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload video.");
    } finally {
      setBusy(false);
    }
  }

  const { dropzoneRef, dragging, openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "video/*",
    onChange: (_files, files) => { if (files[0]) void begin(files[0]); },
  });

  const { openFilePicker: chooseBundle } = useFilePicker({
    accept: ".json,application/json",
    onChange: async (_files, files) => {
      if (!files[0]) return;
      try { setBundle(parseTranslateBundle(await files[0].text())); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not read that file."); }
    },
  });

  return <>
    <TopBar><LinkButton variant="ghost" href="/translate"><ChevronLeft size={16} /> Translate</LinkButton><span className="text-fg-3">/</span><span className="font-medium">New project</span></TopBar>
    <Body><Wrap>
      <div className="mb-6"><h1 className="text-xl font-semibold">Create Translate Project</h1><p className="mt-1 text-sm text-fg-2">Choose the video first. After it uploads, add the original-language SRT and customize the preview.</p></div>
      <div ref={dropzoneRef} className={`flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center ${dragging ? "border-accent bg-accent-dim" : "border-line-2 bg-panel"}`}>
        <Film size={34} className="mb-3 text-fg-3" />
        <p className="font-medium">{active ? active.sourceFileName : "Select a video"}</p>
        <p className="mt-1 text-sm text-fg-3">{busy ? `Uploading ${percent}%` : active ? "Reselect the same file to resume the upload." : "The source video keeps its original size and aspect ratio."}</p>
        <Button variant="primary" className="mt-5" disabled={busy} onClick={() => openFilePicker({ multiple: false })}><Upload size={16} /> {active ? "Reselect video" : "Choose video"}</Button>
        {busy && <div className="mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-accent" style={{ width: `${percent}%` }} /></div>}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <FileJson size={20} className="shrink-0 text-fg-3" />
        {bundle ? <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Import “{bundle.project.name}”</p><p className="truncate text-xs text-fg-3">Exported {new Date(bundle.exportedAt).toLocaleDateString()} · original video {bundle.project.sourceFileName}</p></div>
          : <div className="min-w-0 flex-1"><p className="text-sm font-medium">Import an exported project</p><p className="text-xs text-fg-3">Optional. SRTs, synced timing, translation, blur and subtitle settings are restored; choose the video above.</p></div>}
        {bundle ? <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Remove imported project" disabled={busy || !!active} onClick={() => setBundle(null)}><X size={16} /></Button>
          : <Button className="!h-8 shrink-0 !px-2.5 text-xs" disabled={busy || !!active} onClick={() => chooseBundle({ multiple: false })}>Choose file</Button>}
      </div>
      {active && !busy && <p className="mt-3 text-sm text-fg-3">Your project is saved. You can also resume it from the Translate project list.</p>}
    </Wrap></Body>
  </>;
}
