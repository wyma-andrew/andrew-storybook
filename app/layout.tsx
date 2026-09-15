import type { Metadata } from "next";
import { GeckoUIPortal } from "@geckoui/geckoui";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Storybook",
  description: "Script to storyboard, with a consistent cast and world.",
};

// `unstyled` drops sonner's own background and border so the palette below is
// the only thing painting a toast. Sonner's built-in `richColors` was the
// alternative and is deliberately not used: it hardcodes its own green/red/amber
// and would be wrong in one of the two themes — see history/theming.md. Every
// colour here is a token defined in BOTH palettes.
const TOAST_BASE =
  "flex w-full items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] shadow-[0_12px_30px_rgba(0,0,0,.28)]";

const TOAST_STYLE = {
  toastOptions: {
    unstyled: true,
    classNames: {
      toast: `${TOAST_BASE} border-line bg-panel-2 text-fg`,
      success: `${TOAST_BASE} border-matched-border bg-matched-bg text-matched`,
      error: `${TOAST_BASE} border-danger-border bg-danger-bg text-danger`,
      warning: `${TOAST_BASE} border-isnew-border bg-isnew-bg text-isnew`,
      info: `${TOAST_BASE} border-style-badge-border bg-style-badge-bg text-style-badge`,
      description: "text-fg-2",
      icon: "mt-px shrink-0",
    },
  },
} as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Server renders the default; the inline script below corrects it before
    // paint for anyone who chose otherwise.
    <html lang="en" className={`h-full antialiased ${DEFAULT_THEME}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full">
        {children}
        {/* One place sets toast position and colour for the whole app. GeckoUI's
            toasts are sonner underneath, which offers no true middle-centre —
            top-centre is the centre option that works here, because the
            storyboard's place marker now occupies the bottom edge and a
            bottom-centre toast would land on top of it. */}
        <GeckoUIPortal toastOptions={{ position: "top-center", duration: 3000, ...TOAST_STYLE }} />
      </body>
    </html>
  );
}
