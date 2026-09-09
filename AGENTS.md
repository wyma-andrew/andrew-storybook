<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Storybook — project rules

## History rule — MANDATORY

`history/<feature-name>.md` is the record of what was decided for each feature
and **why**, including the alternatives that were tried and rejected. It exists
because the reasoning behind these prompts and flows is not recoverable from the
code — a later change can look obviously right and still undo a decision that
cost a day to reach.

- **Before touching a feature, read its `history/` file.** Match by the "Covers:"
  paths at the top of each file.
- **If a requested change contradicts a recorded decision — including
  reintroducing something recorded as rejected — stop and tell the user which
  entry it conflicts with, and wait for approval.** Do not implement it first
  and mention it after. Do not quietly "fix" anything the file lists as an
  accepted consequence or as deliberately left open.
- **After the change, update that file** (or add a new one for a new feature):
  a dated entry with the decision, the reasoning, what was rejected, and any
  consequence a future reader would otherwise mistake for a bug. Record
  decisions and constraints, not a changelog of edits — git already has those.
- Approved contradictions replace the old entry; keep the old reasoning as
  superseded so the same ground isn't re-argued.

## Product

Three-step flow, one story project:

1. **Script** — user pastes/writes the story. Editor is **Tiptap** (custom nodes: Title, Scene heading, Action, Character, Dialog, Transition).
2. **Assets** — on switch, AI extracts from the script and returns **two sections**: *character prompts* and *location prompts*. Each prompt is editable + copyable, and is the identity/environment reference reused downstream.
3. **Storyboard** — on switch, AI returns **scene by scene**; each scene contains several numbered **shots**, each shot with its own copyable image prompt.

A global **Style** setting (Realistic / Anime / …) is injected into every generated prompt.

## Stack

- Next.js 16 (App Router) — read `node_modules/next/dist/docs/` before writing Next code.
- **Supabase (Postgres)** for data + auth + storage. RLS enabled on every table.
- **Tiptap** for the script editor.

## UI rules — MANDATORY

- **Tailwind CSS only.** No hand-rolled component CSS classes — see `app/globals.css`'s
  `@theme` block for the color tokens (`bg-panel`, `text-fg-3`, `border-line-2`, etc).
  The only exception is Tiptap's rendered node typography (`.tiptap-doc *` in
  `app/globals.css`), since that's arbitrary HTML the editor produces, not JSX.
- **Form inputs, selects, and other interactive elements come from GeckoUI**
  (`@geckoui/geckoui`) — `Input`, `Textarea`, `Select`/`SelectOption`, `Menu`/`MenuItem`,
  `Switch`, `ConfirmDialog`, etc. `components/ui/Button.tsx` already wraps GeckoUI's
  `Button` — use it (or GeckoUI's directly) rather than a bare `<button>`. Never a raw
  `<input>`/`<textarea>`/`<select>`. GeckoUI's theme is set on `:root` in
  `app/globals.css` (dark-only, reuses the same palette) — don't touch it per-component.
- **Icons come from `lucide-react`.** No emoji, no unicode glyphs (›, ▾, 🔒, ⚡, ✦, ⋮,
  etc) standing in for icons in the UI.

## Database — MANDATORY: db push only

Schema changes go **only** through `supabase db push`. No dashboard SQL editor,
no ad-hoc `psql`/scripts, no `supabase migration up` against prod.

```bash
# write a new migration file first
supabase migration new <name>          # supabase/migrations/<ts>_<name>.sql

# push it (uses DATABASE_URL from .env — no project link needed)
set -a; source .env; set +a
npx supabase db push --db-url "$DATABASE_URL"
```

- `supabase/` (config + `migrations/`) is the single source of truth for schema.
- Current tables: `stories` (has `owner_id`), `visual_styles` (global +
  per-story custom), `system_prompts` (admin-only character/location
  presets), `chapters`, `bible_entries` (story asset bible), `chapter_assets`
  (matched/new per chapter), `scenes`, `shots`.

## Auth — Supabase Auth, email/password

- `stories` and everything under it (chapters, bible_entries, chapter_assets,
  scenes, shots, story-scoped visual_styles) are **owned per-user** and
  enforced by **RLS policies**, not app-level checks — route handlers for
  these tables use `supabaseRoute()` (`lib/supabase/route.ts`, anon key +
  session cookies), never `supabaseAdmin()`. RLS is the actual authorization
  boundary here; don't re-add manual owner checks in these handlers.
- `visual_styles` (scope='global') and `system_prompts` are platform-wide —
  reads use `supabaseRoute()` too (open/authenticated-read policies), but
  **writes** (admin console only) use `supabaseAdmin()` (service role,
  bypasses RLS) gated by `requireAdmin()` in `lib/api/auth-guard.ts`.
- Admin access is an email allowlist: set `ADMIN_EMAILS` in `.env`
  (comma-separated). No admin role table yet.
- `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`) + `lib/supabase/middleware.ts`
  refresh the session cookie on every request and redirect signed-out users to
  `/sign-in` (except `/api/*`, which return normal 401s instead).
- Profile UI: `components/AccountMenu.tsx` (dropdown in every header) →
  `/account` (email + change password). Sign-up/sign-in are plain
  email+password; no magic link, no OAuth, no "forgot password" flow yet.

## API rule — MANDATORY

**Every API call from the client goes through Spoosh.** No exceptions.

- Invoke the **`spoosh-react` skill** before writing or editing any data-fetching / mutation code.
- Use `createClient` + `useRead` / `useWrite` / `usePages` / `useQueue` / `useSSE` from `@spoosh/react`.
- Do **not** use bare `fetch`, `axios`, `react-query`, `swr`, or the Supabase client directly from React components.
- Server-side Supabase access lives behind route handlers; the client reaches them only via the Spoosh client.
- Caching, retry, polling, optimistic updates, invalidation: use Spoosh plugins, not hand-rolled logic.
- **Invalidation gotcha**: Spoosh's auto-invalidation keys off the *mutated* path's first
  segment (e.g. `PATCH chapters/:id` → invalidates `chapters` / `chapters/*`). It does
  **not** know about other reads that embed that resource under a different path —
  e.g. `stories/:id` returns `story.chapters[]`, so renaming/duplicating a chapter
  leaves that cached `stories/:id` read stale. When a mutation needs to refresh a
  parent/embedding read like that, pass `invalidate` explicitly on the `trigger()` call,
  e.g. `invalidate: [\`stories/${storyId}\`, "chapters"]`. Check for this whenever a
  mutation's effect should show up in a list/detail view fetched via a different
  endpoint than the one being mutated.

## Demo

`demo/` holds static HTML+CSS mock-ups (UI A dark, UI B light) with mock data — reference only, no build step, not part of the Next app.
