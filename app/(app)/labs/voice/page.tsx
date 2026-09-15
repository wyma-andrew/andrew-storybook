"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Label, Textarea, toast } from "@geckoui/geckoui";
import { Check, Download, RefreshCw, Sparkles, Volume2, WandSparkles } from "lucide-react";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";
import { VOICE_LAB_MAX_TEXT_LENGTH, VOICE_LAB_PROFILES, type VoiceLabProfileId } from "@/lib/voice-lab";

const DEFAULT_TEXT =
  "ဒီဇာတ်လမ်းမှာ သာမန်လူတစ်ယောက်ရဲ့ မမျှော်လင့်ထားတဲ့ ခရီးစဉ်က အရာအားလုံးကို ပြောင်းလဲသွားစေခဲ့ပါတယ်။";

function audioUrlFromBase64(audioBase64: string, contentType: string) {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}

export default function VoiceLabPage() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [voiceId, setVoiceId] = useState<VoiceLabProfileId>("narrator");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<{ durationSeconds: number; generationMs: number; sampleRate: number } | null>(null);
  const { data: health, loading: healthLoading, trigger: checkHealth } = useRead(
    (api) => api("labs/voice/health").GET(),
    { staleTime: 0 },
  );
  const { trigger: generate, loading: generating } = useWrite((api) => api("labs/voice/generate").POST());
  const profile = VOICE_LAB_PROFILES.find((item) => item.id === voiceId)!;

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function handleGenerate() {
    const cleanText = text.trim();
    if (!cleanText) {
      toast.error("Enter Burmese text to generate.");
      return;
    }
    const result = await generate({ body: { text: cleanText, voiceId }, invalidate: false });
    if (result.error) {
      toast.error(result.error.error);
      return;
    }
    if (!result.data) return;
    const nextUrl = audioUrlFromBase64(result.data.audioBase64, result.data.contentType);
    setAudioUrl(nextUrl);
    setAudioMeta({
      durationSeconds: result.data.durationSeconds,
      generationMs: result.data.generationMs,
      sampleRate: result.data.sampleRate,
    });
    toast.success("Burmese narration generated.");
    void checkHealth();
  }

  function handleDownload() {
    if (!audioUrl) return;
    const anchor = document.createElement("a");
    anchor.href = audioUrl;
    anchor.download = "burmese-narrator.wav";
    anchor.click();
  }

  return (
    <>
      <TopBar>
        <Crumb><Link href="/labs/voice">Labs</Link> / <span className="text-fg">Voice</span></Crumb>
        <span className="ml-auto rounded-full border border-isnew-border bg-isnew-bg px-2.5 py-1 text-[10px] font-medium tracking-wide text-isnew uppercase">
          Experimental
        </span>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mx-auto max-w-5xl">
            <div className="mb-7">
              <div className="mb-2 flex items-center gap-2 text-accent">
                <WandSparkles size={18} />
                <span className="text-xs font-medium tracking-wider uppercase">Self-hosted TTS test bench</span>
              </div>
              <h1 className="text-2xl font-semibold">Burmese Voice Lab</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
                Generate a short narration with the same voice profile planned for Movie Recap. Nothing is saved to a project or the database.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-xl border border-line bg-panel-2 p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-2 bg-sunken text-accent">
                    <Volume2 size={17} />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold">Narration text</h2>
                    <p className="mt-1 text-xs text-fg-3">Burmese only for this first lab.</p>
                  </div>
                </div>

                <Label>Burmese script</Label>
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={8}
                  maxLength={VOICE_LAB_MAX_TEXT_LENGTH}
                  className="mt-2"
                  placeholder="မြန်မာစာကို ဒီနေရာမှာ ရေးပါ…"
                  disabled={generating}
                />
                <div className="mt-1.5 text-right text-[11px] text-fg-3">
                  {text.length} / {VOICE_LAB_MAX_TEXT_LENGTH}
                </div>

                <div className="mt-5">
                  <Label>Voice profile</Label>
                  <div className="mt-2 space-y-2">
                    {VOICE_LAB_PROFILES.map((item) => {
                      const selected = item.id === voiceId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={generating}
                          onClick={() => setVoiceId(item.id)}
                          className={`w-full rounded-xl border p-4 text-left transition-colors ${
                            selected ? "border-accent bg-accent-dim" : "border-line-2 bg-sunken hover:border-accent"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`grid size-9 shrink-0 place-items-center rounded-full ${
                                selected ? "bg-accent text-on-accent" : "border border-line-2 text-fg-3"
                              }`}
                            >
                              <Volume2 size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{item.name}</span>
                                {selected && (
                                  <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-on-accent">
                                    <Check size={10} /> Selected
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-fg-2">{item.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <LoadingButton
                  variant="primary"
                  className="mt-5 w-full justify-center"
                  loading={generating}
                  loadingText="Generating voice…"
                  disabled={generating || text.trim().length === 0 || text.length > VOICE_LAB_MAX_TEXT_LENGTH || !health?.reachable}
                  onClick={handleGenerate}
                >
                  <Sparkles size={16} /> Generate Burmese voice
                </LoadingButton>
                {!health?.reachable && !healthLoading && (
                  <p className="mt-2 text-center text-xs text-fg-3">Connect the voice worker before generating.</p>
                )}
              </section>

              <div className="space-y-5">
                <section className="rounded-xl border border-line bg-panel-2 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Worker status</h2>
                    <Button
                      variant="ghost"
                      className="ml-auto !size-8 !p-0"
                      title="Check worker again"
                      disabled={healthLoading}
                      onClick={() => void checkHealth()}
                    >
                      <RefreshCw size={14} className={healthLoading ? "animate-spin" : ""} />
                    </Button>
                  </div>
                  {healthLoading && !health ? (
                    <p className="text-xs text-fg-3">Checking voice worker…</p>
                  ) : (
                    <Alert
                      condensed
                      variant={health?.reachable ? "success" : health?.configured ? "error" : "warning"}
                      title={health?.reachable ? "Connected" : health?.configured ? "Unavailable" : "Setup required"}
                      description={health?.message ?? "Voice worker status is unavailable."}
                    />
                  )}
                  {health?.reachable && (
                    <dl className="mt-4 grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-xs">
                      <dt className="text-fg-3">Model</dt><dd className="truncate text-fg-2">{health.model}</dd>
                      <dt className="text-fg-3">Device</dt><dd className="text-fg-2">{health.device}</dd>
                      <dt className="text-fg-3">Loaded</dt><dd className="text-fg-2">{health.loaded ? "Yes" : "On first generation"}</dd>
                    </dl>
                  )}
                </section>

                <section className="rounded-xl border border-line bg-panel-2 p-4">
                  <h2 className="text-sm font-semibold">Generated audio</h2>
                  {audioUrl ? (
                    <>
                      <audio className="mt-4 w-full" controls src={audioUrl}>Your browser cannot play this audio.</audio>
                      {audioMeta && (
                        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-sunken p-2.5"><dt className="text-fg-3">Audio</dt><dd className="mt-1 text-fg-2">{audioMeta.durationSeconds.toFixed(1)} sec</dd></div>
                          <div className="rounded-lg bg-sunken p-2.5"><dt className="text-fg-3">Generated in</dt><dd className="mt-1 text-fg-2">{(audioMeta.generationMs / 1000).toFixed(1)} sec</dd></div>
                          <div className="col-span-2 rounded-lg bg-sunken p-2.5"><dt className="text-fg-3">Sample rate</dt><dd className="mt-1 text-fg-2">{audioMeta.sampleRate.toLocaleString()} Hz WAV</dd></div>
                        </dl>
                      )}
                      <Button className="mt-3 w-full justify-center" onClick={handleDownload}>
                        <Download size={15} /> Download WAV
                      </Button>
                    </>
                  ) : (
                    <div className="mt-4 grid min-h-40 place-items-center rounded-lg border border-dashed border-line-2 bg-sunken px-5 text-center">
                      <div>
                        <Volume2 className="mx-auto mb-2 text-fg-3" size={24} />
                        <p className="text-xs leading-relaxed text-fg-3">Generated narration will be playable and downloadable here.</p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </Wrap>
      </Body>
    </>
  );
}
