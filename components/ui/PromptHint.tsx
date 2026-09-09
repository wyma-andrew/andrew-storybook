"use client";

import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { Tooltip } from "@geckoui/geckoui";
import type { PromptHintText } from "@/lib/constants/system-prompts";

// A location has four copy buttons and the difference between them is not
// guessable from the labels — which preset each one stitches on, what has to be
// attached to the generation, and the order they run in.
//
// The attach line is deliberately loud (accent color, own row under a rule,
// paperclip): the failure it prevents is silent. A prompt pasted without its
// plan or its approved view still generates a perfectly good image — of a
// different place — and that only shows up shots later.
export function PromptHint({ hint, children }: { hint: PromptHintText; children: ReactNode }) {
  return (
    <Tooltip
      triggerAsChild
      placement="top"
      sideOffset={6}
      // GeckoUI's tooltip ships a light-theme background and inherits the
      // trigger's text color, which on this dark UI rendered dark-on-dark.
      // backgroundColor also paints the arrow, so it can't be done in CSS alone.
      backgroundColor="#1e1e1e"
      className="max-w-64 rounded-lg border border-line-2 px-2.5 py-2 text-left"
      content={
        <span className="block text-[11.5px] leading-snug !text-fg">
          <span className="block">{hint.what}</span>
          <span className="mt-2 flex items-start gap-1.5 border-t border-line-2 pt-2 font-medium !text-isnew">
            <Paperclip size={12} className="mt-px shrink-0" />
            <span>{hint.attach}</span>
          </span>
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}
