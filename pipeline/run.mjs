#!/usr/bin/env node
// Einmal-Lauf (Entwicklung, Tests): alle Quellen einmal abfragen, verarbeiten, nach var/public schreiben.
// Im Betrieb läuft stattdessen daemon.mjs. Flags: --no-ai, --dedupe (Duplikat-Schritt erzwingen), -v
import path from "node:path";
import { VAR, loadEnv, makeLog } from "./lib/env.mjs";
import { Engine } from "./engine.mjs";

loadEnv();
const args = new Set(process.argv.slice(2));
if (args.has("--no-ai")) delete process.env.ZERORADAR_OPENROUTER_KEY;
const log = makeLog({ echo: args.has("-v") || process.stdout.isTTY });

const engine = new Engine({
  storeFile: path.join(VAR, "store.json"),
  publicDir: path.join(VAR, "public"),
  log,
  githubToken: process.env.GITHUB_TOKEN,
  nvdKey: process.env.NVD_API_KEY,
  dailyLlmUsd: Number(process.env.ZR_LLM_DAILY_USD || 0.2),
  dailyAboUsd: Number(process.env.ZR_ABO_DAILY_USD || 1),
});
if (args.has("--dedupe")) engine.needDedupe = true;
await engine.tick({ all: true });
// noch offene Erklärungen abarbeiten (Erstlauf)
for (let i = 0; i < 5 && (await engine.tick({ all: false })); i++);
const m = engine.publisher.meta;
log(`Einmal-Lauf fertig: ${m?.counts.total} Einträge (${m?.counts.top} top), KI heute ${engine.store.data.llm?.usd ?? 0} USD`);
