export function AdminBlock({
  title,
  badge,
  children,
  className = "",
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[10px] border border-line bg-panel-2 ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <b className="text-sm">{title}</b>
        {badge && (
          <span className="rounded-full border border-sys-badge-border bg-sys-badge-bg px-2.5 py-1 text-[10px] tracking-wide text-sys-badge">
            {badge}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
