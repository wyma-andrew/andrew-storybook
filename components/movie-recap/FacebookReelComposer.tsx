"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, Globe, Hash, X } from "lucide-react";
import { Alert, DateInput, Input, Label, Select, SelectOption, Textarea, toast } from "@geckoui/geckoui";
import { Button, LoadingButton, MiniButton } from "@/components/ui/Button";
import { FacebookLogo } from "@/components/ui/FacebookLogo";
import type { MovieRecapEpisode, MovieRecapProject, MovieRecapSocialPost } from "@/lib/api/types";
import { FACEBOOK_MIN_SCHEDULE_LEAD_MS, FACEBOOK_REEL_DEFAULTS, FACEBOOK_TIME_STEP_MINUTES } from "@/lib/constants/facebook";
import { useRead, useWrite } from "@/lib/spoosh";

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TIME_OPTIONS = Array.from({ length: (24 * 60) / FACEBOOK_TIME_STEP_MINUTES }, (_, i) => {
  const minutes = i * FACEBOOK_TIME_STEP_MINUTES;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { value: `${pad(h)}:${pad(m)}`, label: `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}` };
});

const slotOf = (d: Date) => ({ date: dateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });

export const formatPublishTime = (d: Date) =>
  d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// A saved description is caption + a trailing hashtag paragraph; splitting it
