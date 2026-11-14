"use client";

import { useState } from "react";
import { AudioLines, ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Languages, ScrollText, Sparkles, Upload } from "lucide-react";
import { Dialog, Radio, Menu, MenuItem, MenuTrigger, Select, SelectOption, Textarea, toast, useFilePicker } from "@geckoui/geckoui";
import type { MovieRecapProject, MovieRecapSpeechLanguage } from "@/lib/api/types";
import { Button as AppButton, LoadingButton } from "@/components/ui/Button";
import { MOVIE_RECAP_SCENE_TAG, formatMovieRecapSourceTranscript } from "@/lib/movie-recap-source-transcript";
import { MovieRecapTranscriptProgress } from "./MovieRecapTranscriptProgress";
import { RecapLengthMenu } from "./RecapLengthMenu";
import { recommendedRecapShare } from "@/lib/movie-recap-recap-length";

type TranscriptMode = "manual" | "auto";

function cleanImportedTranscript(raw: string) {
  return formatMovieRecapSourceTranscript(raw.replace(/&#x20;|&#32;|&nbsp;/gi, " "));
}

function formatTimestampedStoryPaste(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])[\t ]+(?=\d{1,2}:\d{2}\b)/g, "$1\n");
}

// Shared by every prompt below so the three never drift apart in voice.
const NARRATION_STYLE = `STYLE
- Write like a Burmese YouTube movie-recap narrator speaking continuously over the video, as if explaining the story to a friend.
- Use everyday spoken Burmese — not formal written Burmese, news-report style, subtitle style, or textbook translation.
- Casual, clear, fast-moving, and easy to listen to.
- Link lines with natural connectors so the narration flows from one line into the next, e.g. "အဲ့ဒီနောက်", "ဒီလိုနဲ့", "အဲဒီအချိန်မှာ", "ဒါပေမယ့်", "တစ်ဖက်မှာတော့", "နောက်တစ်နေ့မှာ", "အဲ့လိုဖြစ်နေရင်း" — only where they sound natural, and without overusing the same one.
- Describe what happens directly and confidently, as if the narrator is watching it.
- Labels such as "Man A" or "Woman B" in [Scene] lines mark the same person every time they appear. Never say the label: use the character's name once the dialogue reveals it, otherwise a short natural description (e.g. the bearded man).`;

const NARRATION_WORDING = `WORDING
- Rewrite English sentence structure into natural Burmese word order. Never translate word-for-word.
- Omit subjects and pronouns where Burmese speech naturally allows it, and avoid repeating the same name unnecessarily.
- For English names, acronyms and terms that will be read aloud, use Burmese phonetic spelling when it helps TTS pronunciation (e.g. CIA → စီအိုင်အေ).
- Write every number in the narration as Burmese words, never as digits (Burmese or Arabic), so TTS reads it exactly as written: 3 years → သုံးနှစ်; in 1999 → တစ်ထောင့်ကိုးရာကိုးဆယ့်ကိုး ခုနှစ်မှာ; 80,000 feet → ပေ ရှစ်သောင်း; 2.5 → နှစ်ဒသမငါး; 50% → ငါးဆယ်ရာခိုင်နှုန်း.
- Codes and names that are read digit by digit stay digit by digit, in words: 007 → သုညသုညခုနစ်.
- Timestamps stay exactly as they are.
- Avoid formal fillers such as "ဖြစ်ကြောင်း", "ဟုဆိုသည်", "တွေ့ရှိရသည်", "လုပ်ဆောင်ခဲ့သည်".
- Avoid hearsay endings such as "တဲ့", "လို့ဆိုပါတယ်", "လို့သိရပါတယ်" when describing what happens on screen; use them only for reported speech.
- Avoid "လုပ်ရတယ်" unless the source actually means "must / has to".`;

