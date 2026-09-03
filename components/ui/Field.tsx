export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-[18px] max-w-[560px] ${className}`}>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-3">{label}</label>
      {children}
      {hint && <div className="mt-1.5 text-[11.5px] text-fg-3">{hint}</div>}
    </div>
  );
}
