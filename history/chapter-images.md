# Chapter image gallery (Cloudflare R2)

Covers: `lib/r2.ts`, `lib/r2.test.ts`, `components/ChapterImageUpload.tsx`,
`components/AttachedImages.tsx`, `app/api/chapters/[id]/images/`,
`app/api/chapter-images/[id]/`,
`app/stories/[id]/chapters/[chapterId]/images/page.tsx`,
`components/ChapterHeader.tsx` (TABS), `lib/api/types.ts` (`ChapterImage`),
migration `20260913101428_chapter_images.sql`.

> **Superseded in part (2026-10-28):** the story Asset Bible was removed; anything below about bible entries, bible matching or promotion is history only. See `history/asset-bible-removal.md`.

## 2026-09-13 — Renders come back into the app, per chapter, ordered by file name

The three-step flow produces prompts; the images are made in an external tool
(Flow, Midjourney, …) and then lived nowhere. This is where they come back.

**Decision: a fourth chapter tab holding a flat gallery of uploaded images,
sorted by file name, stored in Cloudflare R2.**

**Why the bytes never pass through the app.** The browser asks for a presigned
PUT URL, uploads straight to R2, and only then commits a row. A Next route
handler would have to buffer the whole body, which is a size limit by another
name — and the requirement was explicitly no size limit. The split has a second
benefit: an upload that fails or is cancelled leaves an orphaned object rather
than a row pointing at nothing, so the gallery only ever lists bytes that landed.

**Why the image-type check is on the server.** `accept="image/*"` on the picker
is a convenience; the presigned URL is the actual grant of write access, so the
restriction has to live where the URL is minted. `presign` rejects the whole
batch if any file is not an image type.

**Why `url` is stored, not composed.** `R2_PUBLIC_BASE_URL` will change if the
bucket moves from `r2.dev` to a custom domain. A stored URL keeps resolving;
one composed at read time silently breaks every existing image.

**Why sorting happens in JS.** "1.2.png" must precede "1.10.png" — these files
are named after scene.shot numbers, which is the entire reason the gallery is
ordered by name. Postgres has no natural-order collation available by default,
and a chapter's gallery is small enough that sorting it in the route costs
nothing. Ties (the same name uploaded twice, a corrected render) break on
`created_at` so the newer file reads as newer.

**Why names count up instead of carrying a uuid.** Object keys are the files'
own names under a chapter prefix — `chapters/<id>/1.2.png` — so the bucket stays
browsable and a key means something to a person looking at the R2 dashboard. A
name already in use becomes `1.2-2.png`, then `-3`: re-uploading a corrected
render is normal, and both survive until the user deletes one. Nothing is ever
overwritten.

`nextFreeName` resolves this against the set of keys already in the chapter,
mutating that set as it walks the batch — which is what separates two files
called `1.2.png` inside ONE folder upload, since neither is in the database yet.
The counter is chosen against the KEY, not the display name: two different
originals can sanitize to the same key (any two non-ASCII names), and the key is
the one that has to be unique. The same counter then lands on both, so the
gallery and the bucket agree on `1.2-2.png`.

The display name keeps its original spelling — Burmese included — and only the
key is reduced to `[\w.\-]`. `lib/r2.test.ts` pins all of this.

**Two deliberate departures from the repo's standing rules, both recorded here
so they are not "fixed" later:**

- *The R2 PUT is a bare `fetch`, not the Spoosh client.* The API rule
  (`AGENTS.md`) covers calls to this app's API; the target here is Cloudflare on
  a presigned URL. The Spoosh client is bound to the `/api` base and has no
  business modelling a third-party storage endpoint.
- *Two hidden native `<input type="file">` elements.* The UI rule says inputs
  come from GeckoUI, which ships no non-RHF file picker. They are `hidden` and
  driven by toolbar Buttons, so nothing unstyled is on screen. There are two
  because a folder picker needs `webkitdirectory`, which cannot be toggled per
  click without remounting, and a directory-mode input refuses loose files.

**The fourth tab is numbered "4. Images" on purpose.** It is not a fourth
authoring step — it is where output returns after the three steps. But an
unnumbered tab beside three numbered ones reads as a settings page rather than
the next thing you do.

**Rejected:**

- *Attaching images to shots by file name* (`1.2.png` → scene 1, shot 2). More
  useful when reviewing, and the obvious next step, but it forces a naming
  convention on the user and is a materially bigger build. Deliberately deferred,
  not dismissed — the flat gallery ships first and the `file_name` column is
  what a later matcher would read.
