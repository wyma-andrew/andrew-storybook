const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const PAGE_ID = process.env.FB_PAGE_ID ?? "";
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN ?? "";

export function facebookConfigured() {
  return Boolean(PAGE_ID && PAGE_TOKEN);
}

async function graphError(response: Response, step: string) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(`Facebook ${step} failed: ${body?.error?.message ?? `HTTP ${response.status}`}`);
}

export async function readFacebookPage() {
  const query = new URLSearchParams({ fields: "name,picture.type(large){url}", access_token: PAGE_TOKEN });
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}?${query}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await graphError(response, "page lookup");
  const body = await response.json() as { name: string; picture?: { data?: { url?: string } } };
  return { name: body.name, pictureUrl: body.picture?.data?.url ?? null };
}

async function reelsPhase(fields: Record<string, string>, step: string) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/video_reels`, {
    method: "POST",
    body: new URLSearchParams({ ...fields, access_token: PAGE_TOKEN }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw await graphError(response, step);
  return response.json();
}

// Reels Publishing API: start → hosted-file upload → finish. Meta pulls the file
// from `fileUrl` itself, so the MP4 never passes through this server.
// Split so the caller can record the video id before the slow part: the upload
// below waits while Facebook pulls the whole file from R2.
export async function startFacebookReel() {
  const { video_id: videoId } = await reelsPhase({ upload_phase: "start" }, "upload start") as { video_id: string };
  return videoId;
}

export async function finishFacebookReel({ videoId, fileUrl, description, publishAt }: {
  videoId: string;
  fileUrl: string;
  description: string;
  publishAt: Date;
}) {
  const upload = await fetch(`https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${PAGE_TOKEN}`, file_url: fileUrl },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!upload.ok) throw await graphError(upload, "video upload");

  await reelsPhase({
    upload_phase: "finish",
    video_id: videoId,
    video_state: "SCHEDULED",
    scheduled_publish_time: String(Math.floor(publishAt.getTime() / 1000)),
    description,
  }, "schedule");
}

type VideoStatus = {
  permalink_url?: string;
  status?: {
    video_status?: string;
    publishing_phase?: { publish_status?: string; errors?: { message?: string }[] };
    processing_phase?: { errors?: { message?: string }[] };
  };
};

export type FacebookVideoState =
  | { status: "scheduled" | "published"; permalinkUrl: string | null }
  | { status: "failed"; error: string };

export async function readFacebookVideoState(videoId: string): Promise<FacebookVideoState> {
  const query = new URLSearchParams({ fields: "status,permalink_url", access_token: PAGE_TOKEN });
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${videoId}?${query}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await graphError(response, "status lookup");
  const body = await response.json() as VideoStatus;
  const permalinkUrl = body.permalink_url ? new URL(body.permalink_url, "https://www.facebook.com").toString() : null;
  if (body.status?.video_status === "error") {
    const errors = [...(body.status.processing_phase?.errors ?? []), ...(body.status.publishing_phase?.errors ?? [])];
    return { status: "failed", error: errors.map((e) => e.message).filter(Boolean).join("; ") || "Facebook could not process the video." };
  }
  return { status: body.status?.publishing_phase?.publish_status === "published" ? "published" : "scheduled", permalinkUrl };
}

export async function updateFacebookVideo(videoId: string, fields: { description?: string; publishAt?: Date }) {
  const body = new URLSearchParams({ access_token: PAGE_TOKEN });
  if (fields.description !== undefined) body.set("description", fields.description);
  if (fields.publishAt) body.set("scheduled_publish_time", String(Math.floor(fields.publishAt.getTime() / 1000)));
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${videoId}`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await graphError(response, "update");
}

export async function deleteFacebookVideo(videoId: string) {
  const query = new URLSearchParams({ access_token: PAGE_TOKEN });
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${videoId}?${query}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await graphError(response, "delete");
}
