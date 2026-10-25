# 0003 · Dauerdienst + Lese-Server statt Cron und Daten-Branch (löst 0001 ab)

**Entscheidung:** Die Pipeline läuft als Dauerdienst (`pipeline/daemon.mjs`, systemd-User-Dienst auf dem
Homeserver). Jede Quelle hat ihren eigenen Takt (GHSA 60 s, Feeds 2–10 min, bedingte Anfragen). Ergebnisse
landen als Dateien in `var/public/v1`, ein kleiner Lese-Server (127.0.0.1:8793) liefert sie aus, öffentlich
nur lesend über Tailscale Funnel (`/zeroradar`). Nach jeder Änderung ruft der Dienst `POST /api/revalidate`
der Seite auf (Geheimnis `ZR_REVALIDATE_SECRET`), die dann ihren Cache-Tag `zr` sofort verwirft.

**Warum:** Wunsch „immer sofort aktuell, keine Dauer-Commits wie bei ModelRadar“. Der Daten-Branch (0001)
erzeugte alle 5 min einen Force-Push und hing am 5-min-Takt des Crons.

**Alternativen:** Vercel Blob (Hobby: 2.000 Operationen/Monat, Überschreitung sperrt Blob 30 Tage für alle
Stores), Edge/Global Config (100 Schreibvorgänge/Monat), eigener VPS-Endpunkt (VPS-Daten nicht streuen),
weiter Daten-Branch (Commits, 5-min-Latenz).

**Folgen:** Seite hängt an der Erreichbarkeit des Homeservers; fällt er aus, liefert Vercel den letzten
Cache (Revalidierung scheitert → alte Daten bleiben). Index bleibt unter 2 MB (Next-Fetch-Cache-Grenze),
aktuell ≈ 0,95 MB roh / 130 KB gzip. Branch `data` und Cron entfallen. Port 8790 ist auf dem Homeserver
belegt, daher 8793.
