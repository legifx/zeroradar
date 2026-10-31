# 0004 · KI über das Claude-Abo (Claude Code headless), OpenRouter nur als Ausweichweg

**Entscheidung (legi, 2026-10-31):** Triage, Briefings und Dedupe laufen über `claude -p` mit legis Claude-Abo,
Modell `claude-haiku-5-5`. Aufruf ohne Einstellungen, Tools, MCP, Slash-Befehle und Sitzungsspeicher, in einem
leeren Ordner (`/tmp/zeroradar-claude`, keine CLAUDE.md), `MAX_THINKING_TOKENS=0` außer bei Dedupe, `ANTHROPIC_API_KEY`
wird entfernt. Overhead je Aufruf ~570 Tokens, ~3–10 s. `--bare` geht nicht (liest kein OAuth).

**Ausweichweg:** Scheitert ein Aufruf (Limit, Login abgelaufen), pausiert Claude 15 min und OpenRouter (ADR 0002)
springt ein, gedeckelt mit `ZR_LLM_DAILY_USD` (0,20 USD echtes Geld). Abo-Verbrauch als API-Gegenwert in
`store.llm.abo`, Deckel `ZR_ABO_DAILY_USD` (1). Zurück auf OpenRouter: `ZERORADAR_LLM=openrouter`.

**Grenzen:** ein `claude`-Prozess braucht ~580 MB RAM → `ZR_CLAUDE_PARALLEL=1`. Temperatur nicht einstellbar.
Verbraucht legis Abo-Limits mit (gering, einige hundert kleine Haiku-Aufrufe am Tag). Ein öffentlicher Dienst über
das Abo ist nicht die übliche persönliche Nutzung; legi hat das bewusst so entschieden.

**Geprüft:** gleiche 4 Einträge + 5 Triage-Meldungen wie beim Modellvergleich, Ergebnis deckungsgleich mit Haiku über OpenRouter.
