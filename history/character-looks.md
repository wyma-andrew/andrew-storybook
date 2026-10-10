# Character looks

Covers: `lib/character-looks.ts`, `lib/storyboard-assets.ts`,
`lib/prompts/shared.ts` (`characterLooksBlock`), the `looks` schemas in
`lib/prompts/extract-assets.ts` and `lib/prompts/regenerate-asset.ts`, the look
rule and `assetsUsed.look` in `lib/prompts/storyboard.ts`, the character card on
the Assets page, shot chips on the Storyboard page, bible character copy, and
`supabase/migrations/20261009172114_character_looks.sql`.

## 2026-10-10 — One character, one look per lasting stage

**Problem.** A character's appearance can change for good mid-story
(Angulimala: rejected youth → long-haired bearded forest bandit → shaved
monk). With one IDENTITY/WARDROBE LOCK and one reference sheet per character,
extraction wrote "Before conversion: … / After conversion: …" into a single
WARDROBE LOCK and kept "long hair" in IDENTITY LOCK, and every shot got the
same sheet.

**Decision.** One asset, several looks — the same shape as "one place = one
location with several VIEWS" (`history/asset-extraction.md`). The asset name
stays the identity key (Re-Sync, `shots.assets_used`).

- `chapter_assets.looks` / `bible_entries.looks` jsonb, `[{ key, label, scenes,
  prompt }]`; `[]` = single look, format unchanged. `parseLooks` treats one look
  as none.
- With looks, `realPrompt` keeps CHARACTER / KNOWN IDENTITY / IDENTITY LOCK
  (only cross-stage traits: face, bones, eyes, nose, skin, build) / VARIABLE and
  drops WARDROBE LOCK. Each look is `LOOK / APPEARANCE LOCK / WARDROBE LOCK`.
  Hair, beard, skin condition, weight, marks, apparent age live in the look.
- Looks are for lasting changes only; bloodied/wet/dusty stays shot-level.
- The first look is the base. Copying a later look prepends a SAME PERSON line
  telling the image model to keep the face from the attached base sheet, and the
  card says to attach it. The image, not the bullets, is what holds the face.
- Storyboard: Known Assets lists each look with its scenes; `assetsUsed.look`
  (strict schema, `""` when not applicable) picks one per shot.
  `cleanShotAssets` drops keys that are not real looks. Shot chips show
  `NAME · label`; the "also attach shot X" continuity hint only pairs shots
  showing the same look.
- Uploaded renders carry `chapter_images.look_key`; the card shows each look's
  renders on its tab. A key no longer on the asset falls back to the first look.
- Buddha region: Prince Siddhartha and the Buddha in one script are two looks of
  one character (`buddhaAdaptationBlock`).

**Rejected.**
- Separate characters per stage (`ANGULIMALA (BANDIT)`): breaks name matching
  and loses the face link between stages.
- A `character_looks` table: looks are only ever read and written with their
  asset; a table meant RLS policies and CRUD routes for no query that needs it.
- Era splitting (frame story vs. flashback) — rejected by the user, see
  `history/asset-extraction.md`.

**Consequences.**
- Existing assets have `looks = []` until Re-analyze or Regenerate.
- The bible card shows and copies looks but does not edit them; edit on the
  chapter asset (pencil dialog) and re-promote, or edit the JSON-backed prompt
  in a later change.
- Measured on Angulimala: extraction ~145 s, three looks with the right scene
  split; storyboard put `outcast` on scene 2, `bandit` on 3–7, `monk` on 8–11.
  Location grouping varied between two runs (path and clearing split once,
  merged once).
