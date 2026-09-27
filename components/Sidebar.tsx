"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beaker, BookOpen, Clapperboard, Languages, Menu, Shield } from "lucide-react";
import { Drawer } from "@geckoui/geckoui";
import { Button } from "@/components/ui/Button";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { AccountMenu } from "@/components/AccountMenu";
import { useMobileNav } from "@/components/MobileNav";
import { useRead } from "@/lib/spoosh";
import type { FeatureKey } from "@/lib/constants/features";

// `hidden` keeps an unfinished feature out of the nav without deleting its
// entry — the route still works if you type it, so it can be worked on and
// shared by URL. Flip the flag to put it back.
//
// `feature` ties an entry to the per-user access flag that gates it. An entry
// the account cannot use is left out entirely rather than shown disabled —
// nothing about it is actionable, and the route redirects anyway.
const NAV_ITEMS = [
  { href: "/stories", label: "Stories", icon: BookOpen, hidden: false, feature: "stories" },
  { href: "/movie-recap", label: "Movie Recap", icon: Clapperboard, hidden: false, feature: "movie_recap" },
  { href: "/translate", label: "Translate", icon: Languages, hidden: false, feature: "translate" },
  { href: "/labs/voice", label: "Voice Lab", icon: Beaker, hidden: false, feature: "voice_lab" },
] as const satisfies readonly { href: string; label: string; icon: typeof BookOpen; hidden: boolean; feature: FeatureKey }[];

const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.hidden);

const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: Shield } as const;

const STORAGE_KEY = "sidebar-collapsed";

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useRead((api) => api("auth/me").GET());
  const items = [
    ...VISIBLE_NAV_ITEMS.filter((item) => me?.features[item.feature]),
    ...(me?.isAdmin ? [ADMIN_ITEM] : []),
  ];

  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-[9px] text-[13.5px] no-underline ${
              // The drawer is touched, not clicked: 44px rows there, the denser
              // desktop row otherwise.
              onNavigate ? "min-h-11 px-3 py-2.5" : collapsed ? "justify-center px-0 py-2" : "px-2.5 py-2"
            } ${active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && label}
          </Link>
        );
      })}
    </>
  );
}

function NavFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={`mt-auto flex items-center gap-2 border-t border-line pt-3 ${
        collapsed ? "flex-col px-0" : "px-2.5"
      }`}
    >
      <ThemeToggleButton className="!h-8 !w-8" />
      <AccountMenu />
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { open, closeNav } = useMobileNav();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let frame: number | undefined;
    try {
      const storedCollapsed = localStorage.getItem(STORAGE_KEY) === "1";
      frame = requestAnimationFrame(() => setCollapsed(storedCollapsed));
    } catch {
      // ignore — falls back to expanded
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);

  // The drawer sits over the page it navigated to, so it has to close itself on
  // every route change — tapping a link would otherwise leave it covering the
  // destination.
  useEffect(() => {
    closeNav();
  }, [pathname, closeNav]);

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
    <>
      <nav
        className={`hidden shrink-0 flex-col gap-1 py-1.5 pr-3.5 transition-[width] md:flex ${
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
        <NavLinks collapsed={collapsed} />
        <NavFooter collapsed={collapsed} />
      </nav>

      {/* Below `md` the rail is replaced by an off-canvas drawer: a 52px icon
          strip would still take ~14% of a phone's width, and the collapse
          toggle is a desktop affordance. `md:hidden` on both panel and backdrop
          covers the case where the viewport is widened while the drawer is
          open. */}
      <Drawer
        open={open}
        handleClose={closeNav}
        placement="left"
        className="flex w-[260px] max-w-[80vw] flex-col gap-1 bg-panel px-3 py-4 md:hidden"
        backdropClassName="md:hidden"
      >
        <span className="px-3 pb-3 text-[13px] font-medium text-fg-3">AI Storybook</span>
        <NavLinks collapsed={false} onNavigate={closeNav} />
        <NavFooter collapsed={false} />
      </Drawer>
    </>
  );
}
