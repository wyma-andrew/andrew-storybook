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
      className={`grid shrink-0 place-items-center border border-line-2 bg-gradient-to-br from-[#2b2b2b] to-[#151515] tracking-wide text-fg-2 ${
        round ? "rounded-full" : "rounded-lg"
      } ${className}`}
      style={{ width: size, height: size, fontSize: size < 26 ? 9.5 : 11 }}
    >
      {children}
    </div>
  );
}
