export function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border border-line-2 bg-[#161616] px-2.5 py-1 text-[10.5px] text-fg-2 ${className}`}>
      {children}
    </span>
  );
}

export function AccentTag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full bg-accent-dim px-2.5 py-1 text-[10.5px] text-accent ${className}`}>{children}</span>
  );
}
