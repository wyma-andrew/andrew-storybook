"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { Card, CardHeader, CardFooter } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { MiniButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { Textarea, Switch } from "@geckoui/geckoui";
import { useRead, useWrite } from "@/lib/spoosh";
import type { BibleEntry } from "@/lib/api/types";

function BibleCard({ entry }: { entry: BibleEntry }) {
  const [prompt, setPrompt] = useState(entry.realPrompt);
  const [editing, setEditing] = useState(false);
  const { trigger: patch, loading } = useWrite((api) => api("bible-entries/:id").PATCH());

  async function toggleLock() {
    await patch({ params: { id: entry.id }, body: { locked: !entry.locked } });
  }
  async function save() {
    await patch({ params: { id: entry.id }, body: { realPrompt: prompt } });
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <Avatar>{entry.name.slice(0, 2).toUpperCase()}</Avatar>
        <div>
          <div className="font-semibold">{entry.name}</div>
          <div className="text-[11.5px] text-fg-3">{entry.meta}</div>
        </div>
      </CardHeader>

      <div className="flex items-center gap-2 px-3.5 pt-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2 select-none">
          <Switch size="sm" checked={entry.locked} onChange={toggleLock} />
          <span className={`font-semibold ${entry.locked ? "text-accent" : ""}`}>{entry.locked ? "Locked" : "Unlocked"}</span>
        </label>
        {entry.seed && <span className="ml-auto text-[11.5px] text-fg-3">seed {entry.seed}</span>}
      </div>

      {editing ? (
        <div className="px-3.5 pt-2.5">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[90px] font-mono text-[12.5px]" />
        </div>
      ) : (
        <div className="p-3.5 font-mono text-[12.5px] whitespace-pre-wrap text-[#c6c6c6]">{entry.realPrompt}</div>
      )}

      <CardFooter>
        {editing ? (
          <>
            <MiniButton onClick={save} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </MiniButton>
            <MiniButton
              ghost
              onClick={() => {
                setEditing(false);
                setPrompt(entry.realPrompt);
              }}
            >
              Cancel
            </MiniButton>
          </>
        ) : (
          <>
            <MiniButton onClick={() => navigator.clipboard.writeText(entry.realPrompt)}>Copy prompt</MiniButton>
            <MiniButton ghost onClick={() => setEditing(true)}>
              Edit
            </MiniButton>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export default function BiblePage() {
  const { id } = useParams<{ id: string }>();
  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: bible } = useRead((api) => api("stories/:id/bible").GET({ params: { id } }));

  const characters = bible?.filter((b) => b.kind === "character") ?? [];
  const locations = bible?.filter((b) => b.kind === "location") ?? [];

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <Link href={`/stories/${id}`}>{story?.title ?? "…"}</Link> /{" "}
          <span className="text-fg">Asset Bible</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap wide>
          <section className="mb-11">
            <SectionHead title="Characters" count={`${characters.length} in bible`} />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Promoted from episode Assets steps. Editing here updates every episode that references this
              entry going forward.
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
              {characters.map((b) => (
                <BibleCard key={b.id} entry={b} />
              ))}
              {characters.length === 0 && <span className="text-[12.5px] text-fg-3">None yet.</span>}
            </div>
          </section>

          <section className="mb-11">
            <SectionHead title="Locations" count={`${locations.length} in bible`} />
            <div className="mb-4 text-[12.5px] text-fg-3">
              Environment plates reused as background reference wherever the scene occurs.
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
              {locations.map((b) => (
                <BibleCard key={b.id} entry={b} />
              ))}
              {locations.length === 0 && <span className="text-[12.5px] text-fg-3">None yet.</span>}
            </div>
          </section>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
