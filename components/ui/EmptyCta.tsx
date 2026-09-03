export function EmptyCta({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mt-6.5 rounded-xl px-6 py-11 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-panel-2 text-fg-2">
          {icon}
        </div>
      )}
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <p className="mx-auto mb-5 max-w-[420px] text-[13px] text-fg-2">{children}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
