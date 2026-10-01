import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { FFMPEG, run } from "@/lib/movie-recap-ffmpeg";
import { downloadObjectToFile, getObjectText, putObject, translateProjectPrefix } from "@/lib/r2";
import { parseSrt, type TranslateCue, type TranslateProject } from "@/lib/translate";
import { normalizeSpeechText, timeSubtitlesToSpeech, type SpeechWord } from "@/lib/translate-timing";
import { ASR_NOT_CONFIGURED, asrWorkerConfigured, transcribeWithAsrWorker } from "@/lib/asr-worker";

export async function alignTranslateSubtitles(project: TranslateProject): Promise<TranslateCue[] | null> {
  const workDir = await mkdtemp(path.join(tmpdir(), "translate-align-"));
  try {
    const sourceCues = parseSrt(project.srtText ?? "");
    const sourceHash = createHash("sha256").update(project.sourceObjectKey).digest("hex");
    // v2: transcripts cached while the SRT was sent as a Whisper prompt may be unusable; see history/translate.md.
    const cacheKey = `${translateProjectPrefix(project.id)}alignment/${sourceHash}.v2.words.json`;
    const cached = await getObjectText(cacheKey);
    let speechWords: SpeechWord[] = [];
    if (cached) {
      try {
        const words: unknown = JSON.parse(cached);
        if (Array.isArray(words) && words.length <= 100_000 && words.every((word) =>
          word && typeof word === "object" && typeof word.word === "string"
          && typeof word.start === "number" && typeof word.end === "number"
          && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start
        )) speechWords = words as SpeechWord[];
      } catch { speechWords = []; }
    }
    if (!speechWords.length) {
      // No paid fallback to OpenAI's whisper-1; see history/translate.md.
      if (!asrWorkerConfigured()) throw new Error(ASR_NOT_CONFIGURED);
      const sourcePath = path.join(workDir, "source-video");
      const audioPath = path.join(workDir, "speech.webm");
      await downloadObjectToFile(project.sourceObjectKey, sourcePath);
      await run(FFMPEG, ["-y", "-i", sourcePath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "16k", audioPath]);

      const transcription = await transcribeWithAsrWorker(audioPath, { words: true });
      speechWords = transcription.words.filter((word) =>
        Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && normalizeSpeechText(word.word)
      );
      if (speechWords.length) await putObject(cacheKey, Buffer.from(JSON.stringify(speechWords)), "application/json").catch(() => undefined);
    }
    if (!speechWords.length) throw new Error("No timed speech was found in the video.");

    const { cues, aligned } = timeSubtitlesToSpeech(sourceCues, speechWords, project.sourceDurationSeconds);
    return aligned ? cues : null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
