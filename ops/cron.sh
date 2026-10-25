#!/bin/bash
# Cron-Einstieg auf dem Homeserver. flock verhindert überlappende Läufe.
#   */5 * * * * /home/server/zeroradar/ops/cron.sh pipeline
#   */15 * * * * /home/server/zeroradar/ops/cron.sh watch
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p var
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"

case "${1:-pipeline}" in
  pipeline)
    git pull -q --ff-only origin main 2>>var/cron.err || true
    exec flock -n var/pipeline.lock timeout 600 node pipeline/run.mjs >/dev/null 2>>var/cron.err
    ;;
  watch)
    exec flock -n var/watch.lock timeout 300 node ops/server-watch.mjs >>var/watch.log 2>&1
    ;;
esac
