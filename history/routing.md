Covers: app/(app)/**, app/api/(story)/**, lib/spoosh.ts (Spoosh keys), route.pathname redirects, components/Sidebar.tsx, components/Frame.tsx

## 2026-09-14 — Stories grouped under `(story)` for Movie Recap

Story feature files moved from top-level `app/stories` / `app/api/stories`
into a Next.js route group: `app/(story)/stories` / `app/api/(story)/stories`.
URLs are unchanged (`/stories*`, `/api/stories*`); Spoosh schema keys in
`lib/spoosh.ts` are unchanged (`stories`, `stories/:id`, etc).

**Why:** a new top-level feature, Movie Recap, is being added alongside
Stories. Grouping each product/project type's files under its own route
group (`app/(story)/*`, `app/(movie-recap)/*`) keeps ownership visible in the
file tree without moving either feature's URL.

**Superseded:** an earlier same-day version of this entry moved Stories to a
literal `/story/stories` URL prefix (also renaming Spoosh keys to
`story/stories`). Reverted — the user wants the route grouping without an
extra path segment in the URL.

**Consequence:** the Postgres table is still named `stories` and is
unaffected either way — `db.from("stories")` calls in API routes don't
change. Only the file location changed; behavior and URLs are identical to
before this history file existed.

## 2026-09-14 — Persistent sidebar added, Movie Recap stub page

No sidebar/nav component existed before this — every page was a standalone
`Frame` with only a breadcrumb `TopBar`. Added `components/Sidebar.tsx` (nav
links: Stories → `/stories`, Movie Recap → `/movie-recap`) and wired it into
`components/Frame.tsx`, so it renders on every page by default. Added
`Frame`'s `sidebar` prop (default `true`) so `/sign-in` and `/sign-up` can
opt out — those pages render before a session exists, so a nav to
authenticated-only routes would be wrong there.

Also added a stub `app/(movie-recap)/movie-recap/page.tsx` ("Coming soon")
so the new sidebar link doesn't 404 while the real feature is unbuilt.

**Why:** Movie Recap is a second top-level product feature; it needed a
visible entry point, and there was nowhere to put one without a nav.

**Consequence:** any future top-level feature should add its entry to
`NAV_ITEMS` in `components/Sidebar.tsx`.

**Superseded:** the paragraph above (`Frame`'s `sidebar` prop) is corrected by
the next entry — `Frame` no longer has a `sidebar` prop.

## 2026-09-14 — Sidebar moved into a shared layout.tsx to fix remount flash

`Sidebar` originally rendered inside `Frame`, and every page called `Frame`
itself. Next.js only keeps a component instance mounted across client-side
navigation when it lives in a shared `layout.tsx` for that route segment —
since `Frame` was called per-page (not a layout), `Sidebar` fully
unmounted/remounted on every navigation. It re-mounted with
`collapsed=false`, painted expanded, then its `useEffect` read `localStorage`
and snapped to the persisted collapsed state a tick later — a visible
expand/collapse flash on every page switch.

Fixed by nesting `(story)`, `(movie-recap)`, `account`, and `settings` under
one new `app/(app)/layout.tsx`, which now renders `Sidebar` and the rounded
panel shell once for that whole segment tree. `components/Frame.tsx` no
longer takes a `sidebar` prop — it's a standalone shell (no sidebar) used
only by `/sign-in` and `/sign-up`, which sit outside `(app)` and render
before a session exists.

**Why:** `Sidebar` must persist across navigation for its collapsed state to
not flash — a shared layout is the only way Next.js does that.

**Rejected:** keeping `Sidebar` in `Frame` and reading localStorage
synchronously (e.g. an inline `<script>` or a class toggled pre-hydration) —
works around the symptom but Sidebar still fully remounts every navigation,
so any other pending nav-scoped state (open menus, scroll position) would
still be lost. The layout fix addresses the actual cause.

**Consequence:** any new top-level route that should show the sidebar must
live under `app/(app)/`. A route added as a sibling of `(app)` (like
`sign-in`/`sign-up`) renders with no sidebar and must use `components/Frame.tsx`
directly for its shell.

## 2026-09-14 — Theme toggle and account menu moved to sidebar footer

`ThemeToggleButton` and `AccountMenu` were duplicated in the top-right corner
of every page's `TopBar` (6 pages directly, plus `ChapterHeader.tsx` shared
by 4 chapter subpages). Moved both into a footer section of
`components/Sidebar.tsx` instead, since `Sidebar` now persists across
navigation (see the layout entry above) and is the one place that needs to
render them just once.

`AccountMenu`'s dropdown now opens `placement="top-start"` (was the default
`bottom-start`) — it's docked near the bottom of the screen in the sidebar
footer, so opening downward would clip against the viewport edge.

**Why:** the same two controls repeated in ten places was already
redundant; the shared `(app)` layout made a single footer location possible.

**Consequence:** a page's `TopBar` right side is now free for page-specific
actions only — don't re-add theme/account controls there. Any future control
that belongs on every page (not just `(app)` pages) goes in `Sidebar`'s
footer, not back into `TopBar`.
