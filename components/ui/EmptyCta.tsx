export function EmptyCta({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-6.5 rounded-xl border border-dashed border-line-2 px-6 py-11 text-center">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <p className="mx-auto mb-5 max-w-[420px] text-[13px] text-fg-2">{children}</p>
      {action}
    </div>
  );
}
