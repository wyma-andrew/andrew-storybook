"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { SectionHead } from "@/components/ui/SectionHead";
import { AdminBlock } from "@/components/ui/AdminBlock";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { SYSTEM_PROMPTS } from "@/lib/constants/system-prompts";
import { VISUAL_STYLES } from "@/lib/constants/visual-styles";

export default function SettingsPage() {
  const character = SYSTEM_PROMPTS.character;
  const locationInterior = SYSTEM_PROMPTS.locationInterior;
  const locationExterior = SYSTEM_PROMPTS.locationExterior;

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
            <SectionHead title="Visual Styles" count="Platform-wide · fixed" />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Defined in code (lib/constants/visual-styles.ts) — no editor here. To add, edit, or remove a
              style, a project owner changes that file directly.
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
              {VISUAL_STYLES.map((s) => (
                <div className="rounded-[10px] border border-line bg-panel-2 p-3.5" key={s.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-6.5 w-6.5 rounded-lg border border-line-2" style={{ background: s.swatch }} />
                    <b className="text-sm">{s.name}</b>
                    <span className="ml-auto rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">
                      Locked
                    </span>
                  </div>
                  <p className="text-xs text-fg-2">{s.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="System Prompts" count="Platform-wide · fixed" />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Fixed boilerplate injected into every character &amp; location prompt. Not editable in the app —
              keeps every story on the same production baseline.
            </div>

            <AdminBlock title="Character preset" badge="LOCKED">
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                <Lock size={13} /> You can view this preset but cannot edit it.
              </div>
              <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">{character}</div>
            </AdminBlock>

            <AdminBlock title="Location preset — interior" badge="LOCKED" className="mt-3.5">
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                <Lock size={13} /> You can view this preset but cannot edit it.
              </div>
              <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">
                {locationInterior}
              </div>
            </AdminBlock>

            <AdminBlock title="Location preset — exterior" badge="LOCKED" className="mt-3.5">
              <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-line-2 bg-[#0f0f0f] px-3 py-2.5 text-xs text-fg-3">
                <Lock size={13} /> Used when a location&apos;s space kind is exterior.
              </div>
              <div className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#c6c6c6]">
                {locationExterior}
              </div>
            </AdminBlock>
          </section>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
