import type { Metadata } from "next";
import Script from "next/script";

import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEIT Inventory",
  description: "Inventory management dashboard for CEIT resources.",
};

const appearanceBootstrap = `try{const root=document.documentElement;const savedTheme=localStorage.getItem("ceit-theme");const theme=savedTheme==="light"||savedTheme==="dark"?savedTheme:"dark";const savedAccent=localStorage.getItem("ceit-accent");const legacy={violet:"#8b5cf6",blue:"#0ea5e9",emerald:"#10b981"};const savedKey=(savedAccent||"").toLowerCase();const accent=/^#[\\da-f]{6}$/i.test(savedAccent||"")?savedAccent.toLowerCase():legacy[savedKey]||null;const dark="#000000";const light="#ffffff";const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);const rgb=color=>[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];const hex=value=>clamp(Math.round(value),0,255).toString(16).padStart(2,"0");const mix=(fromColor,toColor,toAmount)=>{const from=rgb(fromColor);const to=rgb(toColor);const amount=clamp(toAmount,0,1);return "#"+from.map((channel,index)=>hex(channel+(to[index]-channel)*amount)).join("")};const luminance=color=>{const channels=rgb(color).map(channel=>{const normalized=channel/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4});return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]};const contrast=(first,second)=>{const firstLum=luminance(first);const secondLum=luminance(second);return (Math.max(firstLum,secondLum)+.05)/(Math.min(firstLum,secondLum)+.05)};const ensure=(color,background,direction,minimum=4.7)=>{if(contrast(color,background)>=minimum)return color;let low=0;let high=1;let result=direction;for(let iteration=0;iteration<16;iteration+=1){const amount=(low+high)/2;const candidate=mix(color,direction,amount);if(contrast(candidate,background)>=minimum){result=candidate;high=amount}else{low=amount}}return result};root.dataset.theme=theme;if(accent){const textSurface=theme==="light"?"#f0dfce":"#2a201b";const linkDirection=theme==="light"?dark:light;const link=ensure(accent,textSurface,linkDirection);const linkHover=mix(link,linkDirection,.14);const strong=ensure(accent,light,dark);const sidebar=ensure(accent,light,dark);const accentText=contrast(link,dark)>=contrast(link,light)?dark:light;root.dataset.accent="custom";root.style.setProperty("--accent",link);root.style.setProperty("--accent-hover",linkHover);root.style.setProperty("--accent-soft","color-mix(in srgb, "+link+" "+(theme==="light"?12:17)+"%, transparent)");root.style.setProperty("--accent-strong",strong);root.style.setProperty("--accent-strong-hover",mix(strong,dark,.16));root.style.setProperty("--accent-text",accentText);root.style.setProperty("--accent-on-strong",light);root.style.setProperty("--border-strong","color-mix(in srgb, "+link+" "+(theme==="light"?46:53)+"%, transparent)");root.style.setProperty("--sidebar",sidebar);root.style.setProperty("--sidebar-deep",mix(sidebar,dark,.38))}else{root.dataset.accent="orange";["--accent","--accent-hover","--accent-soft","--accent-strong","--accent-strong-hover","--accent-text","--accent-on-strong","--border-strong","--sidebar","--sidebar-deep"].forEach(property=>root.style.removeProperty(property))}}catch{}`;

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