// back lets an edit reopen with the same chips it was scheduled with.
function splitDescription(description: string) {
  const parts = description.split(/\n\s*\n/);
  const last = parts.at(-1)?.trim() ?? "";
  if (last && last.split(/\s+/).every((word) => /^#\S+$/.test(word))) {
    return { caption: parts.slice(0, -1).join("\n\n"), tags: last.split(/\s+/) };
  }
  return { caption: description, tags: [] };
}

function initialState(post?: MovieRecapSocialPost) {
  if (post) return { ...slotOf(new Date(post.publishAt)), ...splitDescription(post.description) };
  const slot = new Date();
  slot.setHours(FACEBOOK_REEL_DEFAULTS.publishHour, FACEBOOK_REEL_DEFAULTS.publishMinute, 0, 0);
  if (slot.getTime() - Date.now() < FACEBOOK_MIN_SCHEDULE_LEAD_MS) slot.setDate(slot.getDate() + 1);
  return { ...slotOf(slot), caption: "", tags: FACEBOOK_REEL_DEFAULTS.hashtags };
}

function normalizeTag(raw: string) {
  const word = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return word ? `#${word}` : "";
}

function PageAvatar({ name, pictureUrl, size, badge }: { name: string; pictureUrl: string | null; size: string; badge: string }) {
  return (
    <div className={`relative ${size} shrink-0`}>
      {pictureUrl
        ? <img src={pictureUrl} alt={name} className="size-full rounded-full object-cover" />
        : <div className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-avatar-from to-avatar-to text-sm font-semibold text-on-accent">{name.slice(0, 1).toUpperCase()}</div>}
      <FacebookLogo className={`absolute -bottom-0.5 -right-0.5 ring-2 ring-panel ${badge}`} />
    </div>
  );
}

export function socialPostsKey(projectId: string, episodeId: string | null) {
  return episodeId ? `movie-recaps/${projectId}/episodes/${episodeId}/social-posts` : `movie-recaps/${projectId}/social-posts`;
}

// `episode` set: the episode's own video and posts instead of the default render's.
export function FacebookReelComposer({ project, episode = null, post, dismiss }: { project: MovieRecapProject; episode?: MovieRecapEpisode | null; post?: MovieRecapSocialPost; dismiss: () => void }) {
  const { data: page } = useRead((api) => api("facebook/page").GET(), { staleTime: 10 * 60 * 1000 });
  const { data: projectPosts } = useRead((api) => api("movie-recaps/:id/social-posts").GET({ params: { id: project.id } }), { enabled: !post && !episode });
  const { data: episodePosts } = useRead(
    (api) => api("movie-recaps/:id/episodes/:episodeId/social-posts").GET({ params: { id: project.id, episodeId: episode?.id ?? "" } }),
    { enabled: !post && Boolean(episode) },
  );
  const posts = episode ? episodePosts : projectPosts;
  const { trigger: createProjectPost } = useWrite((api) => api("movie-recaps/:id/facebook").POST());
  const { trigger: createEpisodePost } = useWrite((api) => api("movie-recaps/:id/episodes/:episodeId/facebook").POST());
  const { trigger: updatePost } = useWrite((api) => api("movie-recap-social-posts/:id").PATCH());
  const [initial] = useState(() => initialState(post));
  const [now, setNow] = useState(() => Date.now());
  const [caption, setCaption] = useState(initial.caption);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [date, setDate] = useState<string | null>(initial.date);
  const [time, setTime] = useState(initial.time);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const pageName = page?.name ?? "Facebook Page";
  const description = [caption.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
  const publishAt = date ? new Date(`${date.slice(0, 10)}T${time}:00`) : null;
  const validTime = publishAt && !Number.isNaN(publishAt.getTime());
  const tooSoon = validTime && publishAt.getTime() - now < FACEBOOK_MIN_SCHEDULE_LEAD_MS;
  const whenLabel = validTime ? formatPublishTime(publishAt) : "Pick a date";
  const activePost = posts?.find((p) => p.status === "uploading" || p.status === "scheduled" || p.status === "published");

  function addTag() {
    const tag = normalizeTag(tagDraft);
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag]);
    setTagDraft("");
  }

  async function schedule() {
    if (!validTime || tooSoon) return;
    setSaving(true);
    try {
      const invalidate = [socialPostsKey(project.id, episode?.id ?? post?.episodeId ?? null)];
      const body = { description, publishAt: publishAt.toISOString() };
      const result = post
        ? await updatePost({ params: { id: post.id }, body, invalidate })
        : episode
          ? await createEpisodePost({ params: { id: project.id, episodeId: episode.id }, body, invalidate })
          : await createProjectPost({ params: { id: project.id }, body, invalidate });
      if (result.data) {
        toast.success(post ? `Reel updated for ${whenLabel}.` : `Uploading to Facebook for ${whenLabel}. You can leave this page.`);
        dismiss();
      } else {
        toast.error((result.error as { error?: string } | undefined)?.error ?? "Could not save the Reel.");
      }
    } catch {
      toast.error("Could not save the Reel.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-h-[85vh] flex-col">
      <div className="-mx-6 -mt-6 flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-[16px] font-semibold">{post ? "Edit scheduled Reel" : "Schedule to Facebook"}</h2>
        <MiniButton ghost aria-label="Close" onClick={dismiss}><X size={18} /></MiniButton>
      </div>

      <div className="-mx-6 grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_300px]">
        <div className="space-y-5 px-5 py-5">
          {activePost && (
            <Alert
              variant="warning"
              condensed
              title={activePost.status === "published" ? "Already published" : activePost.status === "uploading" ? "Already uploading" : "Already scheduled"}
              description={`This recap is ${activePost.status} for ${formatPublishTime(new Date(activePost.publishAt))}. Scheduling again posts it a second time.`}
            />
          )}
          <div className="flex items-center gap-3">
            <PageAvatar name={pageName} pictureUrl={page?.pictureUrl ?? null} size="size-10" badge="size-4" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{pageName}</div>
              <div className="flex items-center gap-1 text-xs text-fg-3"><Globe size={12} /> Public · Reel</div>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-fg-2">Caption</Label>
            <Textarea autoFocus rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write something about this recap..." />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-fg-2">Hashtags</Label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex h-8 items-center gap-1 rounded-full border border-accent/40 bg-accent/15 pl-3 pr-1 text-sm font-medium text-accent">
                  {tag}
                  <MiniButton ghost aria-label={`Remove ${tag}`} className="!h-6 !w-6 !min-w-0 !rounded-full !p-0 !text-accent hover:!bg-accent/25" onClick={() => setTags(tags.filter((t) => t !== tag))}><X size={14} /></MiniButton>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs italic text-fg-3">No hashtags</span>}
            </div>
            <Input
              className="mt-2"
              prefix={<Hash size={14} />}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === ",") { e.preventDefault(); addTag(); }
              }}
              onBlur={addTag}
              placeholder="Add a hashtag and press Enter"
            />
          </div>

          <div className="rounded-lg border border-line-2 bg-panel-2 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium"><CalendarClock size={16} /> Schedule</div>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <DateInput value={date} onChange={setDate} format="DD/MM/YYYY" hideClearIcon />
              <Select value={time} onChange={setTime}>
                {TIME_OPTIONS.map((option) => <SelectOption key={option.value} value={option.value} label={option.label} />)}
              </Select>
            </div>
            <p className={`mt-2 text-xs ${tooSoon ? "text-danger" : "text-fg-3"}`}>
              {tooSoon ? "Pick a time at least 10 minutes from now." : `Publishes ${whenLabel} (your time).`}
            </p>
          </div>
        </div>

        <div className="border-t border-line px-5 py-5 md:border-l md:border-t-0">
          <div className="mb-2 text-xs font-medium text-fg-3">Preview</div>
          <div className="overflow-hidden rounded-lg border border-line-2 bg-panel">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <PageAvatar name={pageName} pictureUrl={page?.pictureUrl ?? null} size="size-8" badge="size-3.5" />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{pageName}</div>
                <div className="flex items-center gap-1 text-[11px] text-fg-3"><Clock size={10} /> {whenLabel}</div>
              </div>
            </div>
            {description && (
              <p className="line-clamp-4 whitespace-pre-wrap px-3 pb-2.5 text-xs text-fg-2">
                {caption.trim()}
                {caption.trim() && tags.length > 0 && "\n\n"}
                {tags.length > 0 && <span className="text-accent">{tags.join(" ")}</span>}
              </p>
            )}
            <video
              muted
              playsInline
              controls
              preload="metadata"
              src={(episode ? episode.outputUrl : project.renderOutputUrl) ?? undefined}
              className="block aspect-[9/16] max-h-[360px] w-full bg-black object-contain"
            />
          </div>
        </div>
      </div>

      <div className="-mx-6 -mb-6 flex items-center justify-end gap-2.5 border-t border-line px-5 py-3.5">
        <Button variant="secondary" onClick={dismiss}>Cancel</Button>
        <LoadingButton variant="primary" loading={saving} loadingText="Uploading..." disabled={saving || !validTime || Boolean(tooSoon)} onClick={() => void schedule()}>
          <CalendarClock size={16} /> {post ? "Save changes" : "Schedule"}
        </LoadingButton>
      </div>
    </div>
  );
}
