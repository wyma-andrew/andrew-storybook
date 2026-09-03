"use client";

import Link from "next/link";
import { Lock, ChevronRight } from "lucide-react";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { SectionHead } from "@/components/ui/SectionHead";
import { AdminBlock } from "@/components/ui/AdminBlock";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead } from "@/lib/spoosh";

export default function SettingsPage() {
  const { data: styles } = useRead((api) => api("visual-styles").GET());
  const { data: prompts } = useRead((api) => api("system-prompts").GET());

  const character = prompts?.find((p) => p.kind === "character");
  const location = prompts?.find((p) => p.kind === "location");

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Settings</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap wide>
          <section className="mb-11">
            <SectionHead title="Visual Styles" count="Global library · used across all your stories" />
            <div className="mb-4 flex items-center gap-1 text-[12.5px] text-fg-3">
              Applies as the [Style] injection on every character &amp; location prompt. Any story can also
              define a one-off custom style that overrides this locally.
              <Link href="/admin/visual-styles" className="ml-2 flex shrink-0 items-center gap-0.5 text-fg-2 no-underline hover:text-fg">
                Manage <ChevronRight size={12} />
              </Link>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
              {styles?.map((s) => (
                <div className="rounded-[10px] border border-line bg-panel-2 p-3.5" key={s.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-6.5 w-6.5 rounded-lg border border-line-2" style={{ background: s.swatch ?? "#8a8a8a" }} />
                    <b className="text-sm">{s.name}</b>
                    <span className="ml-auto rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">
                      {s.source === "built_in" ? "Built-in" : "Yours"}
                    </span>
                  </div>
                  <p className="text-xs text-fg-2">{s.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="System Prompts" count="Platform-wide · admin managed" />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Fixed boilerplate injected into every character &amp; location prompt. Not editable by story
              owners — keeps every story on the same production baseline.
            </div>

            {character && (
              <AdminBlock title="Character preset" badge="ADMIN ONLY">
                <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                  <Lock size={13} /> You can view this preset but cannot edit it.
                </div>
                <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">{character.prompt}</div>
              </AdminBlock>
            )}

            {location && (
              <AdminBlock title="Location preset" badge="ADMIN ONLY" className="mt-3.5">
                <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                  <Lock size={13} /> You can view this preset but cannot edit it.
                </div>
                <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">{location.prompt}</div>
              </AdminBlock>
            )}

            <div className="mt-3.5">
              <Link href="/admin/system-prompts" className="flex items-center gap-1 text-[12.5px] text-fg-3 no-underline">
                Admin console (requires admin role) <ChevronRight size={13} />
              </Link>
            </div>
          </section>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
