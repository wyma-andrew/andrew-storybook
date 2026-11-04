Covers: lib/story-transfer.ts, app/api/(story)/stories/[id]/export/, app/api/(story)/stories/import/, components/StoryTransfer.tsx

> **Superseded in part (2026-10-28):** the story Asset Bible was removed; anything below about bible entries, bible matching or promotion is history only. See `history/asset-bible-removal.md`.

## 2026-09-16 — Story export/import as a JSON file, account to account

A story can be written to a file from "Story options → Export story" and
rebuilt in any other account from the upload button in the Stories header. The
bundle is one JSON file (`<slug>-<date>.storybook.json`) holding the story
settings, the Asset Bible (with its reference-image URLs), and every chapter:
script, site map, chapter assets and their image URLs, scenes, shots (including
overrides, scale, motion mode and continuity state), and Voice Over segments.

**Why a file and not a share link:** the two accounts may be on different
deployments, and a link would need cross-account read policies in RLS — a
permanent widening of the authorization boundary for an occasional transfer. A
file costs nothing when nobody is using it.

**Ids are never carried across.** Rows are exported without id, owner, or
timestamps; relationships are re-expressed positionally — bible entries get a
bundle-local `key` that chapter assets reference, and Voice Over ranges point at
`{ sceneIndex, shotIndex }` rather than shot uuids. Import inserts parent-first
and remaps as it goes. A uuid from another account means nothing here, and
accepting ids from a user-supplied file is how a file gets to name rows it does
not own.

**Rejected: including `chapter_images`.** Those rows point at R2 objects in the
exporting account's bucket. Copying the rows would leave two stories sharing one
object, and `DELETE /api/chapter-images/:id` deletes the object — so deleting an
image in either story would break the other. Re-uploading the bytes through the
export file would also make bundles hundreds of megabytes. Uploaded renders stay
behind; reference-image URLs (which are just links the user pasted) do travel.

**Rejected: matching the imported bible against the destination account's
existing stories.** Import always creates a fresh story with its own bible.
Merging into an existing story needs a name-conflict UI that does not exist, and
asset matching is per story anyway.

**Consequence:** a `matched` chapter asset whose bible key does not resolve is
imported as `new` rather than failing the import. A Voice Over whose shot range
does not resolve is dropped, in both directions — the not-null shot columns
leave no way to keep it.

**Consequence:** there is no transaction. PostgREST cannot run one across
statements, so a failure part-way through leaves a partial story; the error says
so and the user deletes it. Rewriting import as a single Postgres function was
rejected as too much machinery for a rare manual action, and it would move
ownership logic out of RLS-checked inserts.

**Consequence:** the visual style, motion style and region are stored as
code-defined slugs, so importing into a build that no longer defines one of them
falls back the same way a dangling slug already does (see
`history/visual-styles.md`). Nothing about the style text is copied into the
bundle.

**Consequence:** anyone who can read the file can recreate the whole story. The
export is plain, unencrypted JSON — it is a handover format, not a sharing
permission.
