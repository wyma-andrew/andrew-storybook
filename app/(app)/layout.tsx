import { Sidebar } from "@/components/Sidebar";
import { MobileNavProvider } from "@/components/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-screen p-2 md:p-3.5">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-panel md:border md:border-line">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  );
}
