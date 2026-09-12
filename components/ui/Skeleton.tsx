// Skeletons, not spinners or "Loading…": these pages load a known shape (a grid
// of story cards, a list of episode rows, a column of asset cards), so showing
// that shape keeps the layout from jumping when the data lands and tells the
// reader what is coming. A spinner says only "wait".
//
// aria-hidden throughout, with one role="status" on the wrapper — a screen
// reader should hear "Loading X", not a list of empty boxes.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-hover ${className}`} />;
}

export function SkeletonLines({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        // Last line short, like real ragged text.
        <Skeleton key={i} className={`h-3 ${i === count - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Story/trash grid: thumbnail band, title, two lines of description, a footer. */
export function SkeletonStoryGrid({ count = 6, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2 shadow-sm">
          <Skeleton className="h-[130px] rounded-none" />
          <div className="px-4 pt-3.5 pb-4">
            <Skeleton className="mb-2.5 h-4 w-1/2" />
            <SkeletonLines count={2} className="mb-3.5" />
            <div className="border-t border-line pt-3">
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Episode list on a story page: number tile, title, meta line. */
export function SkeletonRows({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-[10px] border border-line bg-panel-2 px-4 py-3.5 shadow-sm"
        >
          <Skeleton className="h-8.5 w-8.5 shrink-0 rounded-[9px]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-3.5 w-1/3" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Asset/shot cards: header band, body text, a footer row of buttons. */
export function SkeletonCards({
  count = 6,
  label,
  columns = "grid-cols-[repeat(auto-fill,minmax(320px,1fr))]",
}: {
  count?: number;
  label: string;
  columns?: string;
}) {
  return (
    <div role="status" aria-label={label} className={`grid gap-4 ${columns}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[10px] border border-line bg-panel-2 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-1.5 h-3.5 w-1/2" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
          </div>
          <div className="p-3.5">
            <SkeletonLines count={4} />
          </div>
          <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Script editor: a page of ragged screenplay lines. */
export function SkeletonScript({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto w-full max-w-[820px] px-6 py-8">
      <Skeleton className="mx-auto mb-9 h-4 w-1/3" />
      {Array.from({ length: 4 }, (_, block) => (
        <div key={block} className="mb-7">
          <Skeleton className="mb-3 h-3.5 w-2/5" />
          <SkeletonLines count={3} />
        </div>
      ))}
    </div>
  );
}
