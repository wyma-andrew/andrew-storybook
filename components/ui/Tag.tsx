export function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border border-line-2 bg-chip px-2.5 py-1 text-[10.5px] text-fg-2 ${className}`}>
      {children}
    </span>
  );
}

export function AccentTag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    // The border is what keeps this readable on a tinted surface: accent-dim is
    // a pale wash in light mode and blended into the story card's thumbnail.
    <span
      className={`rounded-full border border-accent/25 bg-accent-dim px-2.5 py-1 text-[10.5px] text-accent ${className}`}
    >
      {children}
    </span>
  );
}
