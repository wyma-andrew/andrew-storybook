"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, FileText, Languages, Loader2, Pause, Play } from "lucide-react";
import { Dialog, Textarea, toast, useFilePicker } from "@geckoui/geckoui";
import type { MovieRecapProject } from "@/lib/api/types";
import { Button as AppButton, LinkButton } from "@/components/ui/Button";
import { MOVIE_RECAP_VOICES } from "@/lib/constants/movie-recap";
import { formatMovieRecapSourceTranscript } from "@/lib/movie-recap-source-transcript";
import { useWrite } from "@/lib/spoosh";
import { audioUrlFromBase64 } from "@/lib/tts/audio-url";

function cleanImportedTranscript(raw: string) {
  return formatMovieRecapSourceTranscript(raw.replace(/&#x20;|&#32;|&nbsp;/gi, " "));
}

function formatTimestampedStoryPaste(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])[\t ]+(?=\d{1,2}:\d{2}\b)/g, "$1\n");
}

function buildMovieRecapTranslationPrompt(sourceText: string) {
  return `You are a Burmese movie-recap narrator. Convert the raw auto-generated transcript below into natural spoken Burmese narration, synchronized with timestamps.

STEP 1 — CLEAN THE SOURCE (do this internally; do not output it)
1. Remove sound tags such as [music], [applause], [laughter], and speaker markers ">>". Drop any line with no spoken text left.
2. Join the caption fragments and re-split them so that each line holds exactly ONE complete sentence (ending in ".", "?" or "!", including when followed by a closing quote).
3. Give each sentence the timestamp of the caption line where its first word appears. Exception: if the sentence starts in the last 1–2 words of a caption line, use the NEXT caption line's timestamp.
4. If a quote contains several sentences, split them into separate lines.

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

STYLE
- Write like a Burmese YouTube movie-recap narrator speaking continuously over the video, as if explaining the story to a friend.
- Use everyday spoken Burmese — not formal written Burmese, news-report style, subtitle style, or textbook translation.
- Casual, clear, fast-moving, and easy to listen to.
- Link lines with natural connectors so the narration flows from one line into the next, e.g. "အဲ့ဒီနောက်", "ဒီလိုနဲ့", "အဲဒီအချိန်မှာ", "ဒါပေမယ့်", "တစ်ဖက်မှာတော့", "နောက်တစ်နေ့မှာ", "အဲ့လိုဖြစ်နေရင်း" — only where they sound natural, and without overusing the same one.
- Describe what happens directly and confidently, as if the narrator is watching it.

ACCURACY
- Keep the original meaning and order of events. Do not add information that is not in the source.
- Simplify complicated phrasing, not content. Do not drop details just to make it shorter.
- Keep names and story-specific terms (people, places, organizations, objects, technical terms) accurate and consistent throughout.

WORDING
- Rewrite English sentence structure into natural Burmese word order. Never translate word-for-word.
- Omit subjects and pronouns where Burmese speech naturally allows it, and avoid repeating the same name unnecessarily.
- For English names, acronyms and terms that will be read aloud, use Burmese phonetic spelling when it helps TTS pronunciation (e.g. CIA → စီအိုင်အေ).
- Write numbers and quantities in spoken form when appropriate (e.g. 80,000 feet → ပေ ၈သောင်း), but keep codes, model numbers, coordinates and other exact identifiers unchanged.
- Avoid formal fillers such as "ဖြစ်ကြောင်း", "ဟုဆိုသည်", "တွေ့ရှိရသည်", "လုပ်ဆောင်ခဲ့သည်".
- Avoid hearsay endings such as "တဲ့", "လို့ဆိုပါတယ်", "လို့သိရပါတယ်" when describing what happens on screen; use them only for reported speech.
- Avoid "လုပ်ရတယ်" unless the source actually means "must / has to".

TIMESTAMP RULES
1. Output exactly one line per cleaned source line, with the same timestamp, in the same order. Never merge, skip, or add lines.
2. Every timestamp must be followed by its narration on the same line. No timestamp may stand alone.
3. Each line must read as a complete, natural spoken chunk. Do not end a line with a word that grammatically belongs to the next line.

OUTPUT FORMAT
- One line per timestamp: MM:SS  Burmese narration
- Two spaces between the timestamp and the text.
- Output only the Burmese narration lines — no cleaned English, headings, notes, or explanations.

STYLE REFERENCE (match its tone and rhythm only — do not copy its content):
"မြောက်ကိုရီးယားစစ်တပ်ရဲ့ တပ်စခန်းတစ်ခုမှာ စစ်သားတစ်ယောက်က လူမသိအောင် တစ်ယောက်တည်း ခိုးထွက်လာပြီး လေဝင်ပေါက်ထဲဝင်ကာ သူသိမ်းထားတဲ့မြေပုံကို ထုတ်ကြည့်ပါတယ်။ ပြီးတော့ သံလိုက်အိမ်မြှောင်ပြတဲ့လမ်းအတိုင်း လျှပ်စစ်လွှတ်ထားတဲ့ ခြံစည်းရိုးကိုကျော်ပြီး ရှေ့ဆက်သွားပါတယ်။ လမ်းတစ်လျှောက်မှာလည်း မြေပုံပေါ်မပါသေးတဲ့ မြေမြှုပ်မိုင်းနေရာတွေကို တွေ့သမျှ ထပ်မှတ်ထားရင်း အဝေးမှာ မီးတွေထိန်ထိန်လင်းနေတဲ့ နယ်စပ်ဘက်ကို မျှော်လင့်တကြီးကြည့်နေပါတယ်။"

SOURCE TEXT:
${sourceText.trim()}`;
}

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
 * The source's dialogue and its Burmese retelling, both typed in by hand.
 *
 * The automatic read (subtitle track / Whisper) and the AI retelling are
 * disconnected for now — the pipeline and its route are still there, and
 * nothing calls them. See history/movie-recap.md.
 */
