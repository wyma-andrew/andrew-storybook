import type { Metadata } from "next";
import { GeckoUIPortal } from "@geckoui/geckoui";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Storybook",
  description: "Script to storyboard, with a consistent cast and world.",
};

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
        <GeckoUIPortal />
      </body>
    </html>
  );
}
