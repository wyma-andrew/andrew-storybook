export function Avatar({
  children,
  size = 30,
  round = false,
  className = "",
}: {
  children: React.ReactNode;
  size?: number;
  round?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`grid shrink-0 place-items-center border border-line-2 bg-gradient-to-br from-avatar-from to-avatar-to tracking-wide text-fg-2 ${
        round ? "rounded-full" : "rounded-lg"
      } ${className}`}
      style={{ width: size, height: size, fontSize: size < 26 ? 9.5 : 11 }}
    >
      {children}
    </div>
  );
}
