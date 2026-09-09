# Prompt hint tooltip

Covers: `components/ui/PromptHint.tsx`, the hint text in
`lib/constants/system-prompts.ts`.

## Standing decisions

- The attach line is deliberately loud (accent color, own row under a rule,
  paperclip). The failure it prevents is silent: a prompt pasted without its
  plan or approved view still generates a good image of the wrong place, and
  that only surfaces shots later.
- The tooltip is GeckoUI's `Tooltip`, per the project's GeckoUI-first UI rule.

## 2026-09-09 — Tooltip stayed frozen on screen while scrolling

GeckoUI's `Tooltip` calls `useFloating` **without**
`whileElementsMounted: autoUpdate` (every other floating component in the
library passes it), and has no `useDismiss`. So position is computed once at
open and never recomputed, and nothing closes it — the pointer never crosses the
trigger's boundary during a scroll, so `onMouseLeave` never fires. Result: an
open tooltip hangs at stale viewport coordinates over unrelated cards.

Fix: `PromptHint` tracks hover on a `display: contents` wrapper and, while
hovered, listens for `scroll` in the **capture** phase on `window` (the cards
scroll inside a container, and `scroll` does not bubble). First scroll bumps a
`key` on the Tooltip, remounting it closed. Closing on scroll is correct tooltip
behavior, so this is the intended end state, not a stopgap.

Rejected: replacing GeckoUI's Tooltip with a hand-rolled `@floating-ui/react`
one (`autoUpdate` + `useDismiss`) so the tooltip follows the trigger instead of
closing. It would make `@floating-ui/react` a direct dependency and step outside
the GeckoUI rule. **Revisit only with the user's approval.**
