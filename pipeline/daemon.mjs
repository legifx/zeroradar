#!/usr/bin/env node
// Zero-Radar-Dauerdienst (systemd, Homeserver):
//  - fragt alle Quellen laufend in ihrem eigenen Takt ab (15-s-Raster, siehe engine.mjs)
//  - liefert die Daten über einen kleinen Lese-Server aus (127.0.0.1:8793, öffentlich via Tailscale Funnel)
//  - sagt der Website nach jeder Änderung Bescheid (POST /api/revalidate), damit sie sofort neu lädt
//  - startet nach Änderungen den Server-Wächter (höchstens alle 10 Minuten)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { ROOT, VAR, loadEnv, makeLog } from "./lib/env.mjs";
import { Engine } from "./engine.mjs";

loadEnv();
const log = makeLog({ echo: process.stdout.isTTY });
const PORT = Number(process.env.ZR_PORT || 8793);
const PUBLIC = path.join(VAR, "public");
const SITE = process.env.ZR_SITE_URL || "https://zeroradar.vercel.app";
const TICK_MS = 15_000;

const engine = new Engine({
  storeFile: path.join(VAR, "store.json"),
  publicDir: PUBLIC,
  log,
  githubToken: process.env.GITHUB_TOKEN,
  nvdKey: process.env.NVD_API_KEY,
  dailyLlmUsd: Number(process.env.ZR_LLM_DAILY_USD || 0.2),
  dailyAboUsd: Number(process.env.ZR_ABO_DAILY_USD || 1),
});

// ---------- Website benachrichtigen (entprellt) ----------
let notifyTimer = null;
engine.publisher.onChange(() => {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(async () => {
    if (!process.env.ZR_REVALIDATE_SECRET) return;
    try {
      const res = await fetch(`${SITE}/api/revalidate`, {
        method: "POST",
        headers: { "x-zr-secret": process.env.ZR_REVALIDATE_SECRET },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) log(`revalidate: HTTP ${res.status}`);
    } catch (err) {
      log(`revalidate: ${err.message}`);
    }
  }, 3000);
  maybeWatch();
});

// ---------- Server-Wächter ----------
let lastWatch = 0;
function maybeWatch() {
  if (!fs.existsSync(path.join(process.env.HOME, ".config/zeroradar/server-watch.json"))) return;
  if (Date.now() - lastWatch < 10 * 60e3) return;
  lastWatch = Date.now();
  const p = spawn(process.execPath, [path.join(ROOT, "ops/server-watch.mjs")], {
    env: { ...process.env, ZR_FEED_DIR: path.join(PUBLIC, "v1") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => log(`wächter (${code}): ${out.trim().split("\n").pop()}`));
}

// ---------- Lese-Server ----------
const cache = new Map(); // Datei → {mtime, raw, gz, br, etag}
function load(file) {
  const st = fs.statSync(file);
  const c = cache.get(file);
  if (c && c.mtime === st.mtimeMs) return c;
  const raw = fs.readFileSync(file);
  const v = {
    mtime: st.mtimeMs,
    raw,
    gz: zlib.gzipSync(raw),
    br: raw.length > 20000 ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : null,
    etag: `"${st.mtimeMs.toString(36)}-${raw.length.toString(36)}"`,
  };
  cache.set(file, v);
  if (cache.size > 3000) cache.delete(cache.keys().next().value);
  return v;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/^\/zeroradar(?=\/)/, "");
  const head = { "access-control-allow-origin": "*", "x-content-type-options": "nosniff" };
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405, head).end();
  if (p === "/healthz") {
    const meta = engine.publisher.meta || {};
    res.writeHead(200, { ...head, "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, checked_at: meta.checked_at, counts: meta.counts }));
  }
  const m = p.match(/^\/v1\/((?:e\/)?[A-Za-z0-9._-]+\.json)$/);
  const file = m && path.join(PUBLIC, "v1", m[1]);
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { ...head, "content-type": "application/json" });
    return res.end('{"error":"not found"}');
  }
  const f = load(file);
  if (req.headers["if-none-match"] === f.etag) return res.writeHead(304, { ...head, etag: f.etag }).end();
  const ae = String(req.headers["accept-encoding"] || "");
  const [body, enc] = f.br && /\bbr\b/.test(ae) ? [f.br, "br"] : /\bgzip\b/.test(ae) ? [f.gz, "gzip"] : [f.raw, null];
  res.writeHead(200, {
    ...head,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=10",
    etag: f.etag,
    vary: "accept-encoding",
    ...(enc ? { "content-encoding": enc } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : body);
});
server.on("error", (err) => {
  log(`Lese-Server: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => log(`Lese-Server auf 127.0.0.1:${PORT}`));

// ---------- Takt ----------
let stopping = false;
async function loop() {
  while (!stopping) {
    const t0 = Date.now();
    try {
      await engine.tick();
    } catch (err) {
      log(`Takt-Fehler: ${err.stack || err.message}`);
    }
    await new Promise((r) => setTimeout(r, Math.max(1000, TICK_MS - (Date.now() - t0))));
  }
}
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    stopping = true;
    log(`${sig}: speichere und beende`);
    try {
      engine.store.save();
    } catch {}
    server.close();
    setTimeout(() => process.exit(0), 500);
  });

log(`Dauerdienst startet (${engine.tasks.length} Quellen, Takt ${TICK_MS / 1000}s)`);
loop();
