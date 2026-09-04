// Flattens a Tiptap document JSON into plain text for prompting, tagging each
// line with its screenplay role — [SCENE], [CHARACTER], [DIALOG], etc. — so
// the AI gets the structure straight from the editor's node types instead of
// having to re-infer it from formatting conventions (ALL CAPS, indentation).
const BLOCK_TAGS: Record<string, string> = {
  paragraph: "ACTION",
  heading: "ACTION",
  title: "TITLE",
  sceneHeading: "SCENE",
  character: "CHARACTER",
  parenthetical: "PARENTHETICAL",
  dialog: "DIALOG",
  transition: "TRANSITION",
};

function textOf(node: { type?: string; text?: string; content?: unknown[] }): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map((c) => textOf(c as typeof node)).join("") : "";
}

export function tiptapToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as { type?: string; content?: unknown[] };

  if (!Array.isArray(node.content)) return "";

  return node.content
    .map((child) => {
      const c = child as { type?: string; content?: unknown[] };
      const tag = BLOCK_TAGS[c.type ?? ""];
      const text = textOf(c);
      if (!tag || !text.trim()) return "";
      return `[${tag}] ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}
