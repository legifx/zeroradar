# 0002 · KI-Briefings über OpenRouter mit Zero Data Retention

**Entscheidung:** Triage und Briefings laufen über OpenRouter (`provider.zdr=true`, `data_collection=deny`),
Standardmodell `anthropic/claude-haiku-5.5` (0,10/0,50 USD pro Mio. Tokens), überschreibbar per `ZERORADAR_MODEL`.
Key: `ZERORADAR_OPENROUTER_KEY` (derselbe private Key wie ModelRadar, legi 2026-10-25).
Prompts erlauben nur Fakten aus dem Material; Unbekanntes bleibt `null`/`unknown`.

**Server-Wächter** schickt keine Server-Daten an Dritte: Feed wird geladen und lokal abgeglichen,
Meldung nur per eigenem Telegram-Bot. Kein automatisches Patchen (legi: „Melden + Fix vorschlagen“).
