import { Button, LoadingButton } from "@/components/ui/Button";

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    // One row at every width, scrolled sideways when it does not fit. Wrapping
    // was the alternative and cost ~44px of page height on a phone permanently,
    // to spare an occasional swipe — same trade as the script editor's toolbar.
    // Children are shrink-0 so they scroll instead of squashing.
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2.5 text-fg-2 md:justify-center md:gap-2 md:px-5 md:py-3 [&>*]:shrink-0">
      {children}
    </div>
  );
}

export function ToolbarButton({ className = "", ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      // GeckoUI's size="sm" sets its own padding, but Tailwind utilities sit in a
      // later layer than GeckoUI's component CSS, so the class below is what
      // actually decides it — it has to shrink with the size prop or the button
      // stays md-sized.
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold text-fg hover:bg-hover ${className}`}
      {...props}
    />
  );
}

export function ToolbarLoadingButton({ className = "", ...props }: React.ComponentProps<typeof LoadingButton>) {
  return (
    <LoadingButton
      variant="ghost"
      size="sm"
      // GeckoUI's size="sm" sets its own padding, but Tailwind utilities sit in a
      // later layer than GeckoUI's component CSS, so the class below is what
      // actually decides it — it has to shrink with the size prop or the button
      // stays md-sized.
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold text-fg hover:bg-hover ${className}`}
      {...props}
    />
  );
}

// Hidden below sm: a vertical rule between two items that wrapped onto
// separate lines sits sideways across the gap and reads as a stray mark.
export const toolbarSep = "mx-2.5 hidden h-5.5 w-px bg-line-2 sm:block";
