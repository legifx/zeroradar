import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible } from "next/font/google";
import { SITE_URL, SYNAGY_URL } from "@/lib/data";
import { RadarLogo } from "@/components/ui";
import "./globals.css";

// Atkinson Hyperlegible: vom Braille Institute für Lesbarkeit entworfen; Mono nur für IDs (Systemschrift)
const sans = Atkinson_Hyperlegible({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Zero Radar: new security flaws, exploits and leaks", template: "%s · Zero Radar" },
  description:
    "Live feed of new vulnerabilities, exploited bugs, malicious packages and data breaches. Plain words, how the attack works, whether it is exploited, whether a fix exists. RSS, API, MCP and a Claude Code skill.",
  alternates: { types: { "application/rss+xml": `${SITE_URL}/feed.xml` } },
  openGraph: { siteName: "Zero Radar", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffd21f" },
    { media: "(prefers-color-scheme: dark)", color: "#ffd21f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <RadarLogo />
              Zero Radar
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/" className="hide-xs">
                Feed
              </Link>
              <Link href="/about">About</Link>
              <Link href="/integrate">API &amp; MCP</Link>
              <a href="/feed.xml" className="hide-sm">
                RSS
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="foot">
          <div className="wrap">
            <p>
              Summaries and attack diagrams are written by an AI model from the linked sources and can be wrong. Check the
              vendor advisory before changing production systems.
            </p>
            <nav>
              <Link href="/about">Sources and method</Link>
              <Link href="/integrate">RSS, API, MCP, skill</Link>
              <a href="https://github.com/legifx/zeroradar">Source code</a>
              <a className="synagy" href={SYNAGY_URL} target="_blank" rel="noopener">
                Built with <b>Synagy</b>
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
