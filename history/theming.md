# Light / dark theming

Covers: `app/globals.css` (the `@theme inline` block and the `:root`/`html.light`
palettes), `lib/theme.ts`, `components/ThemeProvider.tsx`, the theme item in
`components/AccountMenu.tsx`, `app/layout.tsx`, the `--scene-*` variables read by
`lib/constants/scene-colors.ts`.

## 2026-09-12 — Theme is a user choice, dark is the default; no OS following

**Decision: `<html>` always carries `dark` or `light`. The default is `dark` for
everyone, and the only way to change it is the item in the account menu, stored
in `localStorage`.** `prefers-color-scheme` is deliberately not consulted.

The app is a dark tool by identity — every screenshot, every prompt card and the
whole palette were designed against near-black. Following the OS would hand a
light UI to existing users who never asked for one, on a machine setting they
made for something else. The user chose this explicitly over "toggle + system
default".

**Consequences:**

- The server renders `class="dark"` unconditionally, so a light-mode user would
  get a dark flash. `THEME_INIT_SCRIPT` (`lib/theme.ts`) is inlined into `<head>`
  and fixes the class before first paint. It is a string, not a bundled module,
  for exactly that reason — it must run before React.
- `<html>` carries `suppressHydrationWarning`: the script edits the class the
  server just rendered, which is a deliberate mismatch.
- `useTheme` reads the class off `<html>` through `useSyncExternalStore` instead
  of holding React state. The class is already correct before React runs, so a
  state copy would only be a second, later answer to a settled question — and
  `getServerSnapshot` returning the default is what keeps hydration clean.

## 2026-09-12 — Palette indirection: `@theme inline` over `--c-*`

**Decision: the raw colors live on `:root`/`html.dark` and `html.light` as
`--c-*`, and `@theme inline` maps our semantic token names onto those
variables.**

Tailwind v4 bakes `@theme` values into the utilities at build time, so a palette
written directly into `@theme` cannot switch at runtime. Pointing each token at
a `--c-*` variable is what makes `bg-panel` mean something different under
`html.light` without a second set of classes.

**Rejected:**

- *`dark:` variants on every element.* It doubles every class list, and the
  decision about a color would then live in ~20 components instead of one file.
- *A separate light stylesheet.* Two palettes that drift; the point of tokens is
  that there is one place to look.

**Consequences:**

- GeckoUI's variables (`--color-surface-*`, `--color-text-*`, `--color-border-*`,
  `--color-primary-*`, scrollbar) are NOT Tailwind tokens, so they are set on the
  same two selectors directly, once per theme. This supersedes `AGENTS.md`'s
  earlier "dark-only, set on `:root`" rule.
- Every color a component needs must be a token. The 39 hardcoded hex literals
  that existed before this change were replaced with new tokens — `panel-3`,
  `sunken`, `raised`, `chip`, `hover`, `hover-2`, `line-3`, `fg-code`,
  `on-accent`, `new-card-border`, `danger-hover`, `thumb-from`/`to`,
  `avatar-from`/`to`. A new hardcoded hex in JSX is a light-mode bug by
  construction.
- `PromptHint` passes `backgroundColor="var(--color-line)"` to GeckoUI's Tooltip
  rather than a hex, because that prop also paints the arrow and cannot be done
  in CSS.

## 2026-09-12 — Scene badge weight belongs to the theme, hue to the scene

**Decision: `sceneColorVars` emits only `--scene-hue`. Saturation, lightness and
the badge's text color come from `--scene-s` / `--scene-l` / `--scene-fg`, set
per theme in `globals.css`.**

The hue identifies the scene and must not change with the theme. The weight must:
`42% / 72%` reads on a near-black panel and washes out on a light one, so light
mode uses `55% / 38%` with white text instead of near-black. Keeping both in the
component would have meant duplicating the badge classes per theme.
