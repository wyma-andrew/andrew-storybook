// Parses a lightweight, Fountain-style plain-text screenplay format into the
// Tiptap JSON block nodes defined in screenplay-nodes.ts. This is the single
// source of truth for "what shape of text can be imported" — the same
// cheat-sheet text is shown (and copyable) in the import dialog.

export type ScreenplayBlock = {
  type: "title" | "sceneHeading" | "character" | "parenthetical" | "dialog" | "transition" | "paragraph";
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

function isAllCapsLine(line: string) {
  return line === line.toUpperCase() && /[A-Z]/.test(line);
}

function textNode(text: string): { type: "text"; text: string }[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

/** Parses screenplay-format text into an array of Tiptap block nodes. */
export function parseScreenplayText(input: string): ScreenplayBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: ScreenplayBlock[] = [];
  let expectingDialog = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

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

    if (isAllCapsLine(line) && CHARACTER_RE.test(line)) {
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

/** Human-readable format guide, shown in the import dialog. */
export const SCREENPLAY_FORMAT_GUIDE = `TITLE: Story Name

INT. LOCATION - DAY

Action line describing what happens.

CHARACTER NAME
(parenthetical, optional)
Dialog line the character says.

CUT TO:

EXT. ANOTHER LOCATION - NIGHT

More action.`;
