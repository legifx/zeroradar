#!/usr/bin/env node
// Server-Wächter: gleicht einen Server per SSH mit Zero Radar ab und meldet Treffer per Telegram.
// Läuft auf einem vertrauten Rechner (z. B. Homeserver), nicht auf Vercel. Server-Daten verlassen
// diesen Rechner nicht: der Feed wird heruntergeladen und lokal abgeglichen. Nichts wird automatisch
// gepatcht — die Meldung enthält Fix-Vorschläge, ausgeführt wird erst nach menschlichem OK.
//
// Konfiguration (nicht im Repo): ~/.config/zeroradar/server-watch.json
// {
//   "host": "vps",                                  // SSH-Alias
//   "lockfiles": ["/opt/app/package-lock.json"],    // Lockfiles auf dem Server
//   "dockerfiles": ["/opt/app/deploy/*/Dockerfile"],// FROM-Zeilen → Basis-Images
//   "watch": ["caddy", "postgres"],                 // zusätzliche Produktnamen
//   "env": "~/.hermes/.env"                         // TELEGRAM_ALERT_BOT_TOKEN / TELEGRAM_ALERT_CHAT
// }
// Flags: --dry (nichts senden, nichts merken), --all (bereits gemeldete erneut zeigen)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { matchPackages } from "../lib/match.mjs";
import { PARSERS, requirements } from "../skill/zeroradar/scripts/lockfiles.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const home = (p) => p.replace(/^~/, os.homedir());
const cfgFile = home(process.env.ZR_WATCH_CONFIG || "~/.config/zeroradar/server-watch.json");
const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
const stateFile = home(`~/.local/state/zeroradar/notified-${cfg.host}.json`);
const FEED = process.env.ZR_FEED || "https://raw.githubusercontent.com/legifx/zeroradar/data/advisories.json";

const ssh = (cmd) =>
  execFileSync("ssh", ["-o", "ConnectTimeout=10", "-o", "BatchMode=yes", cfg.host, cmd], {
    encoding: "utf8",
    maxBuffer: 64 << 20,
    stdio: ["ignore", "pipe", "ignore"],
  });

// ---------- Inventar ----------
const inv = { packages: [], keywords: new Set(cfg.watch || []), apt: [] };

for (const line of ssh("dpkg-query -W -f '${Package}\\t${Version}\\n'").split("\n")) {
  const [name, version] = line.split("\t");
  if (name) inv.packages.push({ ecosystem: "debian", name, version });
}
for (const f of cfg.lockfiles || []) {
  const base = path.basename(f);
  const parser = PARSERS[base] || (/^requirements.*\.txt$/.test(base) ? requirements : null);
  if (!parser) continue;
  try {
    inv.packages.push(...parser(ssh(`cat ${JSON.stringify(f)}`)).map((p) => ({ ...p, from: f })));
  } catch (err) {
    console.error(`lockfile ${f}: ${err.message}`);
  }
}
try {
  const from = ssh(`grep -h '^FROM' ${(cfg.dockerfiles || []).join(" ")} 2>/dev/null; docker ps --format '{{.Image}}' 2>/dev/null`);
  for (const m of from.matchAll(/(?:FROM\s+)?([a-z0-9._/-]+?)(?::([\w.-]+))?(?:\s+AS\s+\w+)?$/gim)) {
    const img = m[1].split("/").pop();
    if (img && !/^[a-f0-9]{7,}$/.test(img)) inv.keywords.add(img.replace(/-(alpine|slim|bookworm|trixie|fpm|cli)$/, ""));
  }
} catch {}
try {
  inv.apt = ssh("apt list --upgradable 2>/dev/null | grep -i -- '-security' || true")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("/")[0]);
} catch {}
// wichtige Systempakete immer beobachten
for (const k of ["openssh", "openssl", "sudo", "glibc", "linux", "docker", "containerd", "runc", "systemd", "caddy", "nginx", "postgresql", "node", "php", "python"])
  if (inv.packages.some((p) => p.ecosystem === "debian" && p.name.startsWith(k === "linux" ? "linux-image" : k))) inv.keywords.add(k);

// ---------- Abgleich ----------
const advisories = await (await fetch(FEED, { signal: AbortSignal.timeout(30000) })).json();
const urgent = (a) => a.kind === "malware" || ["yes", "reported"].includes(a.exploited.status);
// Telegram nur für Wichtiges: Schadpakete, ausgenutzte, kritische/hohe; der Rest als Zahl
const allPkgHits = matchPackages(inv.packages.filter((p) => p.ecosystem !== "debian"), advisories);
const pkgHits = allPkgHits.filter((h) => urgent(h.advisory) || ["critical", "high"].includes(h.advisory.severity));
const minorHits = allPkgHits.length - pkgHits.length;
// Stichwort-Treffer sind unscharf: nur bei ausgenutzten oder breit gemeldeten Lücken (Score ≥ 7)
const recentTop = advisories.filter(
  (a) => a.top && a.kind === "vuln" && Date.now() - Date.parse(a.updated) < 14 * 864e5 && (urgent(a) || (a.score ?? 0) >= 7),
);
const kwHits = [];
for (const a of recentTop) {
  const hay = `${a.title} ${a.affected || ""} ${a.products.map((p) => p.name).join(" ")}`.toLowerCase();
  for (const k of inv.keywords) {
    if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay)) {
      kwHits.push({ advisory: a, keyword: k });
      break;
    }
  }
}

