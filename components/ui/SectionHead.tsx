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
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[15px] font-semibold tracking-wide">{title}</h2>
          {count && <span className="text-xs text-fg-3">{count}</span>}
        </div>
        {sub && <div className="mt-1 text-[12.5px] text-fg-3">{sub}</div>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
