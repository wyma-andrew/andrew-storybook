"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, MoreHorizontal, Pause, Play, RefreshCw, Undo2, X } from "lucide-react";
import { ConfirmDialog, Menu, MenuItem, MenuTrigger, Textarea, toast } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { MOVIE_RECAP_NARRATION_PRELOAD_BEATS } from "@/lib/constants/movie-recap";
import { formatDuration } from "@/lib/movie-recap";
import { apiClient } from "@/lib/spoosh";
import { audioUrlFromBase64 } from "@/lib/tts/audio-url";
import { MovieRecapRenderProgress } from "./MovieRecapRenderProgress";

/**
 * The narration timeline, measured once and cached per beat. Editing and
 * rebuilding a line replaces only that beat plus the combined narration master;
 * it never moves the selected scenes or rebuilds unrelated beats.
 */
export function MovieRecapScript({
  project,
  onBuild,
  onSave,
  onCancel,
  onDirtyChange,
  onApplyBeats,
  applyingBeats,
  building,
  checking,
  cancelling,
}: {
  project: MovieRecapProject;
  onBuild: () => void;
  /** Rebuilds this beat's audio and the combined narration master. */
  onSave: (index: number, text: string) => void;
  onCancel: () => void;
  /** How many beats have unsaved edits, so the wizard can guard leaving the step. */
  onDirtyChange: (count: number) => void;
  /** Writes several beats back at once; resolves with how many actually changed. */
  onApplyBeats: (edits: { index: number; text: string }[]) => Promise<number>;
  applyingBeats: boolean;
  building: boolean;
  /** Index of the beat being re-spoken, or null. */
  checking: number | null;
  cancelling: boolean;
}) {
  const script = project.renderScript ?? [];
  const serverTexts = script.map((beat) => beat.text);
  const [texts, setTexts] = useState(serverTexts);
  // Reconciled against the server line by line, not wholesale. Saving one beat
  // returns the WHOLE script, so replacing the draft with it would throw away
  // every other beat the user had started editing — and a beat is saved one at a
  // time precisely so the others can be left alone. A line the server changed
  // wins (that is the save, or a fresh script run); a line it did not keeps
  // whatever is in the box.
  //
  // Done during render rather than in an effect: an effect would paint the stale
  // draft once before replacing it.
  const [lastServer, setLastServer] = useState(serverTexts);
  if (lastServer.length !== serverTexts.length || lastServer.some((text, i) => text !== serverTexts[i])) {
    setTexts(serverTexts.map((text, i) => (text === lastServer[i] ? (texts[i] ?? text) : text)));
    setLastServer(serverTexts);
  }

  const running = project.scriptStatus === "running";
  const busy = running || project.renderStatus === "running";
  const stale = script.filter((beat) => beat.audioStale).length;
  const totalAudioS = script.reduce((total, beat) => total + (beat.audioS ?? 0), 0);
  // A beat with no measurement is not a beat that fits. A script left by an
  // older render has none at all, and reading `beatOverrunS` alone made the
  // summary claim every line fitted when not one had been spoken.
  const unmeasured = script.filter((beat) => typeof beat.audioS !== "number").length;
  const dirtyCount = texts.reduce((total, text, index) => total + (text !== serverTexts[index] ? 1 : 0), 0);
  const dirty = dirtyCount > 0;
  // Reported up rather than lifted: the drafts belong to this component, and the
  // wizard only needs to know whether leaving the step would lose any.
  // The SAVED lines that no longer match what the script run first wrote. Offered
  // as one button because a paste changes many beats at once, and undoing it beat
  // by beat is not undoing it.
  const restorableAll = script
    .map((beat, index) => ({ index, text: beat.originalText ?? "" }))
    .filter((entry) => entry.text && entry.text !== script[entry.index].text);

  const [reportedDirty, setReportedDirty] = useState(dirtyCount);
  if (reportedDirty !== dirtyCount) {
    setReportedDirty(dirtyCount);
    onDirtyChange(dirtyCount);
  }

  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrls = useRef(new Map<string, string>());
  const previewPromises = useRef(new Map<string, Promise<string | null>>());
  const autoPlay = useRef(false);
  const playingBeatRef = useRef<number | null>(null);
  const [playingBeat, setPlayingBeat] = useState<number | null>(null);
  const [previewingBeat, setPreviewingBeat] = useState<number | null>(null);

  useEffect(() => {
    const urls = previewUrls.current;
    const promises = previewPromises.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      promises.clear();
    };
  }, []);

  function previewKey(index: number) {
    const beat = script[index];
    return beat ? `${index}:${beat.text}` : null;
  }

  async function loadBeatPreview(index: number, reportError: boolean) {
    const key = previewKey(index);
    if (!key || texts[index] !== serverTexts[index] || script[index]?.audioStale) return null;
    const cached = previewUrls.current.get(key);
    if (cached) return cached;
    const pending = previewPromises.current.get(key);
    if (pending) return pending;

    const request = (async () => {
      const result = await apiClient("movie-recaps/:id/script/beat/preview").POST({
        params: { id: project.id },
        body: { index },
      });
      if (result.error || !result.data) {
        if (reportError) toast.error(result.error?.error ?? "Could not prepare that beat preview.");
        return null;
      }
      const src = audioUrlFromBase64(result.data.audioBase64, result.data.contentType);
      previewUrls.current.set(key, src);
      return src;
    })().finally(() => previewPromises.current.delete(key));
    previewPromises.current.set(key, request);
    return request;
  }

  function prefetchFollowingBeats(index: number) {
    const next = Array.from({ length: MOVIE_RECAP_NARRATION_PRELOAD_BEATS }, (_, offset) => index + offset + 1)
      .filter(
        (candidate) =>
          candidate < script.length && texts[candidate] === serverTexts[candidate] && !script[candidate]?.audioStale
      );
    void Promise.allSettled(next.map((candidate) => loadBeatPreview(candidate, false)));
  }

  async function playBeatPreview(index: number) {
    const audio = audioRef.current;
    if (!audio) return false;
    setPreviewingBeat(index);
    const src = await loadBeatPreview(index, true);
    setPreviewingBeat(null);
    if (!src) return false;

    audio.pause();
    audio.src = src;
    try {
      await audio.play();
      playingBeatRef.current = index;
      setPlayingBeat(index);
      prefetchFollowingBeats(index);
      return true;
    } catch {
      playingBeatRef.current = null;
      setPlayingBeat(null);
      toast.error("That beat preview could not be played.");
      return false;
    }
  }

  async function toggleBeatPreview(index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingBeat === index && !audio.paused) {
      autoPlay.current = false;
      audio.pause();
      playingBeatRef.current = null;
      setPlayingBeat(null);
      return;
    }
    autoPlay.current = true;
    if (!(await playBeatPreview(index))) autoPlay.current = false;
  }

  async function continueToNextBeat() {
    const finished = playingBeatRef.current;
    playingBeatRef.current = null;
    setPlayingBeat(null);
    if (!autoPlay.current || finished === null) return;
    const next = finished + 1;
    if (next >= script.length || texts[next] !== serverTexts[next] || script[next]?.audioStale) {
      autoPlay.current = false;
      return;
    }
    if (!(await playBeatPreview(next))) autoPlay.current = false;
  }

  return (
    <>
      <audio ref={audioRef} className="hidden" onEnded={() => void continueToNextBeat()} />
      <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-fg-3" />
            <span className="text-sm font-medium">Narration script</span>
            {script.length > 0 && <span className="text-xs text-fg-3">{script.length} beats</span>}
          </div>
          <div className="flex items-center gap-2">
            {restorableAll.length > 0 && (
              <LoadingButton loading={applyingBeats} disabled={busy} onClick={() => void onApplyBeats(restorableAll)}>
                <Undo2 size={14} /> Restore {restorableAll.length} original
                {restorableAll.length === 1 ? "" : "s"}
              </LoadingButton>
            )}
            {/* Resync is intentionally the only whole-script action. */}
            {script.length > 0 && (
              <Menu menuClassName="min-w-[220px] p-0" placement="bottom-end">
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <Button
                      className="!h-8 !w-8 !px-0"
                      disabled={busy || building}
                      onClick={toggleMenu}
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  )}
                </MenuTrigger>
                <MenuItem
                  disabled={busy || !project.transcriptStory?.trim()}
                  onClick={() => confirmResync(onBuild, dirtyCount)}
                >
                  <span className="text-danger">Resync with Main Script</span>
                </MenuItem>
              </Menu>
            )}
          </div>
        </div>

        {running && (
          <div className="mb-4 rounded-lg border border-line bg-panel p-3">
            <MovieRecapRenderProgress project={project} phase="script" />
          </div>
        )}
        {project.scriptStatus === "failed" && project.scriptError && (
          <p className="mb-4 text-sm text-danger">{project.scriptError}</p>
        )}

        {script.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-3 py-2.5 text-xs">
            <span className="tabular-nums text-fg-2">
              {unmeasured < script.length && (
                <>
                  <span className="font-medium text-fg">{totalAudioS.toFixed(0)}s</span> of narration
                  {unmeasured > 0 && " so far"}
                </>
              )}
            </span>
            {unmeasured > 0 && (
              <span className="flex items-center gap-1 font-medium text-fg-2 tabular-nums">
                <AlertTriangle size={12} /> {unmeasured} beat
                {unmeasured === 1 ? "" : "s"} never spoken — rebuild {unmeasured === 1 ? "it" : "them"}
              </span>
            )}
            {unmeasured === 0 && <span className="font-medium text-ok">Narration timeline ready</span>}
            {stale > 0 && <span className="text-fg-3">{stale} need rebuilding</span>}
            {dirty && (
              <span className="ml-auto text-fg-3">
                Re Build {dirtyCount} edited beat
                {dirtyCount === 1 ? "" : "s"} first
              </span>
            )}
          </div>
        )}

        {script.length > 0 && (
          <div className="space-y-3">
            {script.map((beat, index) => {
              const changed = texts[index] !== serverTexts[index];
              // Offered against the BOX, so it disappears the moment the original
              // is back in it — whether that came from this button or by hand.
              const restorable = Boolean(beat.originalText) && texts[index] !== beat.originalText;
              return (
                <div key={index} className="rounded-lg border border-line bg-panel p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                    <span className="font-medium text-fg-2">Beat {index + 1}</span>
                    <span>{formatDuration(beat.shots[0]?.sourceStartS ?? 0)}</span>
                    <span>
                      · {beat.shots.length} shot
                      {beat.shots.length === 1 ? "" : "s"}
                    </span>
                    <span className="tabular-nums">
                      {typeof beat.audioS === "number" && `· ${beat.audioS.toFixed(1)}s narration`}
                    </span>
                    <Button
                      className="!h-7 !w-7 !px-0"
                      disabled={busy || changed || Boolean(beat.audioStale) || previewingBeat !== null}
                      aria-label={playingBeat === index ? `Pause beat ${index + 1}` : `Play beat ${index + 1} at configured speed`}
                      title={changed || beat.audioStale ? "Re Build this beat before previewing it" : "Play at configured narration speed"}
                      onClick={() => void toggleBeatPreview(index)}
                    >
                      {previewingBeat === index ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : playingBeat === index ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                    </Button>
                    {beat.audioStale && !changed && <span className="text-fg-2">· audio needs rebuilding</span>}
                    {changed && <span className="text-fg-2">· edited, unsaved</span>}
                  </div>
                  <Textarea
                    rows={2}
                    value={texts[index] ?? ""}
                    disabled={busy}
                    onChange={(event) => setTexts(texts.map((text, i) => (i === index ? event.target.value : text)))}
                  />
                  {(changed || restorable || beat.audioStale) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {changed && (
                        <Button
                          disabled={checking !== null}
                          onClick={() =>
                            setTexts(texts.map((text, i) => (i === index ? serverTexts[index] : text)))
                          }
                        >
                          <X size={14} /> Cancel
                        </Button>
                      )}
                      {restorable && (
                        // Puts the original back in the BOX, not in the row: the
                        // restore is reviewed and then saved like any other edit,
                        // so it costs nothing until it is wanted.
                        <Button
                          onClick={() => setTexts(texts.map((text, i) => (i === index ? beat.originalText! : text)))}
                        >
                          <Undo2 size={14} /> Restore original
                        </Button>
                      )}
                      {(changed || beat.audioStale) && (
                        <LoadingButton
                          variant="primary"
                          loading={checking === index}
                          disabled={busy || !texts[index]?.trim() || checking !== null}
                          onClick={() => onSave(index, texts[index])}
                        >
                          <RefreshCw size={14} /> Re Build this beat
                        </LoadingButton>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {script.length === 0 && (
            <LoadingButton
              variant="primary"
              loading={building}
              disabled={busy || !project.transcriptStory?.trim()}
              onClick={onBuild}
            >
              Build script
            </LoadingButton>
          )}
          {running && (
            <LoadingButton variant="danger" loading={cancelling} onClick={onCancel}>
              Cancel
            </LoadingButton>
          )}
          {dirty && <span className="text-xs text-fg-3">Save every edited beat before rendering.</span>}
          {!dirty && stale > 0 && (
            <span className="text-xs text-fg-3">
              Re Build {stale} beat{stale === 1 ? "" : "s"} to refresh their audio and timing.
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// Rebuilding goes back to the Transcript step's text, so every beat edited here
// is lost. Normal work — rebuilding one line — reads the beats below
// and never touches the transcript, which is why only this one asks.
function confirmResync(run: () => void, dirtyCount: number) {
  ConfirmDialog.show({
    title: "Resync with Main Script",
    content:
      "This rebuilds every beat from the Burmese story at the Transcript step: scenes are detected again, the story is divided again, and every line is spoken again. Every beat here is replaced by what the transcript says." +
      // Named and counted, because this is the one button still enabled while
      // beats are unsaved — the others wait for the edits, so it is the one that
      // gets clicked by someone trying to make progress.
      (dirtyCount > 0
        ? ` ${dirtyCount} beat${dirtyCount === 1 ? " has" : "s have"} unsaved edits right now, and those go too.`
        : ""),
    confirmButtonLabel: "Resync",
    cancelButtonLabel: "Cancel",
    // Swallowed on purpose: handing the promise to ConfirmDialog holds the
    // dialog open for the whole run, over the progress it should be showing.
    onConfirm: () => {
      run();
    },
  });
}