const NARRATION_STYLE_REFERENCE = `STYLE REFERENCE (match its tone and rhythm only — do not copy its content):
"မြောက်ကိုရီးယားစစ်တပ်ရဲ့ တပ်စခန်းတစ်ခုမှာ စစ်သားတစ်ယောက်က လူမသိအောင် တစ်ယောက်တည်း ခိုးထွက်လာပြီး လေဝင်ပေါက်ထဲဝင်ကာ သူသိမ်းထားတဲ့မြေပုံကို ထုတ်ကြည့်ပါတယ်။ ပြီးတော့ သံလိုက်အိမ်မြှောင်ပြတဲ့လမ်းအတိုင်း လျှပ်စစ်လွှတ်ထားတဲ့ ခြံစည်းရိုးကိုကျော်ပြီး ရှေ့ဆက်သွားပါတယ်။ လမ်းတစ်လျှောက်မှာလည်း မြေပုံပေါ်မပါသေးတဲ့ မြေမြှုပ်မိုင်းနေရာတွေကို တွေ့သမျှ ထပ်မှတ်ထားရင်း အဝေးမှာ မီးတွေထိန်ထိန်လင်းနေတဲ့ နယ်စပ်ဘက်ကို မျှော်လင့်တကြီးကြည့်နေပါတယ်။"`;

function buildMovieRecapTranslationPrompt(sourceText: string) {
  return `You are a Burmese movie-recap narrator. Convert the raw auto-generated transcript below into natural spoken Burmese narration, synchronized with timestamps.

STEP 1 — CLEAN THE SOURCE (do this internally; do not output it)
1. Remove sound tags such as [music], [applause], [laughter], and speaker markers ">>". Drop any line with no spoken text left.
2. Join the caption fragments and re-split them so that each line holds exactly ONE complete sentence (ending in ".", "?" or "!", including when followed by a closing quote).
3. Give each sentence the timestamp of the caption line where its first word appears. Exception: if the sentence starts in the last 1–2 words of a caption line, use the NEXT caption line's timestamp.
4. If a quote contains several sentences, split them into separate lines.
5. If two cleaned lines would get the same timestamp, join them into one line. Every timestamp must be used only once.
6. Lines tagged [Scene] describe what is on screen, not speech. Keep each one as its own line with its own timestamp — never join it with dialogue, never drop it as a sound tag.

Example:
Raw:
02:45 "I've always been able to hear.
02:46 >> [music]
02:46 >> I just thought you were deaf." Although
02:48 the man was delighted, he suddenly
02:49 remembered his confession the day
02:51 before. The girl had heard every single
02:53 word.

Cleaned:
02:45  "I've always been able to hear.
02:46  I just thought you were deaf."
02:48  Although the man was delighted, he suddenly remembered his confession the day before.
02:51  The girl had heard every single word.

STEP 2 — TRANSLATE INTO SPOKEN BURMESE NARRATION

${NARRATION_STYLE}

ACCURACY
- Keep the original meaning and order of events. Do not add information that is not in the source.
- Simplify complicated phrasing, not content. Do not drop details just to make it shorter.
- If part of the source is garbled or unclear ASR noise, do NOT guess or invent a storyline for it. Translate only what is clearly understandable; if nothing on a line is clear, keep its narration short and neutral.
- Keep names and story-specific terms (people, places, organizations, objects, technical terms) accurate and consistent throughout.

${NARRATION_WORDING}

TIMESTAMP RULES
1. Output exactly one line per cleaned source line, with the same timestamp, in the same order. Never merge, skip, or add lines.
2. Every timestamp must be followed by its narration on the same line. No timestamp may stand alone.
3. Each line must read as a complete, natural spoken chunk. Do not end a line with a word that grammatically belongs to the next line.

OUTPUT FORMAT
- One line per timestamp: MM:SS  Burmese narration
- Two spaces between the timestamp and the text.
- Output only the Burmese narration lines — no cleaned English, headings, notes, or explanations.

[SCENE HANDLING DIRECTIVE - STRICT]

When processing [Scene] tags in the transcript, follow these strictly:

1. UNDERSTAND THE ROLE OF [Scene]:
   - [Scene] lines are VISUAL ACTIONS (what happens on screen), NOT spoken dialogue.
   - Do NOT translate [Scene] lines directly as characters speaking.
   - Do NOT output the word "[Scene]" or any tag.
   - Instead, convert the action into fluent, natural narrative prose (e.g., "ကောင်လေးက ဆိုင်ကယ်ကို စစ်ဆေးကြည့်ပေးပါတယ်") as a movie-recap narrator describing the visual.

2. TREATMENT OF DIALOGUE LINES:
   - Lines without [Scene] tags (or following a [Scene] tag) represent what characters say.
   - Do NOT use rigid quote markers or literal repetition like "ဟုပြောသည်" or "လို့ဆိုသည်".
   - Retell the dialog naturally as part of the continuous narration flow.

3. PRESERVE LINE-BY-LINE TIMESTAMPS:
   - Keep 1-to-1 alignment with each cleaned timestamp line.
   - Output ONLY: MM:SS  [Burmese narration text]

${NARRATION_STYLE_REFERENCE}

SOURCE TEXT:
${sourceText.trim()}`;
}

