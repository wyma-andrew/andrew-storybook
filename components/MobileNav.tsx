"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";

type MobileNavValue = {
  open: boolean;
  openNav: () => void;
  closeNav: () => void;
};

const MobileNavContext = createContext<MobileNavValue | null>(null);

/** Holds the mobile drawer's open state. Lives in the `(app)` layout so the
 *  Sidebar (which renders the drawer) and each page header (which renders the
 *  button that opens it) can reach the same state without prop-drilling
 *  through every page. */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openNav = useCallback(() => setOpen(true), []);
  const closeNav = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openNav, closeNav }), [open, openNav, closeNav]);

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used inside MobileNavProvider");
  return ctx;
}

/** The hamburger. Hidden from `md` up, where the sidebar is always on screen
 *  and has its own collapse toggle. */
export function MobileNavButton({ className = "" }: { className?: string }) {
  const { openNav } = useMobileNav();
  return (
    <Button
      variant="ghost"
      onClick={openNav}
      aria-label="Open navigation"
      className={`!size-9 shrink-0 !p-0 !text-fg-2 hover:!text-fg md:!hidden ${className}`}
    >
      <Menu size={18} />
    </Button>
  );
}
