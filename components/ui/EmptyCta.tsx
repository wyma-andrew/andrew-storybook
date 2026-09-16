export function EmptyCta({
  title,
  children,
  action,
  icon,
  dotted = false,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  // Opt-in, not the default for every empty state: a dotted outline reads as a
  // DROP TARGET, which is true on the chapter images page and false everywhere
  // else an EmptyCta appears.
  dotted?: boolean;
}) {
  return (
    <div
      className={`mt-6.5 rounded-xl px-4 py-9 text-center md:px-6 md:py-11 ${
        dotted ? "border border-dotted border-line-2" : ""
      }`}
    >
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
