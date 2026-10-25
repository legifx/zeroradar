#!/usr/bin/env node
// Ein Pipeline-Durchlauf: sammeln → zusammenführen → Triage → Bewertung → veröffentlichen.
// Aufruf per Cron alle 5 Minuten. Flags: --no-publish (nur lokal), --no-ai, --dedupe (Duplikat-Schritt erzwingen).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store, sevRank } from "./lib/store.mjs";
import { ghsa, nvd, kev, epss, hibp } from "./sources/advisories.mjs";
import { feeds, hackernews, cvesIn } from "./sources/signals.mjs";
import { triage, enrich, enrichHash, pool, findDuplicates } from "./ai.mjs";
import { spent, llmAvailable } from "./lib/llm.mjs";
import { publishToBranch } from "./lib/publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAR = path.join(ROOT, "var");
const args = new Set(process.argv.slice(2));

for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (args.has("--no-ai")) delete process.env.ZERORADAR_OPENROUTER_KEY;

const now = new Date().toISOString();
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
fs.mkdirSync(VAR, { recursive: true });
const logLines = [];
const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  logLines.push(line);
  fs.appendFileSync(path.join(VAR, "pipeline.log"), line + "\n");
  if (process.stdout.isTTY || args.has("-v")) console.log(line);
};

const store = new Store(path.join(VAR, "store.json"));
const boot = store.backfill;
const health = {};

async function source(name, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    health[name] = { ok: true, items: r.length, ms: Date.now() - t };
    return r;
  } catch (err) {
    health[name] = { ok: false, error: String(err.message || err).slice(0, 160) };
    log(`Quelle ${name} fehlgeschlagen: ${err.message}`);
    return [];
  }
}

const EXPLOIT_WORDS = /\b(actively exploited|exploited in the wild|in-the-wild exploitation|under active attack|being exploited|zero-day attacks?)\b/i;

// ---------- 1. strukturierte Quellen ----------
const [gh, nv, kv, hb] = await Promise.all([
  source("ghsa", () => ghsa({ since: ago(boot ? 10 : 3), token: process.env.GITHUB_TOKEN })),
  source("nvd", () => nvd({ since: ago(boot ? 7 : 2), apiKey: process.env.NVD_API_KEY })),
  source("kev", () => kev({ since: ago(boot ? 30 : 7) })),
  source("hibp", () => hibp({ since: ago(boot ? 30 : 14) })),
]);
let created = 0;
for (const obs of [...gh, ...nv, ...kv, ...hb]) if (store.merge(obs, now).created) created++;

// ---------- 2. Signale: Hersteller, Listen, Presse, HN ----------
const signals = [
  ...(await source("feeds", () => feeds({ since: ago(boot ? 7 : 3), log }))),
  ...(await source("hn", () => hackernews({ since: ago(2), log }))),
].filter((s) => !store.seen(s.url));

const asObs = (s, id, extra = {}) => ({
  id,
  aliases: [id],
  text: `${s.title}. ${s.text}`.slice(0, 2500),
  published: s.published,
  points: s.points,
  exploited: EXPLOIT_WORDS.test(`${s.title} ${s.text}`)
    ? { status: "reported", since: s.published, note: `Reported by ${s.feedName}` }
    : undefined,
  source: { name: s.feedName, url: s.url, at: s.published, tier: s.tier, title: s.title.slice(0, 140) },
  ...extra,
});

const toTriage = [];
for (const s of signals) {
  const cves = cvesIn(`${s.title} ${s.text}`);
  const known = cves.filter((c) => store.find([c]));
  if (known.length) {
    // bekannte Lücke: Meldung als weitere Quelle anhängen, kein Modell nötig
    for (const c of known.slice(0, 5)) store.merge(asObs(s, store.find([c]).id), now);
    store.markSeen(s.url, now);
  } else toTriage.push({ ...s, cves });
}

const recent = store.entries
  .filter((e) => e.updated >= ago(7) && e.kind !== "malware" && (sevRank(e.severity) >= 3 || e.kind !== "vuln"))
  .sort((a, b) => b.updated.localeCompare(a.updated));
const tierOrder = { vendor: 0, list: 1, news: 2 };
toTriage.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.published.localeCompare(a.published));
const verdicts = await triage(toTriage, recent, log, boot ? 120 : 60);

