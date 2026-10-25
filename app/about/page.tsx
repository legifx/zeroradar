import type { Metadata } from "next";
import Link from "next/link";
import { FEEDS, type Trust } from "@/config/feeds.mjs";

export const metadata: Metadata = {
  title: "How it works: sources, checks and trust",
  description: "Which sources Zero Radar watches, how often, how it rates trust and how fixes are tracked.",
};

// Strukturierte Quellen mit ihrem Takt (siehe pipeline/engine.mjs)
const STRUCTURED: { name: string; trust: Trust; every: number; what: string }[] = [
  { name: "GitHub Advisory Database", trust: "official", every: 60, what: "reviewed advisories with affected and fixed package versions" },
  { name: "NVD (NIST)", trust: "official", every: 300, what: "every new CVE, CVSS scores, patch links" },
  { name: "CISA KEV", trust: "official", every: 300, what: "official list of flaws known to be exploited" },
  { name: "OSV", trust: "official", every: 900, what: "fixed versions that appear after the first report" },
  { name: "FIRST EPSS", trust: "official", every: 21600, what: "probability of exploitation in the next 30 days" },
  { name: "Have I Been Pwned", trust: "official", every: 1800, what: "verified data breaches" },
  { name: "Hacker News", trust: "community", every: 180, what: "early signals, only with 25+ points" },
];

const TRUST_TEXT: Record<Trust, [string, string]> = {
  official: ["Official", "Vendors, government CERTs and advisory databases. Their word on exploitation and fixes counts as confirmed."],
  research: ["Researchers", "Security research teams and disclosure mailing lists. Often first, usually right."],
  press: ["Press", "Established security newsrooms. Good for context, counted as a report — not as confirmation."],
  community: ["Community", "Discussion sites. Used as an early hint only; never enough on its own to say “exploited”."],
};

const every = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

export default function About() {
  const feeds = [...FEEDS].sort((a, b) => a.every - b.every);
  return (
    <main className="wrap doc">
      <h1>How Zero Radar works</h1>
      <p>
        Zero Radar collects new security flaws, attacks and leaks from {STRUCTURED.length + FEEDS.length} sources, merges
        reports about the same issue into one entry and explains it in plain words. It runs continuously: each source is
        checked on its own schedule, and the site updates within seconds of new information.
      </p>

      <h2>From first report to entry</h2>
      <ol>
        <li>
          <b>Watch.</b> Every source is polled on its own interval — the fastest every minute. Unchanged feeds cost almost
          nothing, so we can ask often.
        </li>
        <li>
          <b>Merge.</b> Reports that name the same CVE are joined. Reports without a CVE are compared by an AI model and
          merged when they describe the same incident — two different CVEs are never merged.
        </li>
        <li>
          <b>Explain.</b> For important entries an AI model writes the plain-language text, the attack diagram and the
          steps, using only the collected sources. Versions, dates and exploitation come from the sources themselves.
        </li>
        <li>
          <b>Keep watching.</b> Entries stay open for 30 days. When a source reports attacks or a patched version later, the
          entry changes right away and the timeline shows when.
        </li>
      </ol>

      <h2>How sure is an entry?</h2>
      <p>No report is thrown away, but each one is labelled by how well it is backed:</p>
      <table>
        <tbody>
          <tr>
            <td><b>Official source</b></td>
            <td>At least one vendor, CERT or advisory database reports it.</td>
          </tr>
          <tr>
            <td><b>Several sources</b></td>
            <td>Two or more independent publishers report it. Overlap makes false alarms unlikely.</td>
          </tr>
          <tr>
            <td><b>Single report</b></td>
            <td>One researcher or newsroom so far. Probably real, but details may change.</td>
          </tr>
          <tr>
            <td><b>Unverified</b></td>
            <td>Only community posts. Shown so you hear early, ranked lower until someone confirms it.</td>
          </tr>
        </tbody>
      </table>
      <p>
        “Exploited in the wild” needs an official source such as CISA KEV or the vendor. If only researchers or the press
        report attacks, the entry says “attacks reported”.
      </p>

      <h2>Trust levels</h2>
      <table>
        <tbody>
          {(Object.keys(TRUST_TEXT) as Trust[]).map((t) => (
            <tr key={t}>
              <td><b>{TRUST_TEXT[t][0]}</b></td>
              <td>{TRUST_TEXT[t][1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Databases</h2>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>What it adds</th>
              <th>Checked every</th>
            </tr>
          </thead>
          <tbody>
            {STRUCTURED.map((s) => (
              <tr key={s.name}>
                <td><b>{s.name}</b></td>
                <td>{s.what}</td>
                <td>{every(s.every)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Feeds</h2>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Trust</th>
              <th>Checked every</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((f) => (
              <tr key={f.id}>
                <td>
                  <a href={f.url} rel="noopener nofollow">{f.name}</a>
                </td>
                <td>{TRUST_TEXT[f.trust][0]}</td>
                <td>{every(f.every)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What Zero Radar does not do</h2>
      <ul>
        <li>It only reports issues that are already public. It never publishes undisclosed vulnerabilities or exploit code.</li>
        <li>AI text can be wrong. Every entry links its sources — check the official advisory before you change production systems.</li>
        <li>Entries older than about 30 days drop off. For history use NVD or the GitHub Advisory Database.</li>
      </ul>
      <p>
        Code and pipeline are open source on <a href="https://github.com/legifx/zeroradar">GitHub</a>. To get entries in
        your tools, see <Link href="/integrate">Integrate</Link>.
      </p>
    </main>
  );
}
