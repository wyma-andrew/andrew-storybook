// One character, several stages of appearance (history/character-looks.md).
// IDENTITY LOCK in the asset's realPrompt is what every stage shares; each look
// carries the stage's own APPEARANCE and WARDROBE LOCK.

export type CharacterLook = { key: string; label: string; scenes: string[]; prompt: string };

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// jsonb comes back as whatever was stored, and model output is only as good as
// the model, so both go through here: drop entries with no prompt, and make the
// keys slugs that are unique within the character.
export function parseLooks(value: unknown): CharacterLook[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const looks: CharacterLook[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
    if (!prompt) continue;
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : `Look ${looks.length + 1}`;
    let key = slug(typeof raw.key === "string" ? raw.key : "") || slug(label) || `look-${looks.length + 1}`;
    while (seen.has(key)) key = `${key}-${looks.length + 1}`;
    seen.add(key);
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.filter((s): s is string => typeof s === "string") : [];
    looks.push({ key, label, scenes, prompt });
  }
  // A single look is no split at all: the character was one appearance and the
  // model just wrote it in the look format.
  return looks.length > 1 ? looks : [];
}

export function findLook(looks: CharacterLook[], key: string | null | undefined): CharacterLook | null {
  if (!looks.length) return null;
  return looks.find((l) => l.key === key) ?? looks[0];
}

// The text a look's reference sheet is generated from. Every look after the
// first is drawn with the first look's sheet attached — that image, not the
// IDENTITY LOCK bullets, is what keeps the face the same person across stages.
export function composeLookPrompt(realPrompt: string, looks: CharacterLook[], key: string | null | undefined): string {
  const look = findLook(looks, key);
  if (!look) return realPrompt;
  const parts = [realPrompt];
  if (look !== looks[0]) {
    parts.push(
      `SAME PERSON: the attached reference sheet shows this same character in their "${looks[0].label}" look. ` +
        "Keep the exact face, bone structure, eyes, skin tone, and build from it; change only what this look lists."
    );
  }
  parts.push(look.prompt);
  return parts.join("\n\n");
}

// Every look in one text, for places that show the whole character at once.
export function fullCharacterPrompt(realPrompt: string, looks: CharacterLook[]): string {
  return [realPrompt, ...looks.map((l) => l.prompt)].join("\n\n");
}
