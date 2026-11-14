import { NextResponse } from "next/server";
import { mapRecapV2Project, recapV2JobRunning, type RecapV2JobKind, type RecapV2Project } from "./recap-v2";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;
type Table = "recap_v2_projects" | "splitter_projects";

const PROGRESS_WRITE_INTERVAL_MS = 1500;

// A null fraction is a stage that cannot be measured (the speech worker, a
// single ffmpeg pass); the editor shows it as an indeterminate bar.
export type RecapV2JobProgress = (stage: string, fraction: number | null) => void;

// "Narration 3/24" and "Narration 4/24" are one stage; only a new stage skips the throttle.
function stageKey(stage: string) {
  return stage.replace(/\s*\d+\/\d+$/, "");
}

// Transcribe, translate and render share one job slot per project: each runs
// inside its request and records stage/progress on the row for the editor to poll.
export function runRecapV2Job(
  db: Db,
  id: string,
  kind: RecapV2JobKind,
  check: (project: RecapV2Project) => string | null,
  work: (project: RecapV2Project, progress: RecapV2JobProgress) => Promise<Record<string, unknown>>
) {
  return runProjectJob(db, "recap_v2_projects", id, mapRecapV2Project, { job_kind: kind }, check, work);
}

// The same job slot for any project table with `job_*` columns (Splitter too).
export async function runProjectJob<P extends { sourceUploadStatus: string }>(
  db: Db,
  table: Table,
  id: string,
  map: (row: Record<string, unknown>) => P,
  claim: Record<string, unknown>,
  check: (project: P) => string | null,
  work: (project: P, progress: RecapV2JobProgress) => Promise<Record<string, unknown>>
) {
  const { data: row } = await db.from(table).select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (recapV2JobRunning(row)) return NextResponse.json({ error: "Another step is still running." }, { status: 409 });
  const project = map(row);
  const problem = project.sourceUploadStatus !== "ready" ? "Upload the video first." : check(project);
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });

  const claimed = await db.from(table)
    .update({ ...claim, job_status: "running", job_stage: null, job_progress: 0, job_error: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  if (claimed.error) return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  if (!claimed.data) return NextResponse.json({ error: "Another step is still running." }, { status: 409 });

  // A new stage is written at once; repeats within the interval are coalesced
  // into one trailing write, so the last value always lands.
  let lastWrite = 0;
  let lastStage: string | null = null;
  let pending: { stage: string; fraction: number | null } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writes = Promise.resolve();
  const write = (stage: string, fraction: number | null) => {
    lastWrite = Date.now();
    lastStage = stageKey(stage);
    writes = writes.then(async () => {
      await db.from(table).update({ job_stage: stage, job_progress: fraction, updated_at: new Date().toISOString() })
        .eq("id", id).eq("job_status", "running");
    });
  };
  const progress: RecapV2JobProgress = (stage, fraction) => {
    if (stageKey(stage) !== lastStage) {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
      write(stage, fraction);
      return;
    }
    pending = { stage, fraction };
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (pending) write(pending.stage, pending.fraction);
      pending = null;
    }, Math.max(0, PROGRESS_WRITE_INTERVAL_MS - (Date.now() - lastWrite)));
  };
  const settle = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    await writes;
  };
  try {
    const patch = await work(map(claimed.data), progress);
    await settle();
    const saved = await db.from(table)
      .update({ ...patch, job_status: "done", job_stage: null, job_progress: null, job_error: null, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (saved.error || !saved.data) throw saved.error ?? new Error("Could not save the result.");
    return NextResponse.json(map(saved.data));
  } catch (error) {
    await settle();
    const message = error instanceof Error ? error.message.slice(-1500) : "The step failed.";
    await db.from(table)
      .update({ job_status: "failed", job_stage: null, job_progress: null, job_error: message, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
