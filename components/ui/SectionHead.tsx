export function SectionHead({
  title,
  count,
  sub,
  action,
}: {
  title: string;
  count?: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div>
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold tracking-wide">{title}</h2>
          {count && <span className="text-xs text-fg-3">{count}</span>}
        </div>
        {sub && <div className="mt-1 text-[12.5px] text-fg-3">{sub}</div>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
