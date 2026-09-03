import type { Metadata } from "next";
import { GeckoUIPortal } from "@geckoui/geckoui";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Storybook",
  description: "Script to storyboard, with a consistent cast and world.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        {children}
        <GeckoUIPortal />
      </body>
    </html>
  );
}
