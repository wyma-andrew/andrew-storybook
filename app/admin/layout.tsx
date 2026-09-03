"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal, Palette } from "lucide-react";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { TopBar, Crumb, Wrap } from "@/components/ui/Layout";

const NAV = [
  { href: "/admin/system-prompts", label: "System Prompts", icon: SlidersHorizontal },
  { href: "/admin/visual-styles", label: "Visual Styles", icon: Palette },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <Link href="/settings">Settings</Link> / <span className="text-fg">Admin</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="rounded-full border border-sys-badge-border bg-sys-badge-bg px-2.5 py-1 text-[10px] tracking-wide text-sys-badge">
            ADMIN
          </span>
          <AccountMenu />
        </div>
      </TopBar>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-line p-3">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium no-underline ${
                    active ? "bg-[#232323] text-fg" : "text-fg-2 hover:bg-[#171717] hover:text-fg"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 overflow-auto py-9">
          <Wrap wide>{children}</Wrap>
        </div>
      </div>
    </Frame>
  );
}
