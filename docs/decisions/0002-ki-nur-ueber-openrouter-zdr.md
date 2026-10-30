# 0002 · KI-Briefings über OpenRouter mit Zero Data Retention

**Entscheidung:** Triage und Briefings laufen über OpenRouter (`provider.zdr=true`, `data_collection=deny`),
Standardmodell `anthropic/claude-haiku-5.5` (0,10/0,50 USD pro Mio. Tokens), überschreibbar per `ZERORADAR_MODEL`.
Key: `ZERORADAR_OPENROUTER_KEY` (derselbe private Key wie ModelRadar, legi 2026-10-25).
Prompts erlauben nur Fakten aus dem Material; Unbekanntes bleibt `null`/`unknown`.

**Server-Wächter** schickt keine Server-Daten an Dritte: Feed wird geladen und lokal abgeglichen,
Meldung nur per eigenem Telegram-Bot. Kein automatisches Patchen (legi: „Melden + Fix vorschlagen“).

**Nachtrag 2026-10-31 · Modell bleibt Haiku 5.5.** Vergleich an 4 echten Einträgen + 5 Triage-Meldungen + Dedupe
(gleiche Prompts, ZDR): Haiku 0,0055 USD, DeepSeek V4 Flash 0,0072 (teurer, Denk-Tokens), Nemotron 3.5 Lightning
0,0056 (falsche `match_id`), Gemma 4 26B 0,0019 (erfindet „exploitation reported“, Dedupe-Timeout), gpt-oss-120b
nur mit Pflicht-Reasoning und verschmilzt verschiedene CVEs. Für einen Sicherheitsfeed zählt „nichts erfinden“
mehr als ein Drittel der Kosten. Gespart wird über die Menge (Neubewertung gedrosselt, Dedupe 30 min, Deckel 0,20 USD).
Nicht über das Claude-Abo: ein öffentlicher 24/7-Dienst ist keine persönliche Claude-Code-Nutzung, er würde legis
Nutzungslimits mitverbrauchen und bei erreichtem Limit stehen bleiben.
