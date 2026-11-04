# Script format guide

Covers: `lib/tiptap/screenplay-parser.ts` (`SCREENPLAY_FORMAT_GUIDE`),
`components/ScriptEditor.tsx` (Copy Format Guide).

## 2026-10-30 — Scene boundaries split only on real change, narrated events still get Scenes

**Problem.** The 2026-10-22 rule ("one Scene per distinct place/event") made the
guide split every spoken beat into its own Scene, so one continuous conversation
in one place came out as many Scenes.

**Decision.** The first two SCENE RULES bullets are reworded. A Scene is continuous
action in one staging area and time period; a new Scene starts when the place
changes, a time jump begins a distinct sequence, or the narrative enters an event
shown from narration, memory, flashback or explanation. Arrival, speech and reaction
in the same place stay in one Scene. A narrated or remembered event the story means
to show still must get its own Scene(s) and never sits only in Dialog or Voice Over.

**Why both.** The boundary rule prevents splitting continuous action; it does not
remove the 2026-10-22 requirement to visualize narrated events. The two are
reconciled, not traded off.

**Consequence.** The "each place is a separate Scene" sentence was dropped from the
guide. A distinct place is still a new Scene because it is a new staging area.

## 2026-10-22 — The guide is a prompt template, not just a format example

The guide used to be a bare `Label: text` sample. Scripts written from it came
out with a few scenes and the told story left inside Dialog/Voice Over (a
grandfather narrating a heaven-realm episode produced no heaven scene, so no
location or character for it). Asset extraction and storyboard generation only
draw what a `[SCENE]` shows, so the fix is at the script, not the prompts.

`SCREENPLAY_FORMAT_GUIDE` is now instructions to paste into an external AI with
the story: one Scene per distinct place/event, told or remembered episodes
staged as their own Scenes with Action, frame story kept as separate scenes
around them, Voice Over only as narration over a Scene that shows it, no
dropped or invented events. The format sample is kept at the end.

Rejected for now: changing extraction prompts to treat Voice Over narration as
scenes. It would add unwanted places/characters to every script; revisit only
if well-split scripts still lose content.

Consequence: the copied text is long and ends with `(paste the story here)`;
that is intended.
