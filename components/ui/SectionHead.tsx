export function SectionHead({
  title,
  count,
  action,
}: {
  title: string;
  count?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-1 flex items-baseline gap-3">
      <h2 className="text-[15px] font-semibold tracking-wide">{title}</h2>
      {count && <span className="text-xs text-fg-3">{count}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