// Auto mode reads a raw, uncut film and works story-first, the way recap
// channels do: Prompt A writes the narration with no timestamps, Prompt B then
// picks a source timestamp for each line. One prompt doing both kept growing
// rules that contradicted each other. See history/movie-recap.md.
//
// The length budget is the share picked in the Recap length menu, with 10%
// either side. Lines written to the "about 10 seconds" wording measure ~6s read
// aloud, so the count uses 6s while the wording keeps 10s — telling the model 6s
// shortens the lines and undershoots again. See history/movie-recap.md.
const RECAP_SHARE_SPREAD = 0.1;
const RECAP_SECONDS_PER_LINE = 10;
const RECAP_READ_SECONDS_PER_LINE = 6;

function clock(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function buildRecapScriptPrompt(sourceText: string, sourceDurationS: number, share: number) {
  const minShare = share * (1 - RECAP_SHARE_SPREAD);
  const maxShare = share * (1 + RECAP_SHARE_SPREAD);
  const minS = sourceDurationS * minShare;
  const maxS = sourceDurationS * maxShare;
  const minLines = Math.max(3, Math.round(minS / RECAP_READ_SECONDS_PER_LINE));
  const maxLines = Math.max(minLines, Math.round(maxS / RECAP_READ_SECONDS_PER_LINE));
  return `You are a Burmese movie-recap narrator. Read the transcript of a film below and write a SHORT spoken Burmese recap script of its story.

ABOUT THE TRANSCRIPT
- Each line starts with a timestamp. Lines tagged [Scene] describe what is on screen; all other lines are what the characters say.
- Labels such as "Man A" or "Woman B" in [Scene] lines mark the same person every time they appear. Never say the label: use the character's name once the dialogue reveals it, otherwise a short natural description (e.g. the bearded man).
- The transcript is machine-made: some dialogue may be misheard, and it does not say who is speaking. If the transcript does not make clear who a person is or who said a line, describe them by what is certain (e.g. "the man in the pinstriped suit") instead of guessing a name or a relationship.
- Ignore the timestamps for now. A later step matches each line of your script to the footage.

LENGTH BUDGET — this is the main constraint
- The film runs ${clock(sourceDurationS)}. The recap should run about ${clock(minS)}–${clock(maxS)} read aloud (${Math.round(minShare * 100)}–${Math.round(maxShare * 100)}% of the film).
- Write ${minLines}–${maxLines} lines. This count is already calibrated to the narrator's real reading speed, so meet it — do not cut lines to fit your own estimate of reading time. Never more than ${maxLines}, never fewer than ${minLines}. Aim for the middle.
- Keep each line to one sentence of about ${RECAP_SECONDS_PER_LINE} seconds (see rule 4). A line much longer than that eats into the budget.

STORY
1. First work out the story: who the main characters are, what they want, the event that starts the story, the turning points, and the climax.
2. Spend the lines on what the story needs most: the event that starts it, major turning points, reveals and twists, and the climax. Add only what is needed so it flows with no gap a viewer would notice. Skip small talk, filler, repeated scenes, and side details.
3. Tell the story in the order it happens in the film, so each line can be matched to a later part of the footage than the line before it.
4. ONE LINE = ONE ON-SCREEN MOMENT. Each line plays over a single clip, so it must describe one thing the viewer can see in one place at one time — one sentence of about ${RECAP_SECONDS_PER_LINE} seconds. Never join two scenes in one line (e.g. "she recovers, and later they leave for the city"). "Same moment" means the same continuous action within about ${RECAP_SECONDS_PER_LINE} seconds of film time — not just the same room or the same conversation. If both moments matter, give each its own line; otherwise keep the more important one.
5. The transcript may be a complete film or only one part of a longer story. Narrate only what is shown. Do not invent an ending or resolve anything the source does not resolve.
6. THE LAST LINE: if the story is resolved, end on that resolution. If it is not (the source is one part of a longer story), end on the open threat as a hook — remind the viewer who is still a danger, or what secret or rival is still waiting — so the viewer wants the next part. The hook must still describe something visible on screen near the end of the film (e.g. the rival watching, a threatening look), not only the narrator's comment.
7. Do not add information that is not in the transcript.
8. NO REPEATED BEATS. When the same kind of event happens more than once (a power is shown again, a threat is made again, a fight or a rescue happens again), keep the first time it happens and the strongest or most important later time (if different). Drop the other repeats — the viewer already understands.

${NARRATION_STYLE}

${NARRATION_WORDING}

FINAL REVIEW (do this before you output)
1. Read your draft as one recap. Remove any line that repeats an earlier beat or covers a side detail. Remove other lines, weakest first, only while the count stays at or above ${minLines} lines. Never remove the line that sets up the main character's goal or what they stand to lose. If the count falls under ${minLines}, add back a story moment you skipped — never filler.
2. Shorten any line that runs over about ${RECAP_SECONDS_PER_LINE} seconds by cutting words, not moments.
3. Never fix length by merging two lines into one — a merged line describes two moments but plays over one clip. Drop the weaker line instead, unless both are the same continuous action within about ${RECAP_SECONDS_PER_LINE} seconds.
4. Check the line count against the length budget (${minLines}–${maxLines}) once more.

OUTPUT FORMAT
- One Burmese narration line per row, in story order.
- No timestamps, numbering, headings, notes, or explanations.

${NARRATION_STYLE_REFERENCE}

TRANSCRIPT:
${sourceText.trim()}`;
}

function buildRecapClipPrompt(sourceText: string, script: string) {
  return `Match each line of a Burmese movie-recap script to the moment in the film's transcript where its footage should start.

INPUTS
- TRANSCRIPT: timestamped lines from the film. Lines tagged [Scene] describe what is on screen; other lines are dialogue.
- SCRIPT: the recap, one Burmese line per row, in story order.

RULES
1. For each script line, choose the ONE transcript timestamp whose footage best shows what that line is about. Prefer a [Scene] line, because its timestamp is where that action starts on screen. The footage only needs to fit the line, not show every word of it.
2. Copy that timestamp exactly as it appears in the transcript. Never invent or adjust a timestamp.
3. Timestamps must strictly increase from one script line to the next.
4. Leave at least ${RECAP_SECONDS_PER_LINE} seconds between consecutive timestamps, because each line plays over about ${RECAP_SECONDS_PER_LINE} seconds of footage from its timestamp. If the best match is too close to the previous one, take the next suitable moment after it.
5. Never use the same timestamp twice.
6. Keep every script line exactly as written: do not translate, reword, merge, split, add, or drop lines.

OUTPUT FORMAT
- One line per script line, in the same order: MM:SS  Burmese line (use H:MM:SS when the transcript does).
- Two spaces between the timestamp and the text.
- Output only these lines — no headings, notes, or explanations.

SCRIPT:
${script.trim()}

TRANSCRIPT:
${sourceText.trim()}`;
}

const TRANSCRIPT_SOURCES = [
  { label: "YouTube Transcript", href: "https://www.youtube-transcript.io/" },
  { label: "RedNote Transcript", href: "https://captioner.io/en/rednote" },
];

function showTranscriptImport(onImport: (text: string) => void) {
  Dialog.show({
    className: "!max-w-lg",
    content: ({ dismiss }) => (
      <TranscriptImportDialog dismiss={dismiss} onImport={onImport} />
    ),
  });
}

function TranscriptImportDialog({
  dismiss,
  onImport,
}: {
  dismiss: () => void;
  onImport: (text: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const { dropzoneRef, dragging, openFilePicker, loading } = useFilePicker<HTMLDivElement>({
    accept: ".txt,text/plain",
    onChange: (_files, newFiles) => setFile(newFiles[0] ?? null),
  });

  async function importFile() {
    if (!file) return;
    const cleaned = cleanImportedTranscript(await file.text());
    if (!cleaned) {
      toast.error("No timestamped transcript lines were found in that file.");
      return;
    }
    onImport(cleaned);
    dismiss();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Import source transcript</h2>
        <p className="mt-1 text-sm text-fg-2">
          Choose the downloaded .txt file. Standalone timestamp lines will be removed automatically.
        </p>
      </div>
      <div
        ref={dropzoneRef}
        onClick={() => void openFilePicker({ multiple: false })}
        className={`cursor-pointer rounded-lg border border-dashed p-5 text-center transition-colors ${
          dragging ? "border-accent bg-accent-dim" : "border-line"
        }`}
      >
        <p className="mb-1 text-sm font-medium text-fg">Drop a .txt file here</p>
        <p className="text-xs text-fg-3">{loading ? "Reading…" : file?.name ?? "or click to choose one from your device"}</p>
      </div>
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" onClick={dismiss}>Cancel</AppButton>
        <AppButton variant="primary" onClick={() => void importFile()} disabled={!file}>Import</AppButton>
      </div>
    </div>
  );
}

/**
 * The source transcript, typed in by hand or read off the source (dialogue plus
 * scene descriptions), and the Burmese story, which is always the user's. See
 * history/movie-recap.md.
 */
export function MovieRecapTranscript({
  project,
  onChange,
  onReadSource,
  onCancelRead,
  cancellingRead,
}: {
  project: MovieRecapProject;
  /** Edits land in the wizard's project draft; Continue is what writes them. */
  onChange: (patch: {
    transcriptText?: string;
    transcriptScript?: string;
    transcriptStory?: string;
    recapShare?: number | null;
  }) => void;
  onReadSource: (dialogueOnly: boolean, language: MovieRecapSpeechLanguage) => void;
  onCancelRead: () => void;
  cancellingRead: boolean;
}) {
  const running = project.transcriptStatus === "running" && !project.transcriptStoryOnly;
  const reading = running && !project.transcriptDialogueOnly;
  const readingAudio = running && project.transcriptDialogueOnly;
  const [mode, setMode] = useState<TranscriptMode>(
    project.transcriptDialogueOnly ? "manual" : reading || project.transcriptScript?.trim() || project.transcriptText?.includes(MOVIE_RECAP_SCENE_TAG) ? "auto" : "manual"
  );
  const text = project.transcriptText ?? "";
  const script = project.transcriptScript ?? "";
  const story = project.transcriptStory ?? "";
  // Asked every time: the speech worker depends on the film's language, and a
  // subtitle track, when the source has one, is used whichever is chosen.
  function confirmReadSource(dialogueOnly: boolean) {
    Dialog.show({
      className: "max-w-md",
      content: ({ dismiss }) => (
        <SpeechLanguageDialog
          replacing={Boolean(text.trim())}
          dismiss={dismiss}
          onGenerate={(language) => onReadSource(dialogueOnly, language)}
        />
      ),
    });
  }

  async function copyPrompt(prompt: string, label: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  }

  return (
    <div>
      <div className="mb-6">
      <div className="flex flex-col rounded-xl border border-line md:flex-row">
        <div className="flex items-center rounded-t-xl border-b border-line bg-sunken p-3 md:w-56 md:rounded-l-xl md:rounded-tr-none md:shrink-0 md:border-r md:border-b-0">
          <Select value={mode} onChange={(value) => setMode(value as TranscriptMode)} wrapperClassName="w-full !self-center" className="!min-h-[38px]" aria-label="Source type">
            <SelectOption value="manual" label="Recap Video" />
            <SelectOption value="auto" label="Raw Video to Recap" />
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center rounded-b-xl bg-panel-2 p-3 md:rounded-r-xl md:rounded-bl-none">
          {mode === "manual" ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:flex-wrap">
                <Menu className="min-w-0" menuClassName="min-w-[200px] p-1" placement="bottom-start" floatingStrategy="fixed">
                  <MenuTrigger>
                    {({ toggleMenu }) => (
                      <AppButton variant="primary" className="inline-flex w-full items-center gap-2 sm:w-auto" title="Download a transcript from YouTube or RedNote" onClick={toggleMenu}>
                        <Upload size={15} aria-hidden="true" />
                        Get Transcript
                        <ChevronDown size={15} aria-hidden="true" />
                      </AppButton>
                    )}
                  </MenuTrigger>
                  {TRANSCRIPT_SOURCES.map((source) => (
                    <MenuItem key={source.href} onClick={() => window.open(source.href, "_blank", "noreferrer")}>
                      <span className="flex w-full items-center justify-between gap-3">
                        {source.label}
                        <ExternalLink size={14} className="text-fg-3" aria-hidden="true" />
                      </span>
                    </MenuItem>
                  ))}
                </Menu>
                <ChevronRight size={17} className="text-fg-3" aria-hidden="true" />
                <AppButton
                  variant="secondary"
                  className="inline-flex w-full items-center gap-2 sm:w-auto"
                  title="Import the downloaded .txt file"
                  onClick={() => showTranscriptImport((imported) => {
                    onChange({ transcriptText: imported });
                  })}
                >
                  Import .txt
                </AppButton>
                <span className="col-span-3 flex items-center gap-2 py-0.5 sm:flex-col sm:gap-1 sm:px-1.5 sm:py-0" aria-hidden="true">
                  <span className="h-px flex-1 bg-line-2 sm:h-2 sm:w-px sm:flex-none" />
                  <span className="text-[10px] leading-none font-semibold tracking-wider text-fg-3 uppercase">or</span>
                  <span className="h-px flex-1 bg-line-2 sm:h-2 sm:w-px sm:flex-none" />
                </span>
                <LoadingButton
                  variant="primary"
                  loading={readingAudio}
                  disabled={running}
                  className="col-span-3 inline-flex w-full items-center gap-2 sm:w-auto"
                  title="Transcribes the speech already in the uploaded video into the source transcript."
                  onClick={() => confirmReadSource(true)}
                >
                  <AudioLines size={15} aria-hidden="true" />
                  {project.transcriptDialogueOnly && project.transcriptStatus === "done" ? "Auto-generate again" : "Auto-generate from video"}
                </LoadingButton>
                {readingAudio && <LoadingButton variant="danger" className="col-span-3 w-full sm:w-auto" loading={cancellingRead} onClick={onCancelRead}>Cancel</LoadingButton>}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <LoadingButton variant="primary" loading={reading} disabled={running} className="inline-flex items-center gap-2" onClick={() => confirmReadSource(false)}>
                  <Sparkles size={15} aria-hidden="true" />
                  {project.transcriptStatus === "done" && !project.transcriptStoryOnly && !project.transcriptDialogueOnly ? "Read again" : "Read source"}
                </LoadingButton>
                {reading && <LoadingButton variant="danger" loading={cancellingRead} onClick={onCancelRead}>Cancel</LoadingButton>}
                <p className="min-w-60 flex-1 text-xs text-fg-3">
                  Reads the video&apos;s dialogue and scenes into the source transcript ([Scene] lines). Then copy the script
                  prompt → paste the recap script → copy the clip prompt → paste its result into the Burmese story.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {project.transcriptStatus !== "idle" && !project.transcriptStoryOnly
        && project.transcriptDialogueOnly === (mode === "manual") && (
        <div className="mt-3">
          <MovieRecapTranscriptProgress project={project} />
        </div>
      )}
      {project.transcriptStatus === "failed" && project.transcriptError
        && project.transcriptDialogueOnly === (mode === "manual") && (
        <p className="mt-3 text-sm text-danger">{project.transcriptError}</p>
      )}
      </div>

      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <FileText size={14} className="text-fg-3" />
            <span className="text-sm font-medium">Source transcript</span>
            <span className="text-xs text-fg-3">optional{text.trim() ? "" : " · empty"}</span>
          </div>
          <div className="p-4">
            <Textarea
              value={text}
              onChange={(event) => onChange({ transcriptText: event.target.value })}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text/plain");
                const formatted = formatMovieRecapSourceTranscript(pasted);
                if (formatted === pasted) return;
                event.preventDefault();
                const target = event.currentTarget;
                const next = `${text.slice(0, target.selectionStart)}${formatted}${text.slice(target.selectionEnd)}`;
                onChange({ transcriptText: next });
              }}
              rows={14}
              placeholder="Paste the source transcript here."
            />
            <div className="mt-3 flex justify-end">
              {mode === "auto" ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <RecapLengthMenu
                    durationS={project.sourceDurationSeconds}
                    share={project.recapShare}
                    onChange={(recapShare) => onChange({ recapShare })}
                  />
                  <AppButton
                    variant="secondary"
                    className="inline-flex items-center gap-2"
                    disabled={!text.trim()}
                    onClick={() => void copyPrompt(
                      buildRecapScriptPrompt(
                        text,
                        project.sourceDurationSeconds,
                        project.recapShare ?? recommendedRecapShare(project.sourceDurationSeconds),
                      ),
                      "Script prompt",
                    )}
                  >
                    <Copy size={15} aria-hidden="true" />
                    Copy script prompt
                  </AppButton>
                </div>
              ) : (
                <AppButton
                  variant="secondary"
                  className="inline-flex items-center gap-2"
                  onClick={() => void copyPrompt(buildMovieRecapTranslationPrompt(text), "Translation prompt")}
                >
                  <Copy size={15} aria-hidden="true" />
                  Copy translation prompt
                </AppButton>
              )}
            </div>
          </div>
        </div>

        {mode === "auto" && (
          <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ScrollText size={14} className="text-fg-3" />
              <span className="text-sm font-medium">Recap script</span>
              <span className="text-xs text-fg-3">no timestamps{script.trim() ? ` · ${script.trim().split(/\n+/).length} lines` : ""}</span>
            </div>
            <div className="p-4">
              <Textarea
                value={script}
                onChange={(event) => onChange({ transcriptScript: event.target.value })}
                rows={10}
                placeholder="Paste the recap script from the script prompt here, one line per row."
              />
              <div className="mt-3 flex justify-end">
                <AppButton
                  variant="secondary"
                  className="inline-flex items-center gap-2"
                  disabled={!script.trim() || !text.trim()}
                  onClick={() => void copyPrompt(buildRecapClipPrompt(text, script), "Clip prompt")}
                >
                  <Copy size={15} aria-hidden="true" />
                  Copy clip prompt
                </AppButton>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Languages size={14} className="text-fg-3" />
            <span className="text-sm font-medium">Burmese story</span>
            <span className="text-xs text-fg-3">required</span>
          </div>
          <div className="p-4">
            <Textarea
              value={story}
              onChange={(event) => onChange({ transcriptStory: event.target.value })}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text/plain");
                const formatted = formatTimestampedStoryPaste(pasted);
                if (formatted === pasted) return;
                event.preventDefault();
                const target = event.currentTarget;
                const next = `${story.slice(0, target.selectionStart)}${formatted}${story.slice(target.selectionEnd)}`;
                onChange({ transcriptStory: next });
              }}
              rows={14}
              placeholder="Paste the Burmese story here."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeechLanguageDialog({
  replacing,
  dismiss,
  onGenerate,
}: {
  replacing: boolean;
  dismiss: () => void;
  onGenerate: (language: MovieRecapSpeechLanguage) => void;
}) {
  const [language, setLanguage] = useState<MovieRecapSpeechLanguage>("chinese");
  const options: { value: MovieRecapSpeechLanguage; label: string; hint: string }[] = [
    { value: "chinese", label: "Chinese", hint: "FunASR" },
    { value: "other", label: "Other language", hint: "Whisper, language detected automatically" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">What language is spoken?</h3>
        <p className="mt-1 text-sm text-fg-2">
          {replacing
            ? "The automatic read writes a new source transcript over the one in this step. The Burmese story is not touched."
            : "Picks the speech recognizer for the video's audio."}
        </p>
      </div>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-panel-2">
            <Radio name="speech-language" value={option.value} checked={language === option.value} onChange={() => setLanguage(option.value)} />
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-fg-3">{option.hint}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" onClick={dismiss}>Cancel</AppButton>
        <AppButton variant="primary" onClick={() => { dismiss(); onGenerate(language); }}>Generate</AppButton>
      </div>
    </div>
  );
}
