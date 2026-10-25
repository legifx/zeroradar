# Zero Radar

**Security flaws & leaks, the moment they surface.** → https://zeroradar.vercel.app

Zero Radar watches advisory databases, vendor bulletins, CERTs, security researchers and the security
press continuously — each source on its own schedule, the fastest every minute — and turns every new
critical bug, exploited flaw, malicious package and data breach into a plain-language briefing: when it
was disclosed, when we picked it up, how the attack works (diagram), who is affected, whether it is
exploited in the wild, whether a fix exists, and how many independent sources back it. When a fix or
an exploitation report shows up later, the entry updates within seconds.

| Get it | How |
|---|---|
| Website | https://zeroradar.vercel.app |
| RSS | `/feed.xml` · `?view=exploited` · `?view=fixes` · `?view=unpatched` · `?view=breaches` · `?view=all&eco=npm` |
| JSON API | `GET /api/advisories` · `POST /api/check` |
| MCP server | `claude mcp add --transport http zeroradar https://zeroradar.vercel.app/api/mcp` |
| Claude Code skill | `cp -r skill/zeroradar ~/.claude/skills/` → scans lockfiles and fixes what is affected |

## Sources

GitHub Advisory Database, NVD, CISA KEV, OSV (late fixes), FIRST EPSS, Have I Been Pwned; vendors (PHP,
GitLab, Node.js, Chrome, MSRC, WordPress, Kubernetes, Django, Python, Rust, GitHub, Cisco, Fortinet,
Palo Alto, Jenkins, Debian, Ubuntu); CERTs (CISA, CERT-Bund, CERT-EU, NCSC UK); researchers
(oss-security, Full Disclosure, watchTowr, Socket, Wiz); press (BleepingComputer, The Hacker News,
SecurityWeek, The Record, Dark Reading, DataBreaches.net); community (r/netsec, Hacker News).
Every source has a trust level (official / research / press / community) and its own polling interval
in `config/feeds.mjs`. Entries show how many independent publishers back them; "exploited in the wild"
needs an official source. Full list: `/about`.

Zero Radar only aggregates issues that are already public. It never publishes undisclosed vulnerabilities.
Briefings are written by an AI model from the linked sources — verify before acting.

## How it works

```
pipeline/daemon.mjs  (systemd on a home server, ops/zeroradar.service)
   engine.mjs               15 s scheduler; every source polled on its own interval (ETag/304)
   sources/advisories.mjs   GHSA, NVD, KEV, OSV, EPSS, HIBP → structured observations
   sources/signals.mjs      RSS/Atom feeds, Hacker News     → signals with trust level
   ai.mjs                   triage, dedupe, briefing + attack diagram (OpenRouter, ZDR, daily budget)
   lib/store.mjs            merge by alias; sources, exploit claims, fix tracking, timeline
   lib/publish.mjs          var/public/v1/{index,packages,meta}.json + e/<id>.json (only changed files)
   read server              127.0.0.1:8793, public read-only via Tailscale Funnel
   on change                POST /api/revalidate → site drops its cache tag within seconds
Next.js site (Vercel) fetches from the read server (ZR_DATA_URL), cached until the next change.
No commits, no redeploys per update.
```

Run locally:

```bash
npm install
GITHUB_TOKEN=$(gh auth token) node pipeline/run.mjs -v   # one pass → var/public (AI needs ZERORADAR_OPENROUTER_KEY in .env.local)
node pipeline/daemon.mjs                                    # continuous mode + read server on :8793
ZR_LOCAL_DATA=1 npm run dev
npm test
```

`ops/server-watch.mjs` checks a server over SSH (dpkg, lockfiles, Docker base images, pending Debian
security updates) against the radar and reports via Telegram — matching happens locally, nothing is
patched automatically. The daemon starts it after data changes (at most every 10 minutes).

---

Built with [Synagy](https://synagy.org/?utm_source=zeroradar&utm_medium=readme) — the AI game studio.
MIT License.
