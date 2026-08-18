import type { Metadata } from "next";
import Script from "next/script";

import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "Inventory management dashboard for CEIT resources.",
};

const themeBootstrap = `try{const theme=localStorage.getItem("ceit-theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme}catch{}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="ceit-theme-bootstrap" strategy="beforeInteractive">{themeBootstrap}</Script>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div id="main-content">{children}</div>
        <ThemeToggle />
      </body>
    </html>
  );
}
