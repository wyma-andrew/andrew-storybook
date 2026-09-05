// Style is passed to the model as context only — never as a literal tag to
// echo back. The app injects the actual style tag client-side at copy time,
// so a stored prompt stays reusable if the story's style is later changed.
export function styleContextBlock(styleContext?: string | null) {
  if (!styleContext) return "";
  return (
    `\n\nVisual Style Context: "${styleContext}"\n` +
    "(Note: Do NOT include explicit style keywords, camera technical terms, or rendering engine names in the generated text. " +
    "Use this style context ONLY to guide the mood, atmosphere, and descriptive detail choices — the literal style tag is injected separately by the app.)"
  );
}
