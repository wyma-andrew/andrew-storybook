// Standalone page shell — used only outside the `(app)` route group's shared
// layout (sign-in, sign-up), where there is no session yet and so no Sidebar.
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen p-3.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-panel">
        {children}
      </div>
    </div>
  );
}
