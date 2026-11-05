export type TranscriptProject = {
  id: string;
  name: string;
  sourceFileName: string;
  sourceUrl: string | null;
  coverUrl: string | null;
  sourceObjectKey: string;
  sourceContentType: string;
  sourceSizeBytes: number;
  sourceDurationSeconds: number;
  sourceLastModified: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceUploadStatus: "pending" | "uploading" | "ready" | "failed";
  transcriptText: string | null;
  jobStatus: "idle" | "running" | "done" | "failed";
  jobStage: string | null;
  jobError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptProjectListItem = Pick<TranscriptProject,
  "id" | "name" | "sourceFileName" | "sourceSizeBytes" | "sourceDurationSeconds" | "sourceUploadStatus" | "coverUrl" | "jobStatus" | "updatedAt"
> & { transcribed: boolean };

export const TRANSCRIPT_LIST_COLUMNS = "id,name,source_file_name,source_size_bytes,source_duration_seconds,source_upload_status,cover_url,job_status,updated_at,transcript_text";

export type TranscriptProgress = Pick<TranscriptProject, "jobStatus" | "jobStage" | "updatedAt">;

export const TRANSCRIPT_PROGRESS_COLUMNS = "job_status,job_stage,updated_at";

export function mapTranscriptProgress(row: Record<string, unknown>): TranscriptProgress {
  return {
    jobStatus: row.job_status as TranscriptProject["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

// A job row older than this is treated as orphaned by a restart and may be reclaimed.
export const TRANSCRIPT_STALE_JOB_MS = 2 * 60 * 60 * 1000;

export function transcriptJobRunning(row: { job_status: unknown; updated_at: unknown }) {
  return row.job_status === "running" && Date.now() - Date.parse(String(row.updated_at)) < TRANSCRIPT_STALE_JOB_MS;
}

export function mapTranscriptProjectListItem(row: Record<string, unknown>): TranscriptProjectListItem {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceUploadStatus: row.source_upload_status as TranscriptProject["sourceUploadStatus"],
    coverUrl: (row.cover_url as string) ?? null,
    jobStatus: row.job_status as TranscriptProject["jobStatus"],
    updatedAt: row.updated_at as string,
    transcribed: Boolean((row.transcript_text as string | null)?.trim()),
  };
}

export function mapTranscriptProject(row: Record<string, unknown>): TranscriptProject {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceUrl: (row.source_url as string) ?? null,
    coverUrl: (row.cover_url as string) ?? null,
    sourceObjectKey: row.source_object_key as string,
    sourceContentType: row.source_content_type as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceLastModified: Number(row.source_last_modified),
    sourceWidth: Number(row.source_width),
    sourceHeight: Number(row.source_height),
    sourceUploadStatus: row.source_upload_status as TranscriptProject["sourceUploadStatus"],
    transcriptText: (row.transcript_text as string) ?? null,
    jobStatus: row.job_status as TranscriptProject["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    jobError: (row.job_error as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Whisper returns one segment per stretch of speech; Burmese marks its own
// sentence ends ("။"), so segments are joined into one running text and only a
// long pause starts a new paragraph.
const PARAGRAPH_PAUSE_S = 2;

export function transcriptFromSegments(segments: { start: number; end: number; text: string }[]) {
  let text = "";
  let previousEnd: number | null = null;
  for (const segment of segments) {
    const piece = segment.text.trim();
    if (!piece) continue;
    if (previousEnd !== null) text += segment.start - previousEnd >= PARAGRAPH_PAUSE_S ? "\n\n" : " ";
    text += piece;
    previousEnd = segment.end;
  }
  return text;
}
