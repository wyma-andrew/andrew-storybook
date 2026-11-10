"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Beaker, CircleCheck, Clock3, Mic, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, toast } from "@geckoui/geckoui";
import { Button, LoadingButton, MiniButton } from "@/components/ui/Button";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { VOICES } from "@/lib/tts/voices";

export default function VoiceLabProjectsPage() {
  const router = useRouter();
  const { data: projects, loading, error } = useRead((api) => api("labs/voice/projects").GET());
  const { trigger: create, loading: creating } = useWrite((api) => api("labs/voice/projects").POST());
  const { trigger: remove } = useWrite((api) => api("labs/voice/projects/:id").DELETE());

  async function createProject() {
    const result = await create({ body: { name: `Voice project ${(projects?.length ?? 0) + 1}` } });
    if (result.error) toast.error(result.error.error);
    else if (result.data) router.push(`/labs/voice/${result.data.id}`);
  }

  function confirmDelete(id: string, name: string) {
    ConfirmDialog.show({
      title: "Delete voice project?",
      content: `“${name}”, its lines and all generated audio will be permanently deleted.`,
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
    <TopBar>
      <div className="flex items-center gap-2 text-[19px] font-medium"><Beaker size={19} /> Voice Lab</div>
      <div className="ml-auto">
        <LoadingButton variant="primary" loading={creating} onClick={() => void createProject()}><Plus size={16} /><span className="sm:hidden">New</span><span className="hidden sm:inline">New project</span></LoadingButton>
      </div>
    </TopBar>
    <Body><Wrap wide>
      <div className="mb-5 flex items-baseline gap-2.5"><h1 className="text-xl font-semibold">Your Voice Projects</h1><span className="text-[13px] text-fg-3">{projects?.length ?? 0} projects</span></div>
      {error && <p className="text-danger">Could not load projects: {error.error}</p>}
      {loading && !projects ? <p className="text-fg-3">Loading projects…</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
        {projects?.map((project) => {
          const voice = VOICES.find((profile) => profile.id === project.voiceId) ?? VOICES[0];
          const pending = project.lineCount - project.doneCount;
          return <article key={project.id} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2 transition-colors hover:border-line-2">
            <Link href={`/labs/voice/${project.id}`} className="flex flex-1 flex-col gap-4 p-4 text-fg no-underline">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent"><AudioLines size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-3"><Clock3 size={11} /> {new Date(project.updatedAt).toLocaleDateString()}</p>
                </div>
                {project.lineCount === 0
                  ? <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-3">Empty</span>
                  : pending === 0
                    ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok"><CircleCheck size={11} /> Ready</span>
                    : <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{pending} pending</span>}
              </div>
              <p className="mt-auto text-xs text-fg-2">{project.lineCount} {project.lineCount === 1 ? "line" : "lines"}<span className="text-fg-3"> · {project.doneCount} generated</span></p>
            </Link>
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-fg-2"><Mic size={13} className="shrink-0 text-fg-3" /> {voice.name}</span>
              <MiniButton ghost aria-label={`Delete ${project.name}`} className="!text-fg-3 hover:!text-danger" onClick={() => confirmDelete(project.id, project.name)}><Trash2 size={14} /></MiniButton>
            </div>
          </article>;
        })}
        <Button onClick={() => void createProject()} disabled={creating} className="!flex !h-auto !min-h-[140px] !flex-col !items-center !justify-center !gap-2 !rounded-xl !border-dashed !border-line-2 !bg-transparent !text-fg-3 hover:!border-fg-3 hover:!text-fg-2">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-line-2"><Plus size={22} /></span>Create Voice Project
        </Button>
      </div>}
    </Wrap></Body>
  </>;
}
