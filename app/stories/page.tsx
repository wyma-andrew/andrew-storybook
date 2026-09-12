"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { LinkButton } from "@/components/ui/Button";
import { AccentTag } from "@/components/ui/Tag";
import { TopBar, Body, Wrap, Foot } from "@/components/ui/Layout";
import { SkeletonStoryGrid } from "@/components/ui/Skeleton";
import { useRead } from "@/lib/spoosh";

export default function StoriesPage() {
  const { data: stories, loading, error } = useRead((api) => api("stories").GET());

  return (
    <Frame>
      <TopBar>
        <div className="text-[19px] font-medium">AI Storybook</div>
        <div className="ml-auto flex items-center gap-2.5">
          <LinkButton variant="secondary" href="/stories/trash" className="flex h-9 items-center text-[13.5px]">
            Trash Bin
          </LinkButton>
          <LinkButton variant="secondary" href="/settings" className="!h-9 !w-9 !p-0 flex items-center justify-center" title="Settings">
            <Settings size={16} />
          </LinkButton>
          <ThemeToggleButton />
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mb-5 flex items-baseline gap-2.5">
            <h1 className="text-xl font-semibold">Your Stories</h1>
            <span className="text-[13px] text-fg-3">{stories?.length ?? 0} stories</span>
          </div>

          {error && <p className="text-danger">Couldn&apos;t load stories: {error.error}</p>}
          {loading && !stories && <SkeletonStoryGrid label="Loading stories" />}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {stories?.map((s) => (
              <Link
                key={s.id}
                href={`/stories/${s.id}`}
                className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2 text-fg no-underline hover:border-line-2"
              >
                <div className="flex h-[130px] items-end border-b border-line bg-gradient-to-br from-thumb-from to-thumb-to p-3">
                  <AccentTag className="uppercase tracking-wide">{s.visualStyleName ?? "No style"}</AccentTag>
                </div>
                <div className="px-4 pt-3.5 pb-4">
                  <h3 className="mb-1.5 text-[15px] font-semibold">{s.title}</h3>
                  <div className="mb-3.5 line-clamp-2 text-[12.5px] text-fg-2">{s.description || "No description yet."}</div>
                  <div className="flex gap-3.5 border-t border-line pt-3 text-[11.5px] text-fg-3">
                    <span>
                      <b className="font-semibold text-fg-2">{s.chapterCount}</b> episodes
                    </span>
                    <span>Updated {new Date(s.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}

            <Link
              href="/stories/new"
              className="flex min-h-[216px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-fg-3 no-underline hover:border-fg-3 hover:text-fg-2"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-[22px]">+</div>
              Create Story
            </Link>
          </div>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