const notified = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
const key = (id, extra) => `${id}|${extra}`;
const freshPkg = pkgHits.filter((h) => args.has("--all") || !notified[key(h.advisory.id, `${h.package.name}@${h.package.version}`)]);
const freshKw = kwHits.filter((h) => args.has("--all") || !notified[key(h.advisory.id, h.keyword)]);
const aptKey = inv.apt.slice().sort().join(",");
const freshApt = inv.apt.length && (args.has("--all") || notified.__apt !== aptKey);

if (!freshPkg.length && !freshKw.length && !freshApt) {
  console.log(`${cfg.host}: nichts Neues (${inv.packages.length} Pakete, ${inv.keywords.size} Produkte geprüft)`);
  process.exit(0);
}

// ---------- Meldung ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const site = "https://zeroradar.vercel.app/v/";
const lines = [`🛰 <b>Zero Radar · ${esc(cfg.host)}</b>`];
for (const h of freshPkg) {
  const a = h.advisory;
  lines.push(
    `\n<b>${a.kind === "malware" ? "SCHADPAKET" : a.severity.toUpperCase()}${a.exploited.status === "yes" ? " · AKTIV AUSGENUTZT" : ""}</b> ` +
      `${esc(h.package.name)}@${esc(h.package.version)} (${esc(path.basename(path.dirname(h.package.from)))})\n` +
      `${esc(a.title)}\n` +
      (h.product.fixed
        ? `Fix-Vorschlag: <code>${esc(h.package.name)}@${esc(h.product.fixed)}</code> im Repo anheben, Lockfile neu bauen, deployen`
        : "Noch keine gefixte Version — Mitigation im Briefing") +
      `\n${site}${encodeURIComponent(a.id)}`,
  );
}
for (const h of freshKw) {
  const a = h.advisory;
  lines.push(
    `\n<b>${a.severity.toUpperCase()}${a.exploited.status === "yes" ? " · AKTIV AUSGENUTZT" : ""}</b> betrifft evtl. <i>${esc(h.keyword)}</i>\n` +
      `${esc(a.title)}${a.fix.text ? `\nFix: ${esc(a.fix.text)}` : ""}\n${site}${encodeURIComponent(a.id)}`,
  );
}
if (freshApt)
  lines.push(
    `\n<b>Debian-Sicherheitsupdates offen (${inv.apt.length})</b>: ${esc(inv.apt.slice(0, 15).join(", "))}${inv.apt.length > 15 ? " …" : ""}\n` +
      `Fix-Vorschlag: <code>ssh ${esc(cfg.host)} 'apt-get update &amp;&amp; apt-get install --only-upgrade ${esc(inv.apt.join(" "))}'</code>`,
  );
if (minorHits) lines.push(`\n(+${minorHits} weitere Low/Medium-Treffer in Lockfiles — Details: zeroradar-Skill im Repo laufen lassen)`);
lines.push("\nNichts wurde automatisch geändert. Antworte deinem Agenten mit OK, um die Fixes einzuspielen.");
const text = lines.join("\n").slice(0, 4000);

if (args.has("--dry")) {
  console.log(text.replace(/<[^>]+>/g, ""));
  process.exit(0);
}

const env = {};
for (const l of fs.readFileSync(home(cfg.env || "~/.hermes/.env"), "utf8").split("\n")) {
  const m = l.match(/^\s*(TELEGRAM_ALERT_BOT_TOKEN|TELEGRAM_ALERT_CHAT)\s*=\s*"?([^"\n]*)"?/);
  if (m) env[m[1]] = m[2];
}
const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_ALERT_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: env.TELEGRAM_ALERT_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
});
if (!res.ok) {
  console.error(`Telegram ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const now = new Date().toISOString();
for (const h of freshPkg) notified[key(h.advisory.id, `${h.package.name}@${h.package.version}`)] = now;
for (const h of freshKw) notified[key(h.advisory.id, h.keyword)] = now;
if (inv.apt.length) notified.__apt = aptKey;
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(notified));
console.log(`${cfg.host}: ${freshPkg.length + freshKw.length} Treffer gemeldet${freshApt ? ", Debian-Updates offen" : ""}`);
