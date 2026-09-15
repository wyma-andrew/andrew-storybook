"use client";

import Link from "next/link";
import { Clapperboard, Clock3, Film, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, toast } from "@geckoui/geckoui";
import { Button, LinkButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { formatBytes, formatDuration } from "@/lib/movie-recap";
import { useRead, useWrite } from "@/lib/spoosh";

export default function MovieRecapPage() {
  const { data: projects, loading, error } = useRead((api) => api("movie-recaps").GET());
  const { trigger: deleteProject } = useWrite((api) => api("movie-recaps/:id").DELETE());

  function confirmDelete(id: string, name: string) {
    ConfirmDialog.show({
      title: "Delete Movie Recap project?",
      content: `“${name}” and its uploaded source and logo will be permanently deleted.`,
      confirmButtonLabel: "Delete project",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const result = await deleteProject({ params: { id } });
        if (result.error) toast.error(result.error.error);
        else {
          dismiss();
          toast.success("Project deleted.");
        }
      },
    });
  }

  return (
    <>
      <TopBar><div className="text-[19px] font-medium">Movie Recap</div><div className="ml-auto"><LinkButton variant="primary" href="/movie-recap/new"><Plus size={16} /> New project</LinkButton></div></TopBar>
      <Body><Wrap wide>
        <div className="mb-5 flex items-baseline gap-2.5"><h1 className="text-xl font-semibold">Your Recap Projects</h1><span className="text-[13px] text-fg-3">{projects?.length ?? 0} projects</span></div>
        {error && <p className="text-danger">Couldn&apos;t load projects: {error.error}</p>}
        {loading && !projects ? <p className="text-fg-3">Loading projects…</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
            {projects?.map((project) => <article key={project.id} className="overflow-hidden rounded-xl border border-line bg-panel-2">
              <Link href={`/movie-recap/${project.id}`} className="block text-fg no-underline">
                <div className="grid h-[130px] place-items-center border-b border-line bg-gradient-to-br from-thumb-from to-thumb-to"><Clapperboard className="text-fg-3" size={32} /></div>
                <div className="px-4 pt-3.5 pb-3"><div className="mb-1 flex items-start gap-2"><h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{project.name}</h2><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${project.status === "ready_for_generation" ? "border-matched-border bg-matched-bg text-matched" : project.sourceUploadStatus === "ready" ? "border-sys-badge-border bg-sys-badge-bg text-sys-badge" : "border-isnew-border bg-isnew-bg text-isnew"}`}>{project.status === "ready_for_generation" ? "Ready" : project.sourceUploadStatus === "ready" ? `Step ${project.currentStep}` : "Uploading"}</span></div>
                  <p className="mb-3 truncate text-xs text-fg-2">{project.sourceFileName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-fg-3"><span className="flex items-center gap-1"><Film size={12} /> {formatBytes(project.sourceSizeBytes)} · {formatDuration(project.sourceDurationSeconds)}</span><span className="flex items-center gap-1"><Clock3 size={12} /> {new Date(project.updatedAt).toLocaleDateString()}</span></div>
                </div>
              </Link>
              <div className="border-t border-line px-3 py-2"><Button variant="danger" className="!h-8 !px-2.5 text-xs" onClick={() => confirmDelete(project.id, project.name)}><Trash2 size={14} /> Delete</Button></div>
            </article>)}
            <Link href="/movie-recap/new" className="flex min-h-[248px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-fg-3 no-underline hover:border-fg-3 hover:text-fg-2"><div className="grid h-10 w-10 place-items-center rounded-full border border-line-2"><Plus size={22} /></div>Create Recap Project</Link>
          </div>
        )}
      </Wrap></Body>
    </>
  );
}
