export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findMatch<T extends { name: string }>(entries: T[], name: string): T | undefined {
  const norm = normalizeName(name);
  return entries.find((e) => normalizeName(e.name) === norm);
}
