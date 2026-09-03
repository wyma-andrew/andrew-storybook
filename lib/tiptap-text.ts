// Flattens a Tiptap document JSON into plain text for prompting.
export function tiptapToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (node.type === "text" && typeof node.text === "string") return node.text;
  const children = Array.isArray(node.content)
    ? node.content.map(tiptapToText).join("")
    : "";
  const blockTypes = [
    "paragraph",
    "heading",
    "title",
    "sceneHeading",
    "character",
    "parenthetical",
    "dialog",
    "transition",
  ];
  return blockTypes.includes(node.type ?? "") ? children + "\n" : children;
}
