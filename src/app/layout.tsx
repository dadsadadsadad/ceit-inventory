import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";

import { appearanceBootstrap } from "@/lib/appearance-bootstrap";
import { GlobalAppearance } from "./components/theme-toggle";
import { OptimisticProvider } from "./components/optimistic-state";
import "./globals.css";
import "./polish.css";

const workspaceFont = localFont({
  src: "./fonts/manrope-latin-variable.woff2",
  variable: "--font-workspace",
  weight: "400 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "CEIT equipment, room inventory, borrowing, and maintenance.",
};

// Shared page shell and appearance controls.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={workspaceFont.variable}
      data-theme="dark"
      data-accent="orange"
      suppressHydrationWarning
    >
      <body>
        {/* Restore saved colors before showing the page. */}
        <Script id="ceit-appearance-bootstrap" strategy="beforeInteractive">
          {appearanceBootstrap}
        </Script>
        {/* Keyboard shortcut to the page content. */}
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <OptimisticProvider>
          <div id="main-content">{children}</div>
        </OptimisticProvider>
        {/* Appearance controls shared by every page. */}
        <GlobalAppearance />
      </body>
    </html>
  );
}
