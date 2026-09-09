// Parses a lightweight, Fountain-style plain-text screenplay format into the
// Tiptap JSON block nodes defined in screenplay-nodes.ts. This is the single
// source of truth for "what shape of text can be imported" — the same
// cheat-sheet text is shown (and copyable) in the import dialog.

export type ScreenplayBlock = {
  type: "title" | "sceneHeading" | "character" | "parenthetical" | "dialog" | "voiceOver" | "transition" | "paragraph";
  content?: { type: "text"; text: string }[];
};

const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TRANSITION_RE = /(TO:|^FADE (IN|OUT)[:.]?$|^CUT TO:?$|^SMASH CUT TO:?$)$/i;
const PARENTHETICAL_RE = /^\(.*\)$/;
const TITLE_RE = /^TITLE:\s*/i;
// All-caps character cue: letters/digits/spaces and a small set of
// punctuation, no lowercase, reasonably short (avoids matching action lines
// that happen to be capitalized for emphasis).
const CHARACTER_RE = /^[A-Z0-9][A-Z0-9 .'#\-]{0,38}$/;

// Sentence-ending punctuation, Latin + Burmese (U+104A little section, U+104B
// section = full stop). A cue line never ends with one.
const SENTENCE_END_RE = /[.?!,;:\u104A\u104B]$/;
const HAS_LOWERCASE_RE = /\p{Ll}/u;

function isAllCapsLine(line: string) {
  return line === line.toUpperCase() && /[A-Z]/.test(line);
}

// Uncased scripts (Burmese, Thai, CJK, …) have no ALL-CAPS signal, so the cue
// is recognised positionally instead, the way Fountain does it: a short line
// with a blank line before it and a text line right after it, not ending in
// sentence punctuation. Also catches Latin cues that aren't capitalised.
function looksLikeCharacterCue(line: string, prevBlank: boolean, nextLine: string | undefined) {
  return (
    prevBlank &&
    !!nextLine &&
    nextLine.trim() !== "" &&
    line.length <= 40 &&
    !SENTENCE_END_RE.test(line) &&
    !HAS_LOWERCASE_RE.test(line)
  );
}

// Explicit `Label: text` form — the documented import format (see
// SCREENPLAY_FORMAT_GUIDE). Uncased scripts (Myanmar, Thai, CJK) carry no
// ALL-CAPS signal, so the heuristics above can only guess; a label cannot, and
// the same labels work for every language. A labelled line wins over every
// heuristic. Both ASCII ":" and the fullwidth "\uFF1A" are accepted.
const LABEL_ALIASES: Record<string, ScreenplayBlock["type"]> = {
  title: "title",
  scene: "sceneHeading",
  sceneheading: "sceneHeading",
  slug: "sceneHeading",
  action: "paragraph",
  character: "character",
  char: "character",
  paren: "parenthetical",
  parenthetical: "parenthetical",
  dialog: "dialog",
  dialogue: "dialog",
  voiceover: "voiceOver",
  vo: "voiceOver",
  narration: "voiceOver",
  transition: "transition",
};
const LABEL_RE = /^([A-Za-z][A-Za-z ]*?)\s*[:\uFF1A]\s*(.*)$/;

function matchLabel(line: string): { type: ScreenplayBlock["type"]; text: string } | null {
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const type = LABEL_ALIASES[m[1].replace(/\s+/g, "").toLowerCase()];
  return type ? { type, text: m[2].trim() } : null;
}

function textNode(text: string): { type: "text"; text: string }[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

/** Parses screenplay-format text into an array of Tiptap block nodes. */
export function parseScreenplayText(input: string): ScreenplayBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: ScreenplayBlock[] = [];
  let expectingDialog = false;
  let prevBlank = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      prevBlank = true;
      expectingDialog = false;
      continue;
    }
    const nextLine = lines[i + 1];
    const wasBlank = prevBlank;
    prevBlank = false;

    const labeled = matchLabel(line);
    if (labeled) {
      if (labeled.text) blocks.push({ type: labeled.type, content: textNode(labeled.text) });
      // A `Character:` line makes the lines that follow dialog, exactly like an
      // ALL-CAPS cue does; a bare `Dialog:` label starts a dialog block too.
      expectingDialog = labeled.type === "character" || labeled.type === "dialog";
      continue;
    }

    if (TITLE_RE.test(line)) {
      blocks.push({ type: "title", content: textNode(line.replace(TITLE_RE, "")) });
      expectingDialog = false;
      continue;
    }

    if (SCENE_HEADING_RE.test(line)) {
      blocks.push({ type: "sceneHeading", content: textNode(line) });
      expectingDialog = false;
      continue;
    }

    if (isAllCapsLine(line) && TRANSITION_RE.test(line)) {
      blocks.push({ type: "transition", content: textNode(line) });
      expectingDialog = false;
      continue;
    }

    if (PARENTHETICAL_RE.test(line)) {
      blocks.push({ type: "parenthetical", content: textNode(line) });
      expectingDialog = true;
      continue;
    }

    if (
      (isAllCapsLine(line) && CHARACTER_RE.test(line)) ||
      looksLikeCharacterCue(line, wasBlank, nextLine)
    ) {
      blocks.push({ type: "character", content: textNode(line) });
      expectingDialog = true;
      continue;
    }

    if (expectingDialog) {
      blocks.push({ type: "dialog", content: textNode(line) });
      continue;
    }

    blocks.push({ type: "paragraph", content: textNode(line) });
  }

  return blocks;
}

/**
 * The documented import format, shown (and copyable) in the import dialog.
 * `Label: text`, one block per line — script-agnostic, so English and Myanmar
 * use the exact same format. Unlabelled screenplay text still imports via the
 * heuristics above, but this is the format we tell people to use.
 */
export const SCREENPLAY_FORMAT_GUIDE = `Title: Story Name
Scene: INT. LOCATION - DAY
Action: Action line describing what happens.
Character: MG MG
Parenthetical: (optional)
Dialog: The line the character says.
Voice Over: Anonymous narration laid over one or more shots.
Transition: CUT TO:
Scene: EXT. ANOTHER LOCATION - NIGHT
Action: More action.`;
