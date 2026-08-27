import type { Metadata } from "next";
import Script from "next/script";

import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "Inventory management dashboard for CEIT resources.",
};

const appearanceBootstrap = `try{const root=document.documentElement;const savedTheme=localStorage.getItem("ceit-theme");const theme=savedTheme==="light"||savedTheme==="dark"?savedTheme:"dark";const savedAccent=localStorage.getItem("ceit-accent");const legacy={violet:"#8b5cf6",blue:"#0ea5e9",emerald:"#10b981"};const accent=/^#[\\da-f]{6}$/i.test(savedAccent||"")?savedAccent.toLowerCase():legacy[savedAccent||""]||null;root.dataset.theme=theme;if(accent){const light=theme==="light";const mix=(percentage,withColor)=>"color-mix(in srgb, "+accent+" "+percentage+"%, "+withColor+")";const red=parseInt(accent.slice(1,3),16);const green=parseInt(accent.slice(3,5),16);const blue=parseInt(accent.slice(5,7),16);root.dataset.accent="custom";root.style.setProperty("--accent",accent);root.style.setProperty("--accent-hover",mix(light?78:64,light?"black":"white"));root.style.setProperty("--accent-soft",mix(light?12:17,"transparent"));root.style.setProperty("--accent-strong",mix(light?79:74,"black"));root.style.setProperty("--accent-text",(red*299+green*587+blue*114)/1000>=145?"#201006":"#fffaf3");root.style.setProperty("--border-strong",mix(light?43:53,"transparent"));root.style.setProperty("--sidebar",mix(light?83:76,light?"#5b1a08":"#2f0c04"));root.style.setProperty("--sidebar-deep",mix(light?58:56,light?"#200704":"#080405"))}else{root.dataset.accent="orange"}}catch{}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-accent="orange" suppressHydrationWarning>
      <body>
        <Script id="ceit-appearance-bootstrap" strategy="beforeInteractive">{appearanceBootstrap}</Script>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div id="main-content">{children}</div>
        <ThemeToggle />
      </body>
    </html>
  );
}
