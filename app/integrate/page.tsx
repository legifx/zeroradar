import type { Metadata } from "next";
import { SITE_URL } from "@/lib/data";

export const metadata: Metadata = {
  title: "Integrate: RSS, API, MCP & Claude Code skill",
  description: "Pipe Zero Radar into your feed reader, CI, coding agent or server monitoring.",
};

export default function Integrate() {
  return (
    <main className="wrap detail doc">
      <h1>Get threats where you work</h1>
      <p>
        Everything on the radar is available as RSS, JSON and a remote MCP server — so your feed reader, your CI or your
        coding agent hears about a new critical bug minutes after it is disclosed. No account, no key.
      </p>

      <h2>MCP server (Claude Code, Cursor, any MCP client)</h2>
      <p>
        Tools: <code>latest_threats</code>, <code>get_threat</code>, <code>check_packages</code>.
      </p>
      <pre>{`claude mcp add --transport http zeroradar ${SITE_URL}/api/mcp`}</pre>
      <p>Then just ask: “anything new on Zero Radar that affects this repo?”</p>

      <h2>Claude Code skill</h2>
      <p>Scans lockfiles (npm, pnpm, yarn, bun, composer, pip/poetry/uv, cargo, go, bundler), checks them against the radar and fixes what is affected.</p>
      <pre>{`git clone --depth 1 https://github.com/legifx/zeroradar /tmp/zeroradar
cp -r /tmp/zeroradar/skill/zeroradar ~/.claude/skills/`}</pre>
      <p>Or run the scanner directly, e.g. in CI (exit code 2 = findings):</p>
      <pre>{`node ~/.claude/skills/zeroradar/scripts/scan.mjs .
node ~/.claude/skills/zeroradar/scripts/scan.mjs --latest   # new top threats since last run`}</pre>

      <h2>RSS</h2>
      <pre>{`${SITE_URL}/feed.xml                      # top threats
${SITE_URL}/feed.xml?view=exploited       # exploited in the wild
${SITE_URL}/feed.xml?view=breaches        # data breaches & incidents
${SITE_URL}/feed.xml?view=all&eco=npm     # every npm vulnerability`}</pre>

      <h2>JSON API</h2>
      <pre>{`GET  ${SITE_URL}/api/advisories?view=top&since=2026-10-25T00:00:00Z&eco=pip&q=django&limit=50
POST ${SITE_URL}/api/check
     {"packages":[{"ecosystem":"npm","name":"next","version":"16.2.9"}]}`}</pre>
      <p>
        <code>view</code>: top · exploited · breaches · all · malware · everything. Only names and versions are sent to{" "}
        <code>/api/check</code>; nothing is stored.
      </p>

      <h2>How fast is it?</h2>
      <p>
        Sources are polled every 5 minutes; the site refreshes its data every minute. Every entry shows when it was
        disclosed and when Zero Radar picked it up. Zero Radar only reports issues that are already public — it never
        publishes undisclosed vulnerabilities.
      </p>
    </main>
  );
}
