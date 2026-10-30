# Fortschritt

Wer etwas ändert, trägt es **oben im Log** ein.

## Stand

Zero Radar: frischeste Sicherheitslücken & Leaks in Echtzeit – Website, RSS, MCP, Skill.
Öffentliches Repo legifx/zeroradar, Seite auf Vercel. Pipeline als Dauerdienst auf dem Homeserver
(~/zeroradar, systemd-User-Dienst `zeroradar`, Lese-Server 127.0.0.1:8793, öffentlich über Tailscale Funnel
`/zeroradar`), meldet Änderungen per `/api/revalidate` (ADR 0003). KI über OpenRouter ZDR (ADR 0002).

- Pipeline: `pipeline/daemon.mjs` → `engine.mjs` (Takt je Quelle), Quellen in `pipeline/sources/`, Feeds + Vertrauen in `config/feeds.mjs`
- Seite: Next.js 16 in `app/` (Feed, `/v/[id]`, `/about`, `/integrate`, `/feed.xml`, `/api/advisories|check|mcp|meta|revalidate`)
- Daten für die Seite: `lib/data.ts` (`ZR_DATA_URL`, lokal `ZR_LOCAL_DATA=1` → `var/public/v1`)
- Skill: `skill/zeroradar/` (Lockfile-Scanner `scripts/scan.mjs`)
- Server-Wächter: `ops/server-watch.mjs`, vom Dienst nach Änderungen gestartet; Konfiguration `~/.config/zeroradar/server-watch.json`

## Log

### 2026-10-25 · Bulletin-Optik + Bio-Seite
- legi: Farben/Schriften wirkten weiter KI-generiert. Neu: gelbe Warnleiste, weißes Papier, eine Schrift
  (Atkinson Hyperlegible, Braille Institute), echte Linkfarben (blau/lila besucht), Schweregrad ausgeschrieben
  im gefüllten Feld, Überschriften im Satzbau, Urteil als Tabelle. Keine Mono-Großbuchstaben mehr.
- Zero Radar steht auf der Bio-Seite (bio-legifx.vercel.app, Platz 2 nach Synagy): Blob-Stand + data/defaults.ts im Repo legifx/bio.

### 2026-10-31 · KI-Kosten halbiert, Modell bleibt Haiku
- legi: bis 0,25 USD/Tag über OpenRouter zu viel. Ursache war die Menge, nicht das Modell: 30.10. = 0,19 USD für
  179 Bewertungen (nur 78 Einträge neu, der Rest Neubewertungen wegen jeder neuen Quelle), Triage und Dedupe alle 2 min.
- Neu: Neubewertung nur sofort, wenn sich Ausnutzung/Pakete/Fixes ändern; neue Quellen allein frühestens 6 h nach
  der letzten Bewertung (`ai.at`, `ai.state`). Dedupe höchstens alle 30 min. Tagesdeckel 2 → 0,20 USD.
- Kosten je Schritt in `store.llm.by` (triage/enrich/dedupe), Tageszeile `KI-Kosten …` im pipeline.log.
- Modellvergleich an echten Einträgen in ADR 0002 (Nachtrag): billigere Modelle sind teurer oder erfinden Fakten.

### 2026-10-25 · Design ohne KI-Optik
- legi: "weniger AI Slop". Kopfbereich, Kacheln, Seitenleiste und Pillen-Chips entfernt; Feed als Ticker
  (UTC-Zeit, Kürzel CRIT/HIGH/LEAK, Haarlinien), Status als Text (▲ exploited, ✓ fixed), IBM Plex statt
  Serif+Inter, Ablauf als Textzeile mit Symbolen, Abschnittsköpfe in Mono. Texte ohne Gedankenstriche.
- Datenlader: ein Wiederholversuch (Kaltstart über Funnel), Meta alle 30 s.

### 2026-10-25 · v0.2 Dauerdienst + Redesign
- Pipeline läuft dauerhaft statt Cron: jede Quelle im eigenen Takt (GHSA 60 s … EPSS 6 h), bedingte Anfragen,
  KI-Tagesbudget. Keine Commits mehr, Branch `data` und Cron entfallen (ADR 0003).
- Vertrauensstufen je Quelle (official/research/press/community), Bestätigung über mehrere Herausgeber,
  "exploited" nur mit offizieller Quelle; Fix-Nachverfolgung (OSV/GHSA, `fix_available` in der Zeitleiste).
- KI schreibt zusätzlich Ablaufbild (`flow`), "wer ist betroffen", Schritte. Ablaufbild in jeder Top-Karte.
- Redesign der Seite: redaktionell ruhig, hell/dunkel, responsiv (Handy geprüft per Headless-Screenshot);
  Kacheln, Ansichten "Being exploited / No fix known / New fixes", Detailseite mit Urteil, Diagramm,
  Betroffenheit, Zeitleiste, Quellen nach Vertrauen; `/about` aus `config/feeds.mjs` erzeugt.
- RSS `?view=fixes` (eigene guid pro Fix), MCP/API auf neues Format.
- Port 8790 auf dem Homeserver belegt → 8793.

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
