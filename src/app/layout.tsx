import type { Metadata } from "next";
import Script from "next/script";

import { CommandMenu } from "./components/command-menu";
import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "Inventory management dashboard for CEIT resources.",
};

const appearanceBootstrap = `try{const root=document.documentElement;const theme=localStorage.getItem("ceit-theme");const accent=localStorage.getItem("ceit-accent");root.dataset.theme=theme==="light"||theme==="dark"?theme:"dark";root.dataset.accent=accent==="orange"||accent==="violet"||accent==="blue"||accent==="emerald"?accent:"orange"}catch{}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-accent="orange" suppressHydrationWarning>
      <body>
        <Script id="ceit-appearance-bootstrap" strategy="beforeInteractive">{appearanceBootstrap}</Script>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div id="main-content">{children}</div>
        <CommandMenu />
        <ThemeToggle />
      </body>
    </html>
  );
}
