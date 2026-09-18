Covers: app/(app)/admin/**, app/(app)/no-access/**, app/api/admin/**, app/api/auth/me/route.ts, lib/api/auth-guard.ts, lib/api/features.ts, lib/api/feature-page.ts, lib/constants/features.ts, components/Sidebar.tsx (feature filtering), supabase/migrations/20260918100000_user_feature_access.sql

## 2026-09-18 — Per-user feature access and an admin user manager

**Decision:** a `profiles` table, one row per `auth.users` row created by
trigger, holding the account's email and one boolean per gated feature
(`can_use_stories`, `can_use_movie_recap`, `can_use_voice_lab`). An admin page
at `/admin` lists accounts, flips those booleans, creates accounts and deletes
them. Admin itself stays the `ADMIN_EMAILS` env allowlist — no role table.

**Superseded the same day** by the entry below: admin is now
`profiles.is_admin`, and `ADMIN_EMAILS` is break-glass only.

**Why a table and not the auth metadata:** `app_metadata` would avoid a table,
but it cannot be read from a SQL policy, so the gate could only ever be
application code. The flags have to be reachable from RLS — see below.

**Why the email is mirrored into `profiles`:** the admin list is then an
ordinary query that can be ordered and joined server-side. The alternative,
`auth.admin.listUsers()`, is paginated, unsortable and unfilterable, and would
have to be re-paged for every render of the table. `last_sign_in_at` is the one
field only the auth schema has, so the list still calls `listUsers()` once and
maps it in. Triggers keep the mirrored email true on creation and on change.

**RLS carries the gate.** `has_feature(text)` is a `security definer` function
reading the caller's profile. It has to be `security definer` because a policy
that read `profiles` under RLS would recurse through the profiles policy.

It is applied as a **restrictive** policy on each gated table, not by editing
the existing owner policies. Restrictive policies are ANDed with the permissive
ones, so ownership keeps its single definition; rewriting ten `for all` policies
would mean restating each ownership subquery, and a typo there widens access
silently instead of narrowing it.

**Every story-scoped table carries its own gate** — chapters, bible_entries,
their image tables, chapter_images, scenes, shots, voice_over_segments — even
though each already reaches ownership through a subquery on `stories`. Postgres
does apply the referenced table's RLS inside a policy expression, so gating
`stories` alone would probably be enough; "probably" is not what the
authorization boundary should rest on, and the cost of being wrong is that a
user without Stories access can still read their chapters through
`/api/chapters/:id`. A new story-scoped table needs its own gate policy.

`profiles` itself is readable only by its owner and has **no** insert/update/
delete policy at all: every write goes through the service-role admin routes, so
a user cannot grant themselves a feature even with a valid session.

**Route guards are ergonomics, with one exception.** `requireFeature()` turns
what RLS would otherwise return — an empty list, or an opaque insert failure —
into a 403 that says which feature is off. Voice Lab has no table of its own
(it proxies a worker), so there the guard IS the boundary and every one of its
routes calls it. `voices/preview` is gated under `movie_recap`, not `voice_lab`:
it exists for the recap wizard's voice picker.

**Rejected: checking the flags in `proxy.ts`.** It runs on every request
including assets, and would add a database round-trip to each one. The check
lives in a `layout.tsx` per feature route group instead, so it costs one read
per navigation into that feature.

**Rejected: disabling the nav entry instead of hiding it.** Nothing about a
feature the account cannot use is actionable, and the route redirects anyway.

**Nothing is granted automatically, including to accounts that already
existed.** The backfill inserts profiles with every flag `false`. Deploying the
migration therefore locks every existing user out of all three features until an
admin turns them on. This is deliberate — the alternative grandfathers access
that was never decided — but it means the migration and the first grants belong
in the same sitting. `/admin` is gated by the email allowlist and not by any
flag, so an admin can always reach it to grant themselves access.

**Deleting an account deletes its storage first, the account second.** Rows go
with the user through the existing `on delete cascade` on `owner_id`, and once
they are gone nothing points at the R2 objects any more — so the handler lists
the user's recap projects and chapters and `deletePrefix()`es each before
calling `auth.admin.deleteUser`. A storage failure returns 502 with the account
intact and the delete retryable. This is the same ordering, for the same reason,
as the recap project DELETE.

**An admin cannot delete their own account.** The allowlist is an env var they
may not be able to edit from wherever they are, so it would be a one-way door.

**Accounts are created confirmed** (`email_confirm: true`). Sign-up is closed
and there is no confirmation email to click, so an unconfirmed account could
never sign in. There is no invite mail either — the admin sets the password and
passes it on.

**Consequence:** adding a feature to the gate is one entry in
`lib/constants/features.ts`, one column on `profiles`, and one branch in
`has_feature()`. The column name is derived (`can_use_<key>`), so the key in
that file and the column must stay in step.

## 2026-09-18 — Admin moves to a column, ADMIN_EMAILS becomes break-glass

**Supersedes** "Admin itself stays the `ADMIN_EMAILS` env allowlist — no role
table" above, and the note that an admin cannot delete their own account
because the allowlist is an env var they may not be able to edit (still true,
and still enforced — the reason is now that admin is granted in the app).

**Decision:** `profiles.is_admin`, flipped from `/admin` like any other switch.
`requireAdmin()` and the `/admin` layout read it.

**Why:** the allowlist meant an env edit and a redeploy to promote anyone, and
the person who needs promoting is usually not the person holding the deploy.

**`ADMIN_EMAILS` stays, and it stays an OR, not a fallback.** An address on it
is an admin whether or not the column says so. It is the only way back in if
the column reaches zero admins — a restored database, a bad migration, an
account deleted out of band. The consequence to know: revoking admin in the UI
from an address that is also in `ADMIN_EMAILS` appears to work and changes
nothing, because the env var still answers yes. Take the address out of `.env`
as well.

**Two guards on revoking admin**, because only an admin can hand it back: you
cannot clear your own, and you cannot clear the last one. Neither guard is
needed for the feature switches, which any admin can restore.

**Rejected: dropping `ADMIN_EMAILS` entirely.** It is the one credential that
does not live in the database the admin page depends on, which is exactly when
it is needed.
