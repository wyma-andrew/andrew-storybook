// A system prompt as the ordered blocks it is assembled from. Joining the
// texts with no separator must give the exact prompt the pass sends — each
// block already carries its own leading/trailing newlines. Prompt Lab shows
// these as one group with a child per block.
export type PromptPart = { key: string; label: string; source: string; text: string };

export function promptPart(key: string, label: string, source: string, text: string): PromptPart {
  return { key, label, source, text };
}

export function joinPromptParts(parts: PromptPart[]): string {
  return parts.map((p) => p.text).join("");
}

export function nonEmptyParts(parts: PromptPart[]): PromptPart[] {
  return parts.filter((p) => p.text);
}
