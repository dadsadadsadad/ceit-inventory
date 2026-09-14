import type { Metadata } from "next";
import Script from "next/script";

import { appearanceBootstrap } from "@/lib/appearance-bootstrap";
import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";
import "./polish.css";

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "CEIT equipment, room inventory, borrowing, and maintenance.",
};

// Shared page shell and appearance controls.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-accent="orange" suppressHydrationWarning>
      <body>
        {/* Restore saved colors before showing the page. */}
        <Script id="ceit-appearance-bootstrap" strategy="beforeInteractive">
          {appearanceBootstrap}
        </Script>
        {/* Keyboard shortcut to the page content. */}
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
        {/* Appearance controls shared by every page. */}
        <ThemeToggle />
      </body>
    </html>
  );
}
