---
name: zeroradar
description: Check a project or server against Zero Radar, a live feed of new critical vulnerabilities, exploited bugs, malicious packages and data breaches (updated every 5 minutes), and fix what is affected. Use when the user asks "are we affected", "check for new vulnerabilities/CVEs", "security check", "zeroradar", after news of a big vulnerability (e.g. a PHP, GitLab or Node.js flaw), before a deploy or release, or at the start of work on a project that has not been checked today.
---

# Zero Radar

Zero Radar (https://zeroradar.vercel.app) collects new security threats from GitHub Advisory DB, NVD,
CISA KEV, vendor bulletins, security mailing lists and community sources, every 5 minutes.
It tracks only *recent* threats, so it complements, not replaces, a full audit (`npm audit`, `osv-scanner`).

## 1. Scan the project's dependencies

```bash
node ~/.claude/skills/zeroradar/scripts/scan.mjs <project-dir>
```

Parses package-lock/pnpm/yarn/bun, composer.lock, poetry/uv/Pipfile.lock, requirements*.txt,
Cargo.lock, go.sum and Gemfile.lock, and posts only package names + versions to the Zero Radar API.
Exit code 2 = findings. Add `--json` for machine-readable output.

## 2. Check runtimes and servers

Lockfiles miss runtimes and server software. Run `--latest` to see current top threats, then
compare the products named there with what the project actually uses:

```bash
node ~/.claude/skills/zeroradar/scripts/scan.mjs --latest
php -v; node -v; python3 --version; nginx -v; openssl version   # whatever exists
```

Also look at Dockerfiles / compose files for base image versions (php:8.4-fpm, node:22, gitlab/gitlab-ce:…).

## 3. Fix

For every confirmed finding:

1. **Malicious package** → remove it immediately, check how it got in (typo? compromised maintainer?),
   rotate any secrets the install could have read (CI tokens, .env), tell the user.
2. **Vulnerability with a fix** → bump to at least the fixed version (prefer the newest patch release of the
   same major), regenerate the lockfile, run the tests.
3. **No fix yet** → apply the mitigation from the briefing (`/v/<id>` page) and tell the user.

Prioritise: exploited in the wild > critical > high. Never change production servers without the user's
explicit OK; on servers propose the exact commands instead.

## 4. Report

Short table: package · version → fixed version · threat id · exploited? · what you did.
Link each threat as `https://zeroradar.vercel.app/v/<id>`.

## MCP alternative

The same data is available as a remote MCP server (tools `latest_threats`, `get_threat`, `check_packages`):

```bash
claude mcp add --transport http zeroradar https://zeroradar.vercel.app/api/mcp
```
