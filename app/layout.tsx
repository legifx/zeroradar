import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { SITE_URL, SYNAGY_URL } from "@/lib/data";
import { RadarLogo } from "@/components/ui";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", weight: ["600"], display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Zero Radar — new security flaws and leaks, explained", template: "%s · Zero Radar" },
  description:
    "Live feed of new vulnerabilities, exploited bugs, malicious packages and data breaches — in plain words, with how the attack works, whether it is exploited and whether a fix exists. RSS, API, MCP and a Claude Code skill.",
  alternates: { types: { "application/rss+xml": `${SITE_URL}/feed.xml` } },
  openGraph: { siteName: "Zero Radar", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#18191d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <RadarLogo />
              Zero Radar
              <small>security news, explained</small>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/" className="hide-xs">
                Feed
              </Link>
              <Link href="/about">How it works</Link>
              <Link href="/integrate">Integrate</Link>
              <a href="/feed.xml" className="hide-sm">
                RSS
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="foot">
          <div className="wrap">
            <a className="synagy" href={SYNAGY_URL} target="_blank" rel="noopener">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M8 15c2.5 2 5.5 2 8 0M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              <span>
                Built with <b>Synagy</b>
              </span>
            </a>
            <nav>
              <Link href="/about">Sources &amp; method</Link>
              <Link href="/integrate">RSS · API · MCP · Skill</Link>
              <a href="https://github.com/legifx/zeroradar">Source code</a>
            </nav>
            <span>
              Explanations are written by an AI model from the linked sources and can contain mistakes. Check the official
              advisory before you act.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
