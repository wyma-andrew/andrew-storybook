export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-[10px] border border-line bg-panel-2 shadow-sm ${className}`}>
      {children}
    </article>
  );
}

export function CardHeader({
  children,
  className = "",
  divider = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Off for cards with no body: a rule between two adjacent rows boxes each of them. */
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 ${
        divider ? "border-b border-line py-3" : "pt-3.5 pb-1"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Two columns: location cards carry up to four actions (copy prompt, copy
// floor plan, regenerate) and a single row squeezed them to
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

// Footer for a card whose secondary actions live behind a trailing menu button:
// the named copy buttons, then an auto-width trigger. The trigger must not be
// stretched into an equal column — it is an affordance, not an action of the
// same weight as the named ones.
//
// The menu also does the job the old CardActions divider did: actions that
// CHANGE the asset (regenerate) must not sit in the same row as
// buttons that only copy text out of it, or a destructive action reads as one
// more copy button.
export function CardFooterWithMenu({
  children,
  actions = 2,
}: {
  children: React.ReactNode;
  /** How many named buttons precede the trailing icon buttons — locations have two,
   *  everything else one. The three auto columns are the upload button, the
   *  view-prompt button and the menu. */
  actions?: 1 | 2;
}) {
  return (
    <div
      className={`mt-auto grid gap-2 px-3.5 pt-3.5 pb-3.5 ${
        actions === 1 ? "grid-cols-[1fr_auto_auto_auto]" : "grid-cols-[1fr_1fr_auto_auto_auto]"
      }`}
    >
      {children}
    </div>
  );
}
