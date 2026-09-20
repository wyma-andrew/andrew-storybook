"use client";

import { useState } from "react";
import { AlertTriangle, Check, ClipboardCopy, FileText, MoreHorizontal, RefreshCw, Scissors, Undo2 } from "lucide-react";
import { ConfirmDialog, Dialog, Menu, MenuItem, MenuTrigger, Textarea } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";
import type { MovieRecapProject } from "@/lib/api/types";
import { beatFootageS, beatOverrunS, formatDuration } from "@/lib/movie-recap";
import { buildOverrunPrompt, parseBeatEdits } from "@/lib/movie-recap-beat-transfer";
import { MovieRecapRenderProgress } from "./MovieRecapRenderProgress";

/**
 * The script, MEASURED, before anything is cut.
 *
 * This is the step the whole pipeline was rearranged around. Every beat's line
 * has been spoken and timed against the footage behind it, so an overrun — words
 * with no picture left to play under them — is a number here rather than a held
 * frame discovered an hour into a render. Shortening a line re-speaks that beat
 * and nothing else. See history/movie-recap.md.
 */
export function MovieRecapScript({
  project,
  onBuild,
  onRecheckAll,
  onSave,
  onCancel,
  onDirtyChange,
  onApplyBeats,
  applyingBeats,
  building,
  recheckingAll,
  checking,
  cancelling,
}: {
  project: MovieRecapProject;
  onBuild: () => void;
  onRecheckAll: () => void;
  /** `measure` re-speaks the beat to time it again; false just stores the words. */
  onSave: (index: number, text: string, measure: boolean) => void;
  onCancel: () => void;
  /** How many beats have unsaved edits, so the wizard can guard leaving the step. */
  onDirtyChange: (count: number) => void;
  /** Writes several beats back at once; resolves with how many actually changed. */
  onApplyBeats: (edits: { index: number; text: string }[]) => Promise<number>;
  applyingBeats: boolean;
  building: boolean;
  recheckingAll: boolean;
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
  const overruns = script.filter((beat) => beatOverrunS(beat) > 0.05).length;
  const stale = script.filter((beat) => beat.audioStale).length;
  const totalFootageS = script.reduce((total, beat) => total + beatFootageS(beat), 0);
  const totalAudioS = script.reduce((total, beat) => total + (beat.audioS ?? 0), 0);
  const totalOverrunS = script.reduce((total, beat) => total + beatOverrunS(beat), 0);
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

  const overrunPrompt = buildOverrunPrompt(script);

  const [reportedDirty, setReportedDirty] = useState(dirtyCount);
  if (reportedDirty !== dirtyCount) {
    setReportedDirty(dirtyCount);
    onDirtyChange(dirtyCount);
  }

  return (
    <>
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
            {overrunPrompt && (
              <Button
                disabled={busy}
                onClick={() => openOverrunFix(overrunPrompt, script.length, onApplyBeats)}
              >
                <Scissors size={14} /> Fix overruns
              </Button>
            )}
            {/* Behind a menu, not in the row: one re-speaks every beat and the
              other throws them away and rebuilds from the transcript. Neither is
              part of reading the script, and Resync a click away from the line
              someone had just edited was a mis-click waiting to happen. */}
            {script.length > 0 && (
              <Menu menuClassName="min-w-[220px] p-0" placement="bottom-end">
                <MenuTrigger>
                  {({ toggleMenu }) => (
                    <Button
                      className="!h-8 !w-8 !px-0"
                      disabled={busy || building || recheckingAll}
                      onClick={toggleMenu}
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  )}
                </MenuTrigger>
                <MenuItem disabled={busy || dirty || checking !== null} onClick={onRecheckAll}>
                  Re-check all beats
                </MenuItem>
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
              <span className="font-medium text-fg">{totalFootageS.toFixed(0)}s</span> of video
              {unmeasured < script.length && (
                <>
                  {" · "}
                  <span className="font-medium text-fg">{totalAudioS.toFixed(0)}s</span> of narration
                  {unmeasured > 0 && " so far"}
                </>
              )}
            </span>
            {overruns > 0 && (
              <span className="flex items-center gap-1 font-medium text-danger tabular-nums">
                <AlertTriangle size={12} /> {overruns} beat
                {overruns === 1 ? "" : "s"} over by {totalOverrunS.toFixed(1)}s
              </span>
            )}
            {unmeasured > 0 && (
              <span className="flex items-center gap-1 font-medium text-fg-2 tabular-nums">
                <AlertTriangle size={12} /> {unmeasured} beat
                {unmeasured === 1 ? "" : "s"} never spoken — re-check to measure {unmeasured === 1 ? "it" : "them"}
              </span>
            )}
            {overruns === 0 && unmeasured === 0 && (
              <span className="flex items-center gap-1 font-medium text-ok">
                <Check size={12} strokeWidth={3} /> Every beat fits its footage
              </span>
            )}
            {stale > 0 && <span className="text-fg-3">{stale} not re-checked since editing</span>}
            {dirty && (
              <span className="ml-auto text-fg-3">
                Save or re-check the {dirtyCount} edited beat
                {dirtyCount === 1 ? "" : "s"} first
              </span>
            )}
            {recheckingAll && <span className="ml-auto text-fg-3">Re-checking every beat…</span>}
          </div>
        )}

        {script.length > 0 && (
          <div className="space-y-3">
            {script.map((beat, index) => {
              const footageS = beatFootageS(beat);
              const overrunS = beatOverrunS(beat);
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
                      · {footageS.toFixed(1)}s of video
                      {typeof beat.audioS === "number" && ` / ${beat.audioS.toFixed(1)}s to read`}
                    </span>
                    {overrunS > 0.05 && (
                      <span className="flex items-center gap-1 font-medium text-danger tabular-nums">
                        <AlertTriangle size={12} /> +{overrunS.toFixed(1)}s over
                      </span>
                    )}
                    {beat.audioStale && !changed && <span className="text-fg-2">· timing not re-checked</span>}
                    {changed && <span className="text-fg-2">· edited, unsaved</span>}
                  </div>
                  <Textarea
                    rows={2}
                    value={texts[index] ?? ""}
                    disabled={busy}
                    onChange={(event) => setTexts(texts.map((text, i) => (i === index ? event.target.value : text)))}
                  />
                  {(changed || restorable) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      {/* Two buttons, deliberately. Re-check costs a TTS call and
                        is the only thing that makes the number beside the line
                        true again; Save is for an edit that plainly cannot have
                        moved the timing, and marks the measurement stale rather
                        than paying to confirm what the user already knows. */}
                      {changed && (
                        <>
                          <LoadingButton
                            variant="primary"
                            loading={checking === index}
                            disabled={busy || !texts[index]?.trim() || checking !== null}
                            onClick={() => onSave(index, texts[index], true)}
                          >
                            <RefreshCw size={14} /> Re-check this beat
                          </LoadingButton>
                          <LoadingButton
                            loading={checking === index}
                            disabled={busy || !texts[index]?.trim() || checking !== null}
                            onClick={() => onSave(index, texts[index], false)}
                          >
                            Save without re-checking
                          </LoadingButton>
                        </>
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
              {stale} beat{stale === 1 ? "" : "s"} saved without re-checking — their timings are the previous
              wording&apos;s.
            </span>
          )}
          {!dirty && overruns > 0 && (
            <span className="text-xs text-fg-3">
              {overruns} beat{overruns === 1 ? "" : "s"} will hold a frame.
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The round trip, in a modal.
 *
 * Editing Burmese well is a job for whichever chat the user already trusts with
 * it, so this hands the overrunning lines over as one block and takes the answer
 * back as one block. Beat NUMBERS are the anchor, so a reply that reworded the
 * header still lands.
 *
 * Its own state, not the panel's: a dialog shown imperatively renders a snapshot
 * of whatever it was handed, so anything that changes while it is open — the
 * paste, whether the write is in flight — has to live inside it.
 */
function openOverrunFix(
  prompt: string,
  beatCount: number,
  onApply: (edits: { index: number; text: string }[]) => Promise<number>
) {
  Dialog.show({
    className: "!w-[calc(100vw-2rem)] !max-w-[46rem]",
    content: ({ dismiss }) => <OverrunFix prompt={prompt} beatCount={beatCount} onApply={onApply} onDone={dismiss} />,
  });
}

function OverrunFix({
  prompt,
  beatCount,
  onApply,
  onDone,
}: {
  prompt: string;
  beatCount: number;
  onApply: (edits: { index: number; text: string }[]) => Promise<number>;
  onDone: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const pasted = parseBeatEdits(paste, beatCount);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Fix the overruns somewhere else</span>
        <Button
          className="!h-7 !px-2 !text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(prompt).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check size={13} /> : <ClipboardCopy size={13} />} {copied ? "Copied" : "Copy the lines"}
        </Button>
      </div>
      <p className="mb-3 text-xs text-fg-3">
        Copy the overrunning lines with how much each has to lose, shorten them wherever you like, then paste the reply
        back here. Keep the [Beat N] headers.
      </p>
      <Textarea
        rows={10}
        value={paste}
        disabled={applying}
        placeholder="Paste the shortened lines here."
        onChange={(event) => setPaste(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <LoadingButton
          variant="primary"
          loading={applying}
          disabled={pasted.length === 0}
          onClick={() => {
            setApplying(true);
            void onApply(pasted)
              .then((changed) => {
                if (changed > 0) onDone();
              })
              .finally(() => setApplying(false));
          }}
        >
          Apply {pasted.length || ""}
        </LoadingButton>
        <Button disabled={applying} onClick={onDone}>
          Close
        </Button>
        {paste.trim() && pasted.length === 0 && <span>No [Beat N] headers found in that paste.</span>}
        {pasted.length > 0 && (
          <span>
            {pasted.length} beat{pasted.length === 1 ? "" : "s"} read from the paste
          </span>
        )}
      </div>
    </div>
  );
}

// Rebuilding goes back to the Transcript step's text, so every beat edited here
// is lost. Normal work — re-checking a line, saving one — reads the beats below
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
