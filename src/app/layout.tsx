import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "CEIT Inventory",
    description: "Inventory management dashboard for CEIT resources.",
};

// Root wrapper shared by every page in the app.
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
            <body>
                {children}
                {/* Global dark/light mode button. */}
                <ThemeToggle />
            </body>
        </html>
    );
}
