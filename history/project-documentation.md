# Project documentation

Covers: `ARCHITECTURE.md`, `AGENTS.md` (documentation map), `README.md`.

## 2026-09-09 — Separate current architecture from rules and decision history

**Decision:** maintain a concise root `ARCHITECTURE.md` as the living map of
the current product, code ownership, request flows, and schema relationships.
`AGENTS.md` remains the source of mandatory implementation rules, `history/`
remains the source of feature decisions and rejected alternatives, and
`README.md` remains the place for human setup and onboarding.

This lets a new human or AI session orient itself without rediscovering the
whole repository, while preserving the detailed reasoning that cannot be
reconstructed from code. Architecture changes must update the map, but ordinary
file edits and implementation details should not, so maintenance stays small.

Rejected: putting the complete tree, feature summaries, rules, and historical
reasoning into one large README or AGENTS file. That duplicates sources of
truth, makes mandatory instructions harder to scan, and increases the chance
that one copy becomes stale. Also rejected: listing every repository file or
keeping a broad `done / in progress / planned` board in `ARCHITECTURE.md`; both
change too frequently for a concise orientation document, and planned work
belongs in issues or a dedicated roadmap.

Consequence: feature work may require two short documentation updates for two
different reasons—`ARCHITECTURE.md` when the current system map changes, and the
matching `history/` file when a behavioral decision or constraint changes.
