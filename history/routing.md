Covers: app/(app)/**, app/api/(story)/**, lib/spoosh.ts (Spoosh keys), route.pathname redirects, components/Sidebar.tsx, components/MobileNav.tsx, components/Frame.tsx, components/ui/Layout.tsx (TopBar), components/ChapterHeader.tsx (header layout only)

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

## 2026-09-16 — Sidebar becomes an off-canvas drawer below `md`

`Sidebar` had no responsive behaviour: the same inline rail rendered at every
width, taking 176px expanded or 52px collapsed out of the flex row. On a 375px
phone that is ~47% of the screen expanded, and the page panel beside it was
unusable.

Below Tailwind's `md` (768px) the rail is now hidden (`hidden md:flex`) and the
same nav renders inside GeckoUI's `Drawer` (`placement="left"`, 260px, capped at
`80vw`) over a backdrop. `md` and up is unchanged — inline rail, collapse
toggle, localStorage persist.

New `components/MobileNav.tsx` owns the drawer's open state: `MobileNavProvider`
(mounted in `app/(app)/layout.tsx`, so it persists across navigation alongside
`Sidebar`), `useMobileNav`, and `MobileNavButton` — the `md:hidden` hamburger.
The button had to live in the page header rather than the sidebar, since the
sidebar isn't on screen when it's needed; it is rendered once inside
`TopBar` (`components/ui/Layout.tsx`) and once in `components/ChapterHeader.tsx`,
which are between them the header of every `(app)` page.

**Why a drawer, not the existing collapsed rail:** a 52px icon strip still
costs width on a phone and puts every nav target at the screen edge. Collapse is
a desktop trade (keep nav in view, spend a little width); on a phone the right
trade is no nav in view at all until asked for.

**Rejected:** a `useMediaQuery`-style JS width check to pick rail vs drawer —
it renders the wrong one on the server, so the first paint flips. The CSS
breakpoint (`hidden md:flex` / `md:hidden`) has no such gap. Related to the
remount-flash entry above: this layout is deliberately free of JS-measured
layout decisions.

**Rejected:** persisting the drawer's open state the way `sidebar-collapsed` is
persisted. A drawer that reopens on every page load covers the page you came
for. Only the desktop collapsed state persists.

**Consequence:** the drawer auto-closes on `pathname` change (a `useEffect` in
`Sidebar`), so it can't linger over the destination. That effect fires on every
navigation at every width; it is a no-op when already closed.

**Consequence:** `ChapterHeader` stacks below `md` — its four tab pills are
wider than a phone, so the tab row drops to a second grid row and scrolls
sideways, with the episode select and the controls menu on the first row. Tab
labels are not shortened on mobile; the horizontal scroll is the accepted
trade.

**Consequence:** any new page header that isn't `TopBar` or `ChapterHeader` must
render `<MobileNavButton />` itself, or that page has no way to reach the nav on
a phone.

## 2026-09-16 — `/stories` made responsive first; Movie Recap deliberately left

Responsive work was scoped to the `(story)` tree only — story list, trash,
create, story detail, Asset Bible, and the four chapter tabs (script, assets,
storyboard, images) — plus the shared primitives those pages use
(`ui/Toolbar.tsx`, `ui/SectionHead.tsx`, `ui/EmptyCta.tsx`, `ui/Skeleton.tsx`,
`ScriptEditor.tsx`'s toolbar). Movie Recap is still being built, so fitting its
four-step wizard to a phone now would be re-done with the feature.

What changed, and why each was actually broken rather than merely tight:

- **`Toolbar`** was `flex` with no wrap, `justify-center`, so the storyboard's
  overflow was unreachable rather than scrollable. It briefly became
  `flex-wrap`; see the entry below, which makes it a single scrolled row
  instead. `toolbarSep` is `hidden sm:block` either way.
- **Card grids** used `auto-fill, minmax(320px, 1fr)` (and `280px` on the story
  lists). On a 320px-wide phone the content box is ~272px, so the track was
  wider than its container and the page scrolled sideways. Now `grid-cols-1`
  with the `auto-fill` track restored from `sm` up.
- **`SectionHead`** put the title, a long count string ("12 detected · 4
  matched · 2 new") and an action button in one non-wrapping row.
- **Prompt text columns** in `PromptBox` and `VoiceOverCard` are `flex-1`
  beside a fixed button column; without `min-w-0` a flex item's floor is its
  longest unbreakable token, which pushed the buttons off-screen.
- **Container padding** on the scene section, shot cards, chapter rows and
  `EmptyCta` steps down below `md` — a second pass on the same idea as the
  layout-gutter entry.

**Rejected:** shrinking font sizes on mobile as the general fix. The prompt text
is meant to be read and proofread; making it smaller on the smallest screen is
backwards. Only the story-detail `h1` steps down (`text-xl md:text-2xl`), since
a 24px title next to a style chip wrapped to three lines.

**Rejected:** horizontal scroll containers for the card grids, so the desktop
multi-column layout could be kept on a phone. Sideways scrolling to find a card
is worse than stacking, and it hides content with no affordance.

**Superseded:** this entry originally accepted `ChapterHeader`'s tab row
scrolling sideways on a phone. It no longer does — see the entry below, which
shrinks the pills until all four fit.

**Consequence:** Movie Recap pages inherit the shared-primitive fixes (they use
`TopBar` and so get the mobile hamburger and the tighter gutters), but their own
wizard layout is untested below `md`. Finishing that is a separate task.

## 2026-09-16 — Chapter header and screenplay type sized for a phone

Reviewing the Script tab at ~368px showed three things the breakpoint pass had
missed. All are below `md` only; desktop is untouched.

**Chapter header was overlapping itself.** The episode `Select` still claimed
`max-w-[220px]` beside a back arrow, a rename button, the save indicator and the
options trigger — together wider than the row, so the rename button was being
crushed to a sliver between the select and the options button. The select is now
`max-w-[150px]` below `md`, and `ChapterControlsMenu`'s trigger drops its
"Chapter options" label for a `SlidersHorizontal` icon (the label alone was
~120px, a third of the header). Its dropdown is `w-[min(260px,calc(100vw-2rem))]`
so it can't run off the right edge.

**Tab pills now fit without scrolling** — `text-[11px] px-2 py-1` below `md`
puts all four inside the row. This replaces the previous entry's accepted
sideways scroll: shrinking type was the cheaper trade, because the four numbered
steps are a progress indicator and a scroller hides how many are left.
**Still rejected:** shortening the labels ("3. Board"), which breaks the match
with how the steps are named everywhere else.

**Screenplay typography got a mobile block** in `app/globals.css` (the
`.tiptap-doc` exception to the Tailwind-only rule). The desktop rules are sized
for a ~560px measure with a 96px dialog indent; on a ~344px content box that
indent alone is a third of the line and dialog wrapped after two or three words.
Below `md`: body 16px→15px, scene headings 17px→14px with tighter tracking,
dialog indent 96px→20px with `max-width` dropped, voice-over's 48px side margins
removed.

**Why the indents go rather than the type:** screenplay indentation encodes a
printed page that a phone is not reproducing at any size. Shrinking the text far
enough to keep the 96px indent would make the thing you are there to proofread
unreadable, so the page geometry gives way and the text stays legible.

**Consequence:** the script no longer looks like a screenplay page on a phone —
dialog sits nearly flush with action. That is deliberate; the role styling
(caps, centring, italics, the voice-over rule) still distinguishes the blocks.

**Consequence:** the Script toolbar's buttons had no font-size class and were
inheriting the 16px base. They are now explicitly `text-[12.5px]` below `md`,
`text-[13.5px]` above — so a base-font change no longer silently resizes them.

**Script toolbar is one row at every width.** The node-type buttons (Title,
Scene, Action, Dialog, Voice Over, Transition) live in a `flex-1 overflow-x-auto`
scroller; import, undo and redo sit outside it, pinned and `shrink-0`. Gaps drop
to `gap-1` and the separator's margin to `mx-1` below `md`.

**Why pin those three and scroll the rest:** undo and redo are reached for
without looking, and import is how you get a script in at all — an action that
has scrolled out of view is effectively missing. The node types are chosen while
reading what you just typed, so hunting sideways for one costs little.

**Rejected:** letting the toolbar wrap to a second row (what it did before).
Two rows eat ~44px of a phone's editor height permanently, to spare an
occasional sideways swipe.

## 2026-09-16 — Storyboard stats leave the toolbar; `Toolbar` is one scrolled row

The storyboard toolbar wrapped to two rows on a phone. The cause was not the
number of controls but that a **reading** was sitting among them: "4 scenes, 12
shots, ~1m 0s total" was ~230px of the ~560px the row needed, and it is a fact
about the chapter, not something you press.

The line moved into `Wrap`, above the first scene, at every width — it belongs
with the content it describes. `Toolbar` then went back to a single row that
scrolls sideways when it overflows (`overflow-x-auto`, `[&>*]:shrink-0`),
matching what `ScriptEditor`'s toolbar already does.

**Rejected:** a chevron beside the active tab that collapses the toolbar into a
panel. Three objections, in order of weight: it hides Regenerate, the page's
primary action, behind a second tap; a disclosure control in the tab row reads
as "expand this tab" rather than "show view controls"; and it introduces
open/closed state that would need a rule for tab switches and reloads. If the
storyboard ever does need to reclaim that strip, the chevron belongs on the
toolbar itself, right-aligned, and must not collapse Regenerate with it.

**Rejected:** keeping the stats in the toolbar but hiding them below `md`. The
line is more useful on a small screen, not less — it is how you tell whether a
regeneration changed the shot count without scrolling the whole chapter.

**Consequence:** desktop changed too. The stats no longer sit to the right of
the Hints toggle; they are above the first scene. This was deliberate rather
than a mobile-only branch — one place for the reading, one place for controls.