toTriage.forEach((s, i) => {
  const v = verdicts[i];
  if (!v) {
    if (llmAvailable()) return; // über dem Limit oder Fehler: nächster Lauf
    // ohne Modell: nur Hersteller/Listen mit wenigen CVEs aufnehmen
    if (s.tier !== "news" && s.cves.length && s.cves.length <= 3)
      for (const c of s.cves) store.merge(asObs(s, c, { kind: "vuln", title: s.title, severity: "unknown" }), now);
    store.markSeen(s.url, now);
    return;
  }
  store.markSeen(s.url, now);
  if (!v.relevant) return;
  const ex = v.exploited === "yes" || v.exploited === "reported"
    ? { status: v.exploited, since: s.published, note: `Reported by ${s.feedName}` }
    : undefined;
  const base = { kind: v.kind, severity: v.severity, title: v.title, exploited: ex };
  const match = v.match_id && store.find([v.match_id]);
  const cves = [...new Set([...(v.cves || []), ...s.cves])].filter((c) => /^CVE-\d{4}-\d+$/i.test(c));
  if (match) store.merge(asObs(s, match.id, base), now);
  else if (cves.length) for (const c of cves.slice(0, 5)) store.merge(asObs(s, c.toUpperCase(), base), now);
  else {
    const id = `ZR-${crypto.createHash("sha1").update(s.url).digest("hex").slice(0, 8)}`;
    if (store.merge(asObs(s, id, base), now).created) created++;
  }
});

// ---------- 3. Duplikate zusammenführen (nur wenn neue Signal-Einträge da sind) ----------
const touchedSignals = store.entries.some((e) => e.first_seen === now && (e.id.startsWith("ZR-") || e.sources.some((s) => s.tier)));
let merged = 0;
if (touchedSignals || args.has("--dedupe")) {
  const pool7 = store.entries
    .filter((e) => e.updated >= ago(7) && e.kind !== "malware" && (e.id.startsWith("ZR-") || e.sources.some((s) => s.tier) || e.exploited.status === "yes"))
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 250);
  const rank = (e) => (e.id.startsWith("CVE-") ? 0 : e.id.startsWith("GHSA-") ? 1 : 2) * 1000 - e.sources.length;
  for (const group of await findDuplicates(pool7, log)) {
    const entries = [...new Set(group.map((id) => store.find([id])).filter(Boolean))];
    // nie zwei verschiedene CVEs verschmelzen
    if (entries.filter((e) => e.id.startsWith("CVE-")).length > 1) continue;
    entries.sort((a, b) => rank(a) - rank(b));
    for (const drop of entries.slice(1)) {
      store.absorb(entries[0], drop, now);
      merged++;
    }
  }
}

// ---------- 4. Priorität, EPSS, Bewertung ----------
const isTop = (e) =>
  e.kind === "breach" || e.kind === "incident" ||
  (e.kind !== "malware" &&
    (["yes", "reported"].includes(e.exploited.status) ||
      e.severity === "critical" ||
      (e.severity === "high" && (e.products.some((p) => p.ecosystem && p.ecosystem !== "service") || e.sources.length > 1))));

const top = store.entries.filter(isTop);
// Reihenfolge der Bewertung: ausgenutzt > Vorfälle/Leaks > Rest
const urgency = (e) => (["yes", "reported"].includes(e.exploited.status) ? 2 : 0) + (e.kind !== "vuln" ? 1 : 0);
const cveTop = top.filter((e) => /^CVE-/.test(e.id)).map((e) => e.id);
const scores = await epss(cveTop.slice(0, 400));
for (const [id, p] of Object.entries(scores)) if (store.data.entries[id]) store.data.entries[id].epss = p;

const enrichQueue = top
  .filter((e) => !e.ai || e.ai.hash !== enrichHash(e))
  .sort(
    (a, b) =>
      urgency(b) - urgency(a) || sevRank(b.severity) - sevRank(a.severity) || b.updated.localeCompare(a.updated),
  )
  .slice(0, boot ? 80 : 30);
await pool(enrichQueue, 8, async (e) => {
  const r = await enrich(e, log);
  if (r) e.ai = r;
});

// ---------- 5. veröffentlichen ----------
store.prune(now);
store.save();

