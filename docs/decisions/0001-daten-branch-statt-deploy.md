# 0001 · Daten über Branch `data` statt Vercel-Deploy pro Update

**Entscheidung:** Die Pipeline (Homeserver-Cron, alle 5 min) pusht `advisories.json` + `meta.json` als
Einzel-Commit ohne Historie (force) auf den Branch `data`. Die Seite holt alle 30 s den Commit-SHA per
`github.com/<repo>.git/info/refs` (ungecacht, kein Token, kein API-Limit) und lädt die Dateien über die
unveränderliche raw-URL dieses Commits. Der Branch-raw-Pfad allein ist bis 5 min alt (CDN, auch mit Query-Parameter).

**Alternativen:** (a) Daten nach `main` + Vercel-Deploy pro Update wie ModelRadar: bis zu 288 Deploys/Tag,
Hobby-Limit 100/Tag, 1–2 min Build-Latenz. (b) Vercel Blob/Edge Config: zusätzliche Abhängigkeit + Token.

**Folgen:** Kein Repo-Wachstum, Latenz ≈ Pollintervall + 1 min. `vercel.json` schaltet Deploys für `data` ab.
Next cached fetch-Antworten nur bis 2 MB → die Pipeline hält `advisories.json` unter 1,8 MB.
