import type { MovieRecapProject } from "./api/types";
import { downloadObjectToFile } from "./r2";

const REPORT_EVERY_MS = 1000;
const MB = 1_000_000;

// Progress is reported in whole MB so it fits the integer progress columns the
// UI already counts with.
export async function downloadMovieRecapSource(
  project: Pick<MovieRecapProject, "sourceObjectKey">,
  destPath: string,
  { signal, report }: { signal?: AbortSignal; report?: (doneMb: number, totalMb: number) => PromiseLike<unknown> } = {}
) {
  let lastReportAt = 0;
  let inFlight: PromiseLike<unknown> | null = null;
  let totalMb = 0;
  await downloadObjectToFile(project.sourceObjectKey, destPath, {
    signal,
    onProgress: (doneBytes, totalBytes) => {
      totalMb = Math.max(1, Math.ceil(totalBytes / MB));
      const now = Date.now();
      if (!report || inFlight || now - lastReportAt < REPORT_EVERY_MS) return;
      lastReportAt = now;
      inFlight = report(Math.floor(doneBytes / MB), totalMb);
      void Promise.resolve(inFlight).finally(() => {
        inFlight = null;
      });
    },
  });
  if (report) {
    await inFlight;
    await report(totalMb, totalMb);
  }
}
