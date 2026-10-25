# Fortschritt

Wer etwas ändert, trägt es **oben im Log** ein.

## Stand

Zero Radar: frischeste Sicherheitslücken & Leaks in Echtzeit – Website, RSS, MCP, Skill.
Öffentliches Repo legifx/zeroradar, Seite auf Vercel, Pipeline per Cron auf dem Homeserver (~/zeroradar),
Daten auf Branch `data` (ADR 0001), KI über OpenRouter ZDR (ADR 0002).

- Pipeline: `pipeline/run.mjs` (Quellen in `pipeline/sources/`, Feeds in `config/feeds.mjs`)
- Seite: Next.js 16 in `app/` (Feed, `/v/[id]`, `/integrate`, `/feed.xml`, `/api/advisories`, `/api/check`, `/api/mcp`)
- Skill: `skill/zeroradar/` (Lockfile-Scanner `scripts/scan.mjs`)
- Server-Wächter: `ops/server-watch.mjs`, Konfiguration außerhalb des Repos (`~/.config/zeroradar/server-watch.json`)

## Log

### 2026-10-25 · v0.1 gebaut
- Gemacht: Pipeline (GHSA, NVD, KEV, EPSS, HIBP, 22 Feeds, HN), KI-Triage + Briefings, Seite mit Feed/Detail/RSS/API/MCP,
  Skill mit Lockfile-Scanner, Server-Wächter für den VPS (Telegram, nur Vorschläge). Tests: `npm test`.
- Fund beim ersten Scan: Next.js ≤ 16.4.0 kritische RCE (GHSA-673q-mjm6-r5xr) → hier auf 16.4.3 angehoben.
- Homeserver: Klon ~/zeroradar, Stand var/store.json, Wächter-Konfiguration ~/.config/zeroradar/server-watch.json,
  Cron-Vorlage ops/crontab.txt (Pipeline */5, Wächter */15, Telegram über ~/.hermes NebInfo-Bot).
- Live seit 2026-10-25: https://zeroradar.vercel.app (Vercel-Projekt zeroradar, git-verknüpft; Token auf dem Server ~/.vercel-token). Cron aktiv.
- Offen: eigene Domain, Exa als Zusatzquelle, Cluster gleicher Vorfälle ohne CVE verbessern, OSV-Ökosysteme.

### 2026-10-25 · angelegt
- Gemacht: Projekt angelegt.
- Offen / nächster Schritt: Ziel und ersten Meilenstein festlegen.
