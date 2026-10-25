# Zero Radar

**Security flaws & leaks, the moment they surface.** → https://zeroradar.vercel.app

Zero Radar polls advisory databases, vendor bulletins, security mailing lists and community sources
every 5 minutes and turns every new critical bug, exploited flaw, malicious package and data breach
into a short briefing: when it was disclosed, when we picked it up, what is affected, why it is
dangerous, whether it is exploited in the wild, and whether a fix exists.

| Get it | How |
|---|---|
| Website | https://zeroradar.vercel.app |
| RSS | `/feed.xml` · `?view=exploited` · `?view=breaches` · `?view=all&eco=npm` |
| JSON API | `GET /api/advisories` · `POST /api/check` |
| MCP server | `claude mcp add --transport http zeroradar https://zeroradar.vercel.app/api/mcp` |
| Claude Code skill | `cp -r skill/zeroradar ~/.claude/skills/` → scans lockfiles and fixes what is affected |

## Sources

GitHub Advisory Database (reviewed + malware), NVD (CVSS ≥ 7), CISA KEV, FIRST EPSS, Have I Been Pwned,
vendor feeds (PHP, GitLab, Node.js, Chrome, MSRC, WordPress, Kubernetes, Debian, Ubuntu, Django, Python,
Rust, GitHub), oss-security, Full Disclosure, watchTowr, Socket, BleepingComputer, The Hacker News,
SecurityWeek, DataBreaches.net, r/netsec, Hacker News. Add one: `config/feeds.mjs`.

Zero Radar only aggregates issues that are already public. It never publishes undisclosed vulnerabilities.
Briefings are written by an AI model from the linked sources — verify before acting.

## How it works

```
cron (5 min) → pipeline/run.mjs
   sources/advisories.mjs   GHSA, NVD, KEV, EPSS, HIBP   → structured observations
   sources/signals.mjs      RSS/Atom feeds, Hacker News  → raw signals
   ai.mjs                   triage (relevant? which entry?) + briefing per entry (OpenRouter, ZDR)
   lib/store.mjs            merge by CVE/GHSA alias → var/store.json
   lib/publish.mjs          advisories.json + meta.json → orphan commit on branch `data`
Next.js site (Vercel) reads branch `data` with 60 s revalidation — no redeploy per update.
```

Run locally:

```bash
npm install
GITHUB_TOKEN=$(gh auth token) node pipeline/run.mjs --no-publish -v   # ZERORADAR_OPENROUTER_KEY in .env.local for AI briefings
ZR_LOCAL_DATA=1 npm run dev
npm test
```

`ops/server-watch.mjs` checks a server over SSH (dpkg, lockfiles, Docker base images, pending Debian
security updates) against the radar and reports via Telegram — matching happens locally, nothing is
patched automatically.

---

Built with [Synagy](https://synagy.org/?utm_source=zeroradar&utm_medium=readme) — the AI game studio.
MIT License.