export function MovieRecapTranscript({
  project,
  onChange,
}: {
  project: MovieRecapProject;
  /** Edits land in the wizard's project draft; Continue is what writes them. */
  onChange: (patch: { transcriptText?: string; transcriptStory?: string; voiceProfileId?: MovieRecapProject["voiceProfileId"] }) => void;
}) {
  const { trigger: generateVoicePreview } = useWrite((api) => api("voices/preview").POST());
  const text = project.transcriptText ?? "";
  const story = project.transcriptStory ?? "";
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrls = useRef(new Map<string, string>());
  const [playing, setPlaying] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  async function togglePreview(voice: (typeof MOVIE_RECAP_VOICES)[number]) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === voice.id) {
      audio.pause();
      return;
    }

    const cacheKey = voice.providerId === "voxcpm"
      ? `${voice.id}:${voice.params.referenceAudioHash}:${voice.params.referenceText ?? ""}`
      : voice.id;
    let src = voice.previewUrl ?? previewUrls.current.get(cacheKey) ?? null;
    if (!src) {
      setPreviewLoading(voice.id);
      const result = await generateVoicePreview({ body: { voiceId: voice.id }, invalidate: false });
      setPreviewLoading(null);
      if (result.error || !result.data) {
        toast.error(result.error?.error ?? "Could not generate the voice preview.");
        return;
      }
      src = audioUrlFromBase64(result.data.audioBase64, result.data.contentType);
      previewUrls.current.set(cacheKey, src);
    }

    audio.src = src;
    setPlaying(voice.id);
    void audio.play().catch(() => {
      setPlaying(null);
      toast.error("Voice preview audio could not be played.");
    });
  }

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  async function copyTranslationPrompt() {
    try {
      await navigator.clipboard.writeText(buildMovieRecapTranslationPrompt(text));
      toast.success("Translation prompt copied.");
    } catch {
      toast.error("Could not copy the translation prompt.");
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Transcript</h2>
      <p className="mb-3 text-sm text-fg-2">
        Paste the Burmese story, with a timestamp on each line. The source transcript is optional — it is kept for
        reference and nothing downstream reads it.
      </p>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col items-start gap-2">
            <LinkButton
              href="https://www.youtube-transcript.io/"
              target="_blank"
              rel="noreferrer"
              variant="primary"
              className="inline-flex items-center gap-2"
            >
              Get YouTube Transcript
              <ExternalLink size={15} aria-hidden="true" />
            </LinkButton>
            <LinkButton
              href="https://captioner.io/en/rednote"
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              className="inline-flex items-center gap-2 !border-rednote !bg-rednote !text-on-rednote hover:!bg-rednote"
            >
              Get RedNote Transcript
              <ExternalLink size={15} aria-hidden="true" />
            </LinkButton>
          </div>
          <ChevronRight size={17} className="text-fg-3" aria-hidden="true" />
          <AppButton
            variant="secondary"
            className="inline-flex items-center gap-2"
            onClick={() => showTranscriptImport((imported) => {
              onChange({ transcriptText: imported });
            })}
          >
            Import
          </AppButton>
        </div>
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
              <AppButton variant="secondary" className="inline-flex items-center gap-2" onClick={() => void copyTranslationPrompt()}>
                <Copy size={15} aria-hidden="true" />
                Copy translation prompt
              </AppButton>
            </div>
          </div>
        </div>

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

        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="mb-3 text-sm font-medium">Narration voice</div>
          <div className="grid grid-cols-2 gap-2">
            {MOVIE_RECAP_VOICES.map((voice) => {
              const selected = project.voiceProfileId === voice.id;
              return (
                <div key={voice.id} className={`flex items-center gap-2 rounded-xl border p-3 ${selected ? "border-accent bg-accent-dim" : "border-line bg-panel"}`}>
                  <AppButton
                    aria-label={playing === voice.id ? `Pause ${voice.name} voice preview` : `Play ${voice.name} voice preview`}
                    disabled={previewLoading !== null}
                    onClick={() => void togglePreview(voice)}
                    className="!h-9 !w-9 shrink-0 !rounded-full !border-0 !bg-accent !p-0 !text-on-accent"
                  >
                    {previewLoading === voice.id ? <Loader2 size={15} className="animate-spin" /> : playing === voice.id ? <Pause size={15} /> : <Play size={15} />}
                  </AppButton>
                  <AppButton
                    onClick={() => onChange({ voiceProfileId: voice.id })}
                    className="!h-9 min-w-0 flex-1 !justify-between !border-0 !bg-transparent !px-2 !text-fg"
                  >
                    <span className="font-semibold">{voice.name}</span>
                    {selected && <Check size={16} className="text-accent" aria-label="Selected" />}
                  </AppButton>
                </div>
              );
            })}
          </div>
          <audio ref={audioRef} onPause={() => setPlaying(null)} onEnded={() => setPlaying(null)} />
        </div>
      </div>
    </div>
  );
}
