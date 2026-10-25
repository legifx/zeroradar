import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SYNAGY_URL } from "@/lib/data";
import { RadarLogo } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Zero Radar — security flaws & leaks the moment they surface", template: "%s · Zero Radar" },
  description:
    "Live radar for new vulnerabilities, exploited bugs, malicious packages and data breaches. Checked every 5 minutes. RSS, JSON API, MCP server and a Claude Code skill.",
  alternates: { types: { "application/rss+xml": `${SITE_URL}/feed.xml` } },
  openGraph: { siteName: "Zero Radar", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <RadarLogo />
              ZERO RADAR
            </Link>
            <nav className="nav">
              <Link href="/">Feed</Link>
              <Link href="/integrate">Integrate</Link>
              <a href="/feed.xml" className="hide-sm">RSS</a>
              <a href="https://github.com/legifx/zeroradar" className="hide-sm">GitHub</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="foot">
          <div className="wrap">
            <a className="synagy" href={SYNAGY_URL} target="_blank" rel="noopener">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M8 15c2.5 2 5.5 2 8 0M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>
                Built with <b>Synagy</b> — the AI game studio
              </span>
            </a>
            <span>
              Data: GitHub Advisory DB, NVD, CISA KEV, FIRST EPSS, Have I Been Pwned, vendor &amp; community feeds.
              Summaries are AI-generated; always verify with the linked sources.
            </span>
            <span className="right">
              <Link href="/integrate">API &amp; MCP</Link>
              <a href="https://github.com/legifx/zeroradar">Source</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
