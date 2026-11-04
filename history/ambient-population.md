# Ambient background population in shot prompts

Covers: `lib/prompts/shared.ts` (`ambientPopulationBlock`), `lib/prompts/storyboard.ts`.

## 2026-10-22 — Recurring collectives are the exception

A recurring, story-relevant nameless collective (devas, hell beings, a monastic
assembly) is now one group character asset; see `history/asset-extraction.md`
2026-10-22. Ambient filler crowds below are unchanged.

## 2026-10-11 — Background people always have a gaze target

Photoreal crowd shots kept staring into the lens. The ambient clause, and any
crowd the script names, gave the image model no gaze for them. The block now
requires that one clause to say what they look at: the named character or
action, each other, or their own task. It stays one short clause, never named,
never in `assetsUsed`, so the 2026-09-10 decision below is unchanged. This
pairs with the affirmative gaze line in the style tail
(`history/visual-styles.md`, 2026-10-11).

## 2026-09-10 — Background crowd is prose, not an asset

**Decision: a shot's background crowd (villagers, vendors, passersby in a
populated setting like a street or market) is left to the model to infer
directly into the shot's `prompt` text when the script doesn't specify who
else is present. It is never turned into a tracked asset.**

Prompted by a ChatGPT suggestion to add a structured `environmentActivity`
object (`populationLevel`, `backgroundPeople`, `activities`, `trafficFlow`) to
each shot. Rejected: `assetsUsed` is name-based against tracked
`chapter_assets`/bible rows with real reference images
(`history/asset-extraction.md`); an anonymous crowd has no name and no
reference image, so it can never legitimately enter `assetsUsed`. A parallel
JSON field describing the same crowd that the free-text `prompt` already
covers is duplicated state with no consumer and a drift risk, not a fix.

Instead, one instruction block (`ambientPopulationBlock`, called from
`storyboardSystemPrompt` right after `identityAnchorBlock`) tells the model:
infer plausible ambient activity from scene type only when the location is
the kind of place that would plausibly be populated and the script is silent
on it, write it as a short clause inside `prompt`, never name it as a
character, never add it to `assetsUsed`, skip it for interior/private/sparse
locations, and never contradict a script line that states who is or isn't
present.

Characters extracted as assets remain driven by `[CHARACTER]` cues and
`characterIdentityBlock()` — this change does not extract crowd as a
character asset under any circumstance, even a recurring one ("villagers"
named generically). If a specific crowd type needs to render consistently
across shots, that requires giving it an actual name in the script so normal
extraction picks it up — this block does not change when a character asset
gets created.
