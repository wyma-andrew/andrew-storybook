"use client";

import Link from "next/link";
import { Clock3, FileJson, Film, Languages, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, toast } from "@geckoui/geckoui";
import { Button, LinkButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { formatBytes, formatDuration } from "@/lib/movie-recap";
import { useRead, useWrite } from "@/lib/spoosh";

export default function TranslateProjectsPage() {
  const { data: projects, loading, error } = useRead((api) => api("translate-projects").GET());
  const { trigger: remove } = useWrite((api) => api("translate-projects/:id").DELETE());

  function confirmDelete(id: string, name: string) {
    ConfirmDialog.show({
      title: "Delete Translate project?",
      content: `“${name}” and its uploaded video and render will be permanently deleted.`,
      confirmButtonLabel: "Delete project",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const result = await remove({ params: { id } });
        if (result.error) toast.error(result.error.error);
        else { dismiss(); toast.success("Project deleted."); }
      },
    });
  }

  return <>
    <TopBar><div className="flex items-center gap-2 text-[19px] font-medium"><Languages size={19} /> Translate</div><div className="ml-auto flex gap-2"><LinkButton href="/translate/new"><FileJson size={16} /> Import</LinkButton><LinkButton variant="primary" href="/translate/new"><Plus size={16} /><span className="sm:hidden">New</span><span className="hidden sm:inline">New project</span></LinkButton></div></TopBar>
    <Body><Wrap wide>
      <div className="mb-5 flex items-baseline gap-2.5"><h1 className="text-xl font-semibold">Your Translate Projects</h1><span className="text-[13px] text-fg-3">{projects?.length ?? 0} projects</span></div>
      {error && <p className="text-danger">Could not load projects: {error.error}</p>}
      {loading && !projects ? <p className="text-fg-3">Loading projects…</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
        {projects?.map((project) => <article key={project.id} className="overflow-hidden rounded-xl border border-line bg-panel-2">
          <Link href={`/translate/${project.id}`} className="block text-fg no-underline">
            <div className="grid h-[130px] place-items-center border-b border-line bg-gradient-to-br from-thumb-from to-thumb-to"><Film className="text-fg-3" size={32} /></div>
            <div className="px-4 pt-3.5 pb-3"><div className="mb-1 flex items-start gap-2"><h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{project.name}</h2><span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] text-fg-2">{project.renderStatus === "done" ? "Rendered" : project.sourceUploadStatus === "ready" ? project.srtFileName ? "Customize" : "Add SRT" : "Upload video"}</span></div><p className="mb-3 truncate text-xs text-fg-2">{project.sourceFileName}</p><div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-fg-3"><span className="flex items-center gap-1"><Film size={12} /> {formatBytes(project.sourceSizeBytes)} · {formatDuration(project.sourceDurationSeconds)}</span><span className="flex items-center gap-1"><Clock3 size={12} /> {new Date(project.updatedAt).toLocaleDateString()}</span></div></div>
          </Link>
          <div className="border-t border-line px-3 py-2"><Button variant="danger" className="!h-8 !px-2.5 text-xs" onClick={() => confirmDelete(project.id, project.name)}><Trash2 size={14} /> Delete</Button></div>
        </article>)}
        <Link href="/translate/new" className="flex min-h-[248px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-fg-3 no-underline hover:border-fg-3 hover:text-fg-2"><div className="grid h-10 w-10 place-items-center rounded-full border border-line-2"><Plus size={22} /></div>Create Translate Project</Link>
      </div>}
    </Wrap></Body>
  </>;
}
