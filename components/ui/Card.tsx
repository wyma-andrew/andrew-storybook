export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <article className={`overflow-hidden rounded-[10px] border border-line bg-panel-2 ${className}`}>{children}</article>;
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 px-3.5 pb-3.5">{children}</div>;
}
