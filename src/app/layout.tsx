import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";

import { appearanceBootstrap } from "@/lib/appearance-bootstrap";
import { NavigationFeedback } from "./components/navigation-feedback";
import { GlobalAppearance } from "./components/theme-toggle";
import { OptimisticProvider } from "./components/optimistic-state";
import "./styles/tokens.css";
import "./styles/preferences.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/views.css";

// manrope for ui, fraunces for titles, plex mono for tags
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
  description: "CEIT equipment inventory",
};

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
        {/* apply saved theme before paint */}
        <Script id="ceit-appearance-bootstrap" strategy="beforeInteractive">
          {appearanceBootstrap}
        </Script>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <OptimisticProvider>
          <div id="main-content">{children}</div>
        </OptimisticProvider>
        <NavigationFeedback />
        <GlobalAppearance />
      </body>
    </html>
  );
}