// Relevanz für die Top-Ansicht (die Seite verrechnet sie noch mit dem Alter)
const SEV_POINTS = { critical: 3, high: 2, medium: 1 };
const score = (e) =>
  (SEV_POINTS[e.severity] || 0) +
  ({ yes: 4, reported: 3 }[e.exploited.status] || 0) +
  Math.min(new Set(e.sources.map((s) => s.name)).size - 1, 4) +
  (e.sources.some((s) => s.tier) ? 2 : 0) +
  (e.hn_points >= 200 ? 2 : e.hn_points >= 50 ? 1 : 0) +
  (e.products.some((p) => p.ecosystem && p.ecosystem !== "service") ? 1 : 0) +
  (e.kind === "breach" || e.kind === "incident" ? 1 : 0);

const pub = (e) => {
  const ai = e.ai || {};
  const exploited =
    e.exploited.status === "yes" || !ai.exploited || ai.exploited === "unknown"
      ? e.exploited
      : { status: ai.exploited, note: ai.exploited_note || e.exploited.note || null };
  return {
    id: e.id,
    aliases: e.aliases,
    kind: e.kind,
    top: isTop(e),
    score: score(e),
    title: ai.title || e.title,
    severity: e.severity,
    cvss: e.cvss,
    epss: e.epss,
    published: e.published,
    first_seen: e.backfill ? null : e.first_seen,
    updated: e.updated,
    summary: ai.summary || (e.kind === "malware" ? null : e.text.replace(/^\[[^\]]+\]\s*/, "").slice(0, 320)),
    why: ai.why || null,
    affected: ai.affected || null,
    fix: { status: ai.fix_status || (e.products.some((p) => p.fixed) ? "available" : "unknown"), text: ai.fixed || null },
    action: ai.action || null,
    exploited,
    products: e.products.slice(0, 25),
    sources: e.sources.slice(0, 12).map(({ name, url, at, title }) => ({ name, url, at, title })),
    hn_points: e.hn_points || 0,
    ai: Boolean(e.ai),
  };
};

const keep = (e) =>
  isTop(e) ? e.updated >= ago(30) : e.kind === "malware" ? e.published >= ago(3) : e.published >= ago(7);
let items = store.entries.filter(keep).map(pub).sort((a, b) => b.published.localeCompare(a.published));
// Größenbudget: Next.js cached fetch-Antworten nur bis 2 MB
const budget = 1_800_000;
while (JSON.stringify(items).length > budget) {
  const idx = items.findLastIndex((x) => !x.top);
  if (idx < 0) break;
  items.splice(idx, 1);
}

const advFile = path.join(VAR, "advisories.json");
const metaFile = path.join(VAR, "meta.json");
const body = JSON.stringify(items);
const hash = crypto.createHash("sha1").update(body).digest("hex");
const prev = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
fs.writeFileSync(advFile, body);
const meta = {
  checked_at: now,
  data_changed_at: prev.hash === hash ? prev.data_changed_at : now,
  hash,
  counts: { total: items.length, top: items.filter((i) => i.top).length },
  sources: health,
  llm_usd: +spent().toFixed(4),
};
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.copyFileSync(advFile, path.join(ROOT, "data", "advisories.json"));
fs.copyFileSync(metaFile, path.join(ROOT, "data", "meta.json"));

const heartbeatDue = !prev.pushed_at || Date.parse(now) - Date.parse(prev.pushed_at) > 15 * 60e3;
if (!args.has("--no-publish") && (prev.hash !== hash || heartbeatDue)) {
  try {
    publishToBranch({
      repoDir: ROOT,
      files: { "advisories.json": advFile, "meta.json": metaFile },
      message: `data ${now} (${items.length} entries)`,
    });
    meta.pushed_at = now;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  } catch (err) {
    log(`Push fehlgeschlagen: ${err.message.split("\n")[0]}`);
  }
} else if (prev.pushed_at) {
  meta.pushed_at = prev.pushed_at;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
}

log(
  `Lauf fertig: ${items.length} veröffentlicht (${meta.counts.top} top), ${created} neu, ` +
    `${toTriage.length} triagiert, ${merged} zusammengeführt, ${enrichQueue.length} bewertet, LLM ${meta.llm_usd} USD`,
);