- *A private bucket with signed GET per view.* Every gallery render would need a
  batch of minted URLs, they expire, and a copied link dies. The URLs are
  unguessable, and these are the user's own renders of their own prompts.
- *Supabase Storage.* `AGENTS.md` records it as deliberately unused, and R2 has
  no egress cost for images that will be viewed repeatedly.
- *Proxying uploads through a route handler.* See above — it reintroduces the
  size limit the whole design exists to avoid.

**Consequences:**

- Requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_PUBLIC_BASE_URL` in `.env`, and a CORS rule on the bucket
  allowing `PUT` from the app's origin. Without them `presign` returns 503 and
  the rest of the app is unaffected — `r2Configured()` is checked, never assumed.
- `STORY_BUCKET` in `.env` predates this and is still referenced nowhere.
- Deleting a row then fails to delete the object only leaves an invisible object
  costing storage; the request still succeeds, because a failure there is
  nothing the user can act on.
- Uploads are sequential, not parallel. Simpler progress, and a folder of large
  renders does not open fifty concurrent connections. If it proves slow, a small
  concurrency limit is the change — not unbounded `Promise.all`.

## 2026-09-13 — Addendum: a presigned key can be claimed and never used

`nextFreeName` reserves a name at presign time, but the row is only written
after the bytes land. An upload that is cancelled leaves the name free again on
the next batch, which then reuses it — and if the bytes HAD landed while the
commit failed, that orphaned object is overwritten.

Accepted rather than fixed. The alternative is a reservation table with expiry,
which is real machinery for a case whose worst outcome is that an image the user
never saw is replaced by one they are actively uploading. The unique constraint
on `object_key` still stops two committed rows from sharing a key.

## 2026-09-13 — Images attach to the asset or shot that produced them; "unused" is derived

Follows the entry above, which shipped a flat chapter gallery and deferred any
link to the work that generated the image. Reversed: uploads now also happen on
an asset card (2. Assets) and on a shot card (3. Storyboard).

**Decision: no new table. `chapter_images` gains two nullable links,
`chapter_asset_id` and `shot_id`, each `ON DELETE SET NULL`, with a check
constraint allowing at most one.**

**Orphaning is the FK, not a job.** Delete an asset, or regenerate a scene —
which deletes and reinserts every shot in it — and the link nulls itself. "Used"
is then simply "a link is still set", derived on every read, so it cannot go
stale and there is nothing to maintain. The chapter gallery tags each image with
its target's name (the asset's name, or `1.2` for a shot) or `Unused`, and
filters All / Used / Unused off the same fact. The label IS the used state: the
route resolves it through an embed, so a null embed means the target is gone.

**These are NOT reference images.** `chapter_asset_images` / `bible_entry_images`
— URL-only, canonical flag, promote-to-bible — are untouched and keep doing
their job. An uploaded render is the OUTPUT of an asset's prompt; a reference
image is the INPUT that holds identity steady. Folding them together would mean
either two tables describing one thing or migrating a working feature onto R2,
and the distinction is real enough to be worth the separate surface. The asset
card says so in a comment, because the two strips sit close together.

**Why one read per page rather than per card.** Both pages read
`chapters/:id/images` once and group by link in memory. A request per card would
be dozens on the assets page. It also means a card shows nothing for an image
whose link was nulled — correct, and the gallery is where it resurfaces.

**Why the upload flow is a hook.** `useChapterImageUpload` holds presign → PUT →
commit for all three surfaces; only the link differs. Written out three times it
would drift, and the sequence has enough sharp edges (image filtering, partial
failure, committing only what landed) that one copy is the point.
`useImagePickers` owns the two hidden native inputs for the same reason.

**Rejected:**

- *A manual used/unused flag.* Survives a regeneration, but goes stale the moment
  anything changes and is one more thing to maintain by hand.
- *Story-bible uploads.* `bible_entries` are story-scoped and `chapter_images` is
  chapter-scoped, so a bible image would need a chapter it does not have. Left
  out rather than given a fake one.
- *Delete/rename on the asset and shot strips.* An asset card is a place to see
  what came out, not to manage files. The gallery already does that properly,
  and the strips stay small.

**Consequences:**

- Regenerating a scene silently moves every render attached to its shots into
  Unused. That is the honest state — the shots they were made for no longer
  exist — but it is not announced anywhere, and a user who regenerates often will
  accumulate unused images. The Unused filter is how they are found.
- An image can be attached only at upload time. There is no way to re-link an
  orphan to its new shot, or to attach a gallery image to an asset after the
  fact. Open work; the obvious shape is a picker in the preview dialog.
