export function Body({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-auto py-9">{children}</div>;
}

export function Wrap({
  wide = false,
  children,
  className = "",
}: {
  wide?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto px-6 ${wide ? "max-w-[1180px]" : "max-w-[820px]"} ${className}`}>{children}</div>;
}

export function TopBar({ children }: { children: React.ReactNode }) {
  return <header className="flex items-center gap-3.5 border-b border-line px-6 py-4">{children}</header>;
}

export function Crumb({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-[13px] text-fg-3 [&>a]:text-fg-2 [&>a]:no-underline hover:[&>a]:text-fg">{children}</div>;
}
