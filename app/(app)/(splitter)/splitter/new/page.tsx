"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Film, Upload } from "lucide-react";
import { toast, useFilePicker } from "@geckoui/geckoui";
import { Button, LinkButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { useWrite } from "@/lib/spoosh";
import type { SplitterProject } from "@/lib/splitter";
import { uploadSplitterVideo } from "@/lib/splitter-upload";
import { readTranslateVideo } from "@/lib/translate-upload";

export default function NewSplitterProjectPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [active, setActive] = useState<SplitterProject | null>(null);
  const { trigger: create } = useWrite((api) => api("splitter-projects").POST());

  async function begin(file: File) {
    if (busy) return;
    setBusy(true);
    setPercent(0);
    try {
      let project = active;
      if (!project) {
        const metadata = await readTranslateVideo(file);
        const result = await create({ body: {
          fileName: file.name, contentType: file.type, sizeBytes: file.size,
          durationSeconds: metadata.duration, width: metadata.width, height: metadata.height,
          lastModified: file.lastModified,
        } });
        if (!result.data) throw new Error(result.error?.error ?? "Could not create project.");
        project = result.data;
        setActive(project);
      }
      project = await uploadSplitterVideo(project, file, setPercent);
      router.push(`/splitter/${project.id}`);
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

  return <>
    <TopBar><LinkButton variant="ghost" href="/splitter"><ChevronLeft size={16} /> Splitter</LinkButton><span className="text-fg-3">/</span><span className="font-medium">New project</span></TopBar>
    <Body><Wrap>
      <div className="mb-6"><h1 className="text-xl font-semibold">Create Splitter Project</h1><p className="mt-1 text-sm text-fg-2">Choose a long video. After it uploads, choose the part length and the frame, then split it.</p></div>
      <div ref={dropzoneRef} className={`flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center ${dragging ? "border-accent bg-accent-dim" : "border-line-2 bg-panel"}`}>
        <Film size={34} className="mb-3 text-fg-3" />
        <p className="font-medium">{active ? active.sourceFileName : "Select a video"}</p>
        <p className="mt-1 text-sm text-fg-3">{busy ? `Uploading ${percent}%` : active ? "Reselect the same file to resume the upload." : "Each part is re-encoded, so cuts land exactly where planned."}</p>
        <Button variant="primary" className="mt-5" disabled={busy} onClick={() => openFilePicker({ multiple: false })}><Upload size={16} /> {active ? "Reselect video" : "Choose video"}</Button>
        {busy && <div className="mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-accent" style={{ width: `${percent}%` }} /></div>}
      </div>
    </Wrap></Body>
  </>;
}
