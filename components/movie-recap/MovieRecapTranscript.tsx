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
  return `Translate the following text into natural spoken Burmese for a movie recap narration.

STYLE:
Write like a Burmese YouTube movie-recap narrator speaking continuously over the video.
Use natural everyday spoken Burmese, not formal written Burmese and not textbook-style translation.
The narration should flow smoothly from one action to the next, as if the narrator is watching the scene and explaining what is happening.
Prefer connected storytelling sentences instead of many short, separate sentences.
Use natural connectors such as:
"အဲ့ဒီနောက်", "ဒီလိုနဲ့", "အဲဒီအချိန်မှာ", "ဒါပေမယ့်", "တစ်ဖက်မှာတော့", "နောက်တစ်နေ့မှာ", "အဲ့လိုဖြစ်နေရင်း", "အဲဒီနောက်မှာတော့"
only when they sound natural in context.
Describe actions directly and confidently. Do not make the narration sound like hearsay.

TONE:
Casual, clear, fast-moving, and easy to listen to.
It should sound like a real Burmese person explaining a movie to a friend.
Keep the original meaning and sequence of events accurate.
Make complicated sentences easier to understand, but do not remove important story information.
When several actions happen continuously, combine them naturally into one flowing narration.

WORDING:
Choose Burmese expressions that people commonly use in speech.
Avoid direct word-for-word translation from English.
Rewrite awkward English sentence structures into natural Burmese sentence order.
Use character names naturally when needed, but avoid repeating the same name unnecessarily.
Pronouns and subjects may be omitted when Burmese speech naturally allows it.
Keep military, location, object, and story-specific terms accurate.
For English acronyms, names, and terms that will be spoken aloud, use Burmese phonetic spelling when it improves TTS pronunciation. For example, write CIA as စီအိုင်အေ and Blackbird as ဘလက်ဘဒ်.
Rewrite quantities and numbers into natural spoken Burmese forms when appropriate. For example, write 80,000 feet as ပေ ၈သောင်း so the narrator does not read each digit separately.
Do not change a technical code, model number, coordinate, or other identifier when its exact form carries meaning.

**TIMESTAMP & LINE MATCHING RULES:**

1. **Strict 1-to-1 Preservation:** Keep EVERY single timestamp line from the source text. Do NOT merge, skip, drop, or omit any timestamp under any circumstances.
2. **Line-by-Line Alignment:** Each timestamp in the output MUST correspond to the source beat timing it belongs to. You may move a dangling word or phrase into the immediately following timestamp line when needed for natural Burmese phrasing; keep all events in their original order.
3. **Flow Across Line Breaks:** Maintain a natural, continuous spoken narrative flow, but place a line break before every new timestamp to keep each visual beat synchronized. Do not combine text into longer paragraphs if it bypasses an existing timestamp beat.
4. **No Standalone Timestamps:** Never output a timestamp on a line by itself without narration text next to it. Every timestamp must be immediately followed by its translated narration fragment.
5. **Natural Line Breaks:** Do not end a line with a dangling word that grammatically belongs to the next line (e.g., a lone subject like "သူ" or a split phrase like "အဲဒီ / အချိန်ကျမှ"). Move that word to the start of the next timestamp line so each line reads as a natural spoken chunk.

IMPORTANT:

Do NOT use overly formal phrases.
Do NOT write like a news report.
Do NOT write like subtitles.
Do NOT translate sentence by sentence mechanically.
Do NOT add information that is not in the source.
Do NOT use unnecessary phrases such as "ဖြစ်ကြောင်း", "ဟုဆိုသည်", "တွေ့ရှိရသည်", "လုပ်ဆောင်ခဲ့သည်" unless the context truly requires them.
Avoid sentence-final hearsay expressions like "တဲ့", "လို့ဆိုပါတယ်", or "လို့သိရပါတယ်" when the narrator directly knows or sees what happens.
Avoid unnecessary obligation/inference wording such as "လုပ်ရတယ်" unless the source actually means "has to / must."
Do not make the Burmese shorter merely to simplify it. Preserve enough detail for the viewer to understand exactly what is happening.

TARGET STYLE EXAMPLE:
"မြောက်ကိုရီးယားစစ်တပ်ရဲ့ တပ်စခန်းတစ်ခုမှာ စစ်သားတစ်ယောက်က လူမသိအောင် တစ်ယောက်တည်း ခိုးထွက်လာပြီး လေဝင်ပေါက်ထဲဝင်ကာ သူသိမ်းထားတဲ့မြေပုံကို ထုတ်ကြည့်ပါတယ်။ ပြီးတော့ သံလိုက်အိမ်မြှောင်ပြတဲ့လမ်းအတိုင်း လျှပ်စစ်လွှတ်ထားတဲ့ ခြံစည်းရိုးကိုကျော်ပြီး ရှေ့ဆက်သွားပါတယ်။ လမ်းတစ်လျှောက်မှာလည်း မြေပုံပေါ်မပါသေးတဲ့ မြေမြှုပ်မိုင်းနေရာတွေကို တွေ့သမျှ ထပ်မှတ်ထားရင်း အဝေးမှာ မီးတွေထိန်ထိန်လင်းနေတဲ့ နယ်စပ်ဘက်ကို မျှော်လင့်တကြီးကြည့်နေပါတယ်။"
The output should have this same spoken storytelling rhythm and flow.

SOURCE TEXT:
${sourceText.trim()}

OUTPUT:
Return only the final Burmese movie-recap narration with the preserved timestamps.`;
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
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
