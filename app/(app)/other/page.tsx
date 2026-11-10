"use client";

import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { OTHER_TOOLS } from "@/components/other-tools";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { useRead } from "@/lib/spoosh";

export default function OtherToolsPage() {
  const { data: me, loading } = useRead((api) => api("auth/me").GET());
  const tools = OTHER_TOOLS.filter((tool) => me?.features[tool.feature]);

  return <>
    <TopBar><div className="flex items-center gap-2 text-[19px] font-medium"><LayoutGrid size={19} /> Other</div></TopBar>
    <Body><Wrap wide>
      {loading && !me ? <p className="text-fg-3">Loading…</p> : tools.length === 0 ? <p className="text-fg-3">No other tools are enabled for this account.</p> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {tools.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="group flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-4 text-fg no-underline transition-colors hover:border-line-2">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent"><Icon size={20} /></span>
                <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{label}</h2>
                <ChevronRight size={16} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-xs leading-relaxed text-fg-2">{description}</p>
            </Link>
          ))}
        </div>
      )}
    </Wrap></Body>
  </>;
}
