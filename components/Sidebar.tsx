"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clapperboard, Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { AccountMenu } from "@/components/AccountMenu";

const NAV_ITEMS = [
  { href: "/stories", label: "Stories", icon: BookOpen },
  { href: "/movie-recap", label: "Movie Recap", icon: Clapperboard },
] as const;

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore — falls back to expanded
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore — collapse state just won't persist
      }
      return next;
    });
  }

  return (
    <nav
      className={`flex shrink-0 flex-col gap-1 py-1.5 pr-3.5 transition-[width] ${
        collapsed ? "w-[52px]" : "w-[176px]"
      }`}
    >
      <div
        className={`flex items-center pt-1.5 pb-3 ${collapsed ? "justify-center px-0" : "justify-between px-2.5"}`}
      >
        {!collapsed && <span className="text-[13px] font-medium text-fg-3">AI Storybook</span>}
        <Button
          variant="ghost"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="!size-7 !p-0 !text-fg-3 hover:!text-fg"
        >
          <Menu size={16} />
        </Button>
      </div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-2.5 rounded-[9px] py-2 text-[13.5px] no-underline ${
              collapsed ? "justify-center px-0" : "px-2.5"
            } ${active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && label}
          </Link>
        );
      })}

      <div
        className={`mt-auto flex items-center gap-2 border-t border-line pt-3 ${
          collapsed ? "flex-col px-0" : "px-2.5"
        }`}
      >
        <ThemeToggleButton className="!h-8 !w-8" />
        <AccountMenu />
      </div>
    </nav>
  );
}
