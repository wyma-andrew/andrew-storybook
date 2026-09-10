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
import { REGIONS } from "@/lib/constants/regions";
import { MOTION_STYLES, MOTION_MODE_OPTIONS } from "@/lib/constants/motion-styles";

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
                  {/* One text per region — both are shown, since a style can read
                      very differently in each and this page is where that is checked. */}
                  {REGIONS.map((r) => (
                    <div key={r.value} className="mt-2 first:mt-0">
                      <div className="mb-1 text-[10px] tracking-wider text-fg-3 uppercase">{r.label}</div>
                      <p className="text-xs text-fg-2">
                        {s.text[r.value].base + s.text[r.value].referenceClause + s.text[r.value].tail}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="Motion Styles" count="Platform-wide · fixed" />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Defined in code (lib/constants/motion-styles.ts). A story picks one; each shot is tagged with a
              motion mode, and the paragraph below is appended to that shot&apos;s copied video prompt. The AI never
              writes motion wording itself.
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
              {MOTION_STYLES.map((m) => (
                <div className="rounded-[10px] border border-line bg-panel-2 p-3.5" key={m.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <b className="text-sm">{m.name}</b>
                    <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">
                      Default: {m.defaultMode}
                    </span>
                    <span className="ml-auto rounded-full border border-line-2 px-2 py-0.5 text-[10px] text-fg-3">
                      Locked
                    </span>
                  </div>
                  {MOTION_MODE_OPTIONS.filter((o) => m.allowedModes.includes(o.value)).map((o) => (
                    <div key={o.value} className="mt-2 first:mt-0">
                      <div className="mb-1 text-[10px] tracking-wider text-fg-3 uppercase">{o.label}</div>
                      <p className="text-xs whitespace-pre-wrap text-fg-2">{m.text[o.value]}</p>
                    </div>
                  ))}
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
