import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";

import { appearanceBootstrap } from "@/lib/appearance-bootstrap";
import { NavigationFeedback } from "./components/navigation-feedback";
import { GlobalAppearance } from "./components/theme-toggle";
import { OptimisticProvider } from "./components/optimistic-state";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/views.css";

// Manrope for the interface, Fraunces for titles and numbers, IBM Plex Mono for asset tags.
const workspaceFont = localFont({
  src: "./fonts/manrope-latin-variable.woff2",
  variable: "--font-workspace",
  weight: "400 800",
  display: "swap",
});

const displayFont = localFont({
  src: "./fonts/fraunces-latin-standard-normal.woff2",
  style: "normal",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});

const tagFont = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
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
      className={`${workspaceFont.variable} ${displayFont.variable} ${tagFont.variable}`}
      data-theme="light"
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
        {/* Instant cue when a link to another page is pressed. */}
        <NavigationFeedback />
        {/* Appearance controls shared by every page. */}
        <GlobalAppearance />
      </body>
    </html>
  );
}
