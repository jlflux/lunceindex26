import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/ThemeToggle";

/**
 * Self-hosted at build time by next/font — no runtime request to Google, and
 * nothing for a content-security policy to block.
 *
 * This sets `--font-sans`. An earlier version referenced that variable without
 * ever defining it, which makes the whole `font-family` declaration invalid at
 * computed-value time, so every browser silently fell back to its default
 * serif. Keep the definition and the reference together.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ALPreps Index — AHSAA Football Power Ratings",
    template: "%s · ALPreps Index",
  },
  description:
    "Composite power ratings and RPI for every AHSAA high school football team.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
