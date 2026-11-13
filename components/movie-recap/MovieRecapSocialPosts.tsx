"use client";

import { CalendarClock, CircleAlert, Loader2, CircleCheck, CircleSlash, Clock, CalendarX, ExternalLink, Pencil, type LucideIcon } from "lucide-react";
import { ConfirmDialog, Dialog, toast } from "@geckoui/geckoui";
import { MiniButton } from "@/components/ui/Button";
import { FacebookLogo } from "@/components/ui/FacebookLogo";
import type { MovieRecapEpisode, MovieRecapProject, MovieRecapSocialPost } from "@/lib/api/types";
import { useRead, useWrite } from "@/lib/spoosh";
import { FacebookReelComposer, formatPublishTime, socialPostsKey } from "./FacebookReelComposer";

const STATUS_BADGE: Record<MovieRecapSocialPost["status"], { label: string; icon: LucideIcon; className: string }> = {
  uploading: { label: "Uploading", icon: Loader2, className: "text-fg-2 [&>svg]:animate-spin" },
  scheduled: { label: "Scheduled", icon: CalendarClock, className: "text-accent" },
  published: { label: "Published", icon: CircleCheck, className: "text-ok" },
  cancelled: { label: "Cancelled", icon: CircleSlash, className: "text-fg-3" },
  failed: { label: "Failed", icon: CircleAlert, className: "text-danger" },
};

function StatusBadge({ status }: { status: MovieRecapSocialPost["status"] }) {
  const { label, icon: Icon, className } = STATUS_BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

function CaptionPreview({ description }: { description: string }) {
  const words = description.split(/(\s+)/);
  return (
    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-fg-2">
      {words.map((word, i) => (/^#\S+$/.test(word) ? <span key={i} className="text-accent">{word}</span> : word))}
    </p>
  );
}

// The upload finishes in the background after the schedule request returned.
function pollWhileUploading({ data }: { data: unknown }) {
  return (data as MovieRecapSocialPost[] | undefined)?.some((post) => post.status === "uploading") ? 5000 : false;
}

export function MovieRecapSocialPosts({ project, episode = null }: { project: MovieRecapProject; episode?: MovieRecapEpisode | null }) {
  const { data: me } = useRead((api) => api("auth/me").GET());
  const { data: projectPosts } = useRead(
    (api) => api("movie-recaps/:id/social-posts").GET({ params: { id: project.id } }),
    { enabled: Boolean(me?.isAdmin) && !episode, pollingInterval: pollWhileUploading },
  );
  const { data: episodePosts } = useRead(
    (api) => api("movie-recaps/:id/episodes/:episodeId/social-posts").GET({ params: { id: project.id, episodeId: episode?.id ?? "" } }),
    { enabled: Boolean(me?.isAdmin) && Boolean(episode), pollingInterval: pollWhileUploading },
  );
  const posts = episode ? episodePosts : projectPosts;
  const { trigger: cancelPost } = useWrite((api) => api("movie-recap-social-posts/:id").DELETE());

  if (!me?.isAdmin || !posts?.length) return null;

  function openEdit(post: MovieRecapSocialPost) {
    Dialog.show({
      className: "max-w-[860px] w-full",
      dismissOnOutsideClick: false,
      content: ({ dismiss }) => <FacebookReelComposer project={project} episode={episode} post={post} dismiss={dismiss} />,
    });
  }

  function confirmCancel(post: MovieRecapSocialPost) {
    ConfirmDialog.show({
      title: "Cancel this Reel?",
      content: `It is deleted from the Facebook Page and will not publish on ${formatPublishTime(new Date(post.publishAt))}. This cannot be undone.`,
      confirmButtonLabel: "Cancel Reel",
      cancelButtonLabel: "Keep",
      onConfirm: async ({ dismiss }) => {
        const result = await cancelPost({ params: { id: post.id }, invalidate: [socialPostsKey(project.id, episode?.id ?? null)] });
        if (result.data) toast.success("Reel cancelled.");
        else toast.error((result.error as { error?: string } | undefined)?.error ?? "Could not cancel the Reel.");
        dismiss();
      },
    });
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">Social posts</span>
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-fg-2">{posts.length}</span>
      </div>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id} className={`flex items-start gap-3 rounded-lg border border-line bg-panel p-3 ${post.status === "cancelled" ? "opacity-60" : ""}`}>
            <FacebookLogo className="mt-0.5 size-8" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Facebook Reel</span>
                <StatusBadge status={post.status} />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-fg">
                <Clock size={14} className="text-fg-3" />
                {formatPublishTime(new Date(post.publishAt))}
              </div>
              {post.error
                ? <p className="text-xs text-danger">{post.error}</p>
                : post.description ? <CaptionPreview description={post.description} /> : <p className="text-xs italic text-fg-3">No caption</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {post.status === "scheduled" && <>
                <MiniButton onClick={() => openEdit(post)}><Pencil size={13} /> Edit</MiniButton>
                <MiniButton className="!border-danger-border !text-danger hover:!bg-danger-hover" onClick={() => confirmCancel(post)}><CalendarX size={13} /> Cancel</MiniButton>
              </>}
              {post.permalinkUrl && post.status === "published" && (
                <a href={post.permalinkUrl} target="_blank" rel="noreferrer" className="GeckoUIButton text-xs" data-variant="outlined" data-color="primary" data-size="sm"><ExternalLink size={13} /> View</a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
