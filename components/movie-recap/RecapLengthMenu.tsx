"use client";

import { useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import { Dialog, Input, Menu, MenuItem, MenuTrigger } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/movie-recap";
import { RECAP_SHARE_LIMITS, recapShareOptions, recommendedRecapShare } from "@/lib/movie-recap-recap-length";

// Per-browser convenience only: the project's own choice is saved on the row,
// so losing this just means typing the custom value again.
const CUSTOM_SHARE_KEY = "movie-recap:custom-recap-share";

function readCustomShare() {
  try {
    const value = Number(localStorage.getItem(CUSTOM_SHARE_KEY));
    return value >= RECAP_SHARE_LIMITS.min && value <= RECAP_SHARE_LIMITS.max ? value : null;
  } catch {
    return null;
  }
}

function writeCustomShare(share: number) {
  try {
    localStorage.setItem(CUSTOM_SHARE_KEY, String(share));
  } catch {
    // The selection still applies to this project; it just isn't remembered.
  }
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

function CustomShareDialog({
  durationS,
  initial,
  dismiss,
  onSubmit,
}: {
  durationS: number;
  initial: number;
  dismiss: () => void;
  onSubmit: (share: number) => void;
}) {
  const [value, setValue] = useState(String(Math.round(initial * 100)));
  const share = Number(value) / 100;
  const valid = Number.isFinite(share) && share >= RECAP_SHARE_LIMITS.min && share <= RECAP_SHARE_LIMITS.max;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit(Math.round(share * 100) / 100);
        dismiss();
      }}
    >
      <div>
        <h3 className="text-base font-semibold">Custom recap length</h3>
        <p className="mt-1 text-sm text-fg-2">Share of the source the narration should run.</p>
      </div>
      <div className="flex items-center gap-2">
        <Input autoFocus type="number" min={RECAP_SHARE_LIMITS.min * 100} max={RECAP_SHARE_LIMITS.max * 100} value={value} onChange={(event) => setValue(event.target.value)} className="tabular-nums" />
        <span className="text-sm text-fg-2">%</span>
      </div>
      <p className={`text-xs ${valid ? "text-fg-3" : "text-danger"}`}>
        {valid
          ? `About ${formatDuration(durationS * share)} of narration for this video.`
          : `Enter ${RECAP_SHARE_LIMITS.min * 100}–${RECAP_SHARE_LIMITS.max * 100}%.`}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={dismiss}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!valid}>Use</Button>
      </div>
    </form>
  );
}

/** Auto mode's recap length; `null` follows the length-based recommendation. */
export function RecapLengthMenu({
  durationS,
  share,
  onChange,
}: {
  durationS: number;
  share: number | null;
  onChange: (share: number | null) => void;
}) {
  // Rendered only after the project has loaded in the browser, so reading
  // storage up front cannot disagree with a server render.
  const [customShare, setCustomShare] = useState(readCustomShare);

  const options = recapShareOptions(durationS);
  const recommended = recommendedRecapShare(durationS);
  const effective = share ?? recommended;
  const isPreset = share === null || options.some((option) => !option.recommended && option.share === share);
  // A project saved with a custom value shows it even on a browser that never
  // stored one.
  const custom = isPreset ? customShare : share;
  const describe = (value: number) => `~${formatDuration(durationS * value)} · ${percent(value)}`;

  function openCustom() {
    Dialog.show({
      className: "!max-w-sm",
      content: ({ dismiss }) => (
        <CustomShareDialog
          durationS={durationS}
          initial={custom ?? effective}
          dismiss={dismiss}
          onSubmit={(value) => {
            writeCustomShare(value);
            setCustomShare(value);
            onChange(value);
          }}
        />
      ),
    });
  }

  return (
    // Fixed, because the transcript box it sits in clips overflow.
    <Menu menuClassName="min-w-[240px] p-1" placement="bottom-end" floatingStrategy="fixed">
      <MenuTrigger>
        {({ toggleMenu }) => (
          <Button className="inline-flex items-center gap-2" onClick={toggleMenu}>
            <span className="text-fg-3">Recap</span>
            <span className="tabular-nums">{describe(effective)}</span>
            {share === null && <span className="text-xs text-fg-3">(Recommended)</span>}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        )}
      </MenuTrigger>
      {options.map((option) => {
        const selected = option.recommended ? share === null : share === option.share;
        return (
          <MenuItem key={`${option.share}-${option.recommended}`} onClick={() => onChange(option.recommended ? null : option.share)}>
            <span className="flex w-full items-center gap-2">
              <span className="tabular-nums">{describe(option.share)}</span>
              {option.recommended && <span className="text-xs text-accent">Recommended</span>}
              {selected && <Check size={14} className="ml-auto text-accent" aria-label="Selected" />}
            </span>
          </MenuItem>
        );
      })}
      {custom === null ? (
        <MenuItem onClick={openCustom}>Custom…</MenuItem>
      ) : (
        <MenuItem onClick={() => onChange(custom)}>
          <span className="flex w-full items-center gap-2">
            <span className="text-fg-3">Custom</span>
            <span className="tabular-nums">{describe(custom)}</span>
            {!isPreset && share === custom && <Check size={14} className="text-accent" aria-label="Selected" />}
            <Button
              variant="ghost"
              className="ml-auto !h-6 !w-6 !p-0"
              aria-label="Edit custom recap length"
              onClick={(event) => {
                event.stopPropagation();
                openCustom();
              }}
            >
              <Pencil size={12} />
            </Button>
          </span>
        </MenuItem>
      )}
    </Menu>
  );
}
