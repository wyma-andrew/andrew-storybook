// inline-block + leading-normal, not a bare inline span: Burmese stacks marks
// above and below the baseline, and a tight line box clips them — the same fix
// the asset card's title already carries. It also gives the tag a box that can
// be given a max-width and truncated on its own, instead of needing a wrapper
// whose overflow-hidden does the clipping.
export function Tag({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  /** Native tooltip, for a label the tag may have to truncate. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block rounded-full border border-line-2 bg-chip px-2.5 py-1 text-[10.5px] leading-normal text-fg-2 ${className}`}
    >
      {children}
    </span>
  );
}

export function AccentTag({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    // The border is what keeps this readable on a tinted surface: accent-dim is
    // a pale wash in light mode and blended into the story card's thumbnail.
    <span
      title={title}
      className={`inline-block rounded-full border border-accent/25 bg-accent-dim px-2.5 py-1 text-[10.5px] leading-normal text-accent ${className}`}
    >
      {children}
    </span>
  );
}
