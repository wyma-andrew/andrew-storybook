export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col p-3.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-panel">
        {children}
      </div>
    </div>
  );
}
