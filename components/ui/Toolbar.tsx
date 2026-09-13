import { Button, LoadingButton } from "@/components/ui/Button";

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center gap-2 border-b border-line px-5 py-3 text-fg-2">{children}</div>;
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

export const toolbarSep = "mx-2.5 h-5.5 w-px bg-line-2";
