#!/bin/bash
# Start des Dauerdienstes (systemd, siehe ops/zeroradar.service). GitHub-Token aus gh, Rest aus .env.local.
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
exec node pipeline/daemon.mjs
