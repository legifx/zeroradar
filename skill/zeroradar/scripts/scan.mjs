#!/usr/bin/env node
// Zero Radar Scanner: liest Lockfiles im Projekt und gleicht sie mit dem Radar ab.
//   node scan.mjs [dir]            Abhängigkeiten prüfen
//   node scan.mjs --latest         neue Top-Bedrohungen seit dem letzten Aufruf
//   node scan.mjs --json           maschinenlesbar
// Keine Abhängigkeiten, Node >= 18. Server: ZERORADAR_URL (Standard https://zeroradar.vercel.app).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PARSERS, requirements } from "./lockfiles.mjs";

const BASE = (process.env.ZERORADAR_URL || "https://zeroradar.vercel.app").replace(/\/$/, "");
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const root = path.resolve(argv.find((a) => !a.startsWith("--")) || ".");
const SKIP = new Set(["node_modules", ".git", "vendor", "dist", "build", ".next", "target", ".venv", "venv", "__pycache__"]);

function findFiles(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith(".")) findFiles(path.join(dir, e.name), depth + 1, out);
    } else out.push(path.join(dir, e.name));
  }
  return out;
}

function collect() {
  const pkgs = new Map();
  const files = [];
  for (const f of findFiles(root)) {
    const base = path.basename(f);
    const parser = PARSERS[base] || (/^requirements.*\.txt$/.test(base) ? requirements : null);
    if (!parser) continue;
    try {
      for (const p of parser(fs.readFileSync(f, "utf8"))) {
        if (p.name && p.version) pkgs.set(`${p.ecosystem}:${p.name}@${p.version}`, p);
      }
      files.push(path.relative(root, f));
    } catch (err) {
      console.error(`skip ${f}: ${err.message}`);
    }
  }
  return { files, packages: [...pkgs.values()] };
}

async function latest() {
  const stateFile = path.join(os.homedir(), ".cache", "zeroradar", "last-check");
  let since = null;
  try {
    since = fs.readFileSync(stateFile, "utf8").trim();
  } catch {}
  const q = new URLSearchParams({ view: "top", limit: "30" });
  if (since) q.set("since", since);
  const res = await fetch(`${BASE}/api/advisories?${q}`);
  const j = await res.json();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, j.checked_at || new Date().toISOString());
  if (flags.has("--json")) return console.log(JSON.stringify(j, null, 1));
  console.log(`Zero Radar: ${j.count} new top threat(s)${since ? ` since ${since}` : ""}`);
  for (const a of j.items) {
    console.log(`\n[${a.severity}${a.exploited.status === "yes" ? ", EXPLOITED" : ""}] ${a.id} ${a.title}`);
    if (a.action) console.log(`  → ${a.action}`);
    console.log(`  ${BASE}/v/${encodeURIComponent(a.id)}`);
  }
}

async function scan() {
  const { files, packages } = collect();
  if (!packages.length) {
    console.log(`No supported lockfiles found under ${root}.`);
    return;
  }
  const res = await fetch(`${BASE}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packages }),
  });
  if (!res.ok) throw new Error(`Zero Radar API ${res.status}`);
  const r = await res.json();
  if (flags.has("--json")) return console.log(JSON.stringify({ files, ...r }, null, 1));
  console.log(`Scanned ${packages.length} packages from ${files.length} lockfile(s): ${files.join(", ")}`);
  if (!r.findings.length) return console.log("No package is affected by anything currently on the Zero Radar.");
  console.log(`\n${r.findings.length} finding(s):`);
  for (const f of r.findings) {
    const tag = f.kind === "malware" ? "MALICIOUS PACKAGE" : f.severity.toUpperCase();
    console.log(`\n[${tag}${f.exploited === "yes" ? ", EXPLOITED" : ""}] ${f.package.ecosystem}/${f.package.name}@${f.package.version} — ${f.id}`);
    console.log(`  ${f.title}`);
    console.log(`  vulnerable: ${f.vulnerable || "?"} · fixed: ${f.fixed || "no fix listed"} · ${f.certainty}`);
    if (f.action) console.log(`  → ${f.action}`);
    console.log(`  ${BASE}${f.url}`);
  }
  process.exitCode = 2;
}

(flags.has("--latest") ? latest() : scan()).catch((err) => {
  console.error(`zeroradar: ${err.message}`);
  process.exitCode = 1;
});
