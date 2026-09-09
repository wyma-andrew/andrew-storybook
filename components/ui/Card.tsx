export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-[10px] border border-line bg-panel-2 ${className}`}>
      {children}
    </article>
  );
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">{children}</div>;
}

// Two columns: location cards carry up to four actions (copy prompt, copy
// floor plan, regenerate, add to bible) and a single row squeezed them to
// unreadable widths. The last-child:nth-child(odd) rule makes a trailing
// button span both columns, so an odd count ends flush instead of leaving a
// half-width straggler.
export function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto grid grid-cols-2 gap-2 px-3.5 pb-3.5 [&>*:last-child:nth-child(odd)]:col-span-2">
      {children}
    </div>
  );
}

// Actions that CHANGE the asset (regenerate, add to bible), split off from the
// copy buttons above by a divider — everything in CardFooter only copies text
// out of the card, and mixing the two in one grid made a destructive action
// read as one more copy button. Same two-column rules as CardFooter.
export function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-line px-3.5 pt-3 pb-3.5 [&>*:last-child:nth-child(odd)]:col-span-2">
      {children}
    </div>
  );
}
