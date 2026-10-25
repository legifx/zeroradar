// Veröffentlichung in einen lokalen Ordner, den der Lese-Server (daemon.mjs) ausliefert:
//   v1/index.json      schlanke Liste aller Einträge (für Feed, Suche, RSS)
//   v1/e/<id>.json     volles Briefing pro Eintrag
//   v1/packages.json   betroffene Pakete mit Versionsbereichen (für /api/check und den Server-Wächter)
//   v1/meta.json       Zeitpunkt, Zähler, Zustand der Quellen
// Kein Git, keine Commits: geschrieben wird nur, was sich geändert hat.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { confidence } from "./store.mjs";
import { isTop, score } from "../rules.mjs";

const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
export const fileId = (id) => id.replace(/[^A-Za-z0-9._-]/g, "_");
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

function fixOf(e) {
  const ai = e.ai || {};
  const structured = e.products.some((p) => p.fixed);
  const status = ai.fix_status && ai.fix_status !== "unknown" ? ai.fix_status : structured ? "available" : "unknown";
  const text =
    ai.fixed ||
    (structured ? [...new Set(e.products.filter((p) => p.fixed).map((p) => `${p.name} ${p.fixed}`))].slice(0, 6).join(", ") : null);
  return { status: structured && status === "none" ? "available" : status, text, since: e.fix_found_at || null };
}

function exploitedOf(e) {
  const ai = e.ai || {};
  // Strukturierte Belege haben Vorrang; KI-Lesart nur, wenn nichts Strukturiertes vorliegt
  if (e.exploited.status !== "unknown") return { ...e.exploited, by: e.exploited.by || [] };
  if (ai.exploited === "no-known") return { status: "no-known", by: [] };
  return { status: "unknown", by: e.exploited.by || [] };
}

function slim(e) {
  const ai = e.ai || {};
  const conf = confidence(e);
  const top = isTop(e);
  return {
    id: e.id,
    aliases: e.aliases.slice(0, 3),
    kind: e.kind,
    top,
    score: score(e),
    title: ai.title || (e.title.length > 130 ? `${e.title.slice(0, 127).replace(/\s+\S*$/, "")}…` : e.title),
    // Nur erklärter Text; Rohtext der Quelle (oft fremdsprachig) bleibt auf der Detailseite
    plain: top && (ai.plain || ai.summary) ? (ai.plain || ai.summary).slice(0, 240) : null,
    severity: e.severity,
    cvss: e.cvss,
    epss: e.epss,
    published: e.published,
    first_seen: e.backfill ? null : e.first_seen,
    updated: e.updated,
    exploited: exploitedOf(e),
    fix: fixOf(e),
    confidence: { level: conf.level, publishers: conf.publishers },
    eco: [...new Set(e.products.map((p) => p.ecosystem).filter((x) => x && x !== "service"))].slice(0, 3),
    names: [...new Set(e.products.map((p) => p.name))].slice(0, 5),
    hn: e.hn_points || 0,
  };
}

/** Für den Index: Standardwerte weglassen (die Seite setzt sie wieder ein). */
function compact(x) {
  const out = {};
  for (const [k, v] of Object.entries(x)) {
    if (v == null || v === false || v === 0 || (Array.isArray(v) && !v.length)) continue;
    if (k === "exploited" && v.status === "unknown" && !v.by?.length) continue;
    if (k === "fix" && v.status === "unknown" && !v.text) continue;
    out[k] = k === "exploited" ? { status: v.status, since: v.since, by: v.by?.length ? v.by : undefined } : v;
  }
  return out;
}

function detail(e) {
  const ai = e.ai || {};
  const events = [
    { at: e.published, type: "disclosed", text: "Publicly disclosed" },
    ...(e.backfill ? [] : [{ at: e.first_seen, type: "picked_up", text: "Picked up by Zero Radar" }]),
    ...e.events,
  ];
  // Quellen ohne eigenes Ereignis (ältere Einträge) als "berichtet von" in die Zeitleiste
  const seen = new Set(events.map((x) => x.source?.url).filter(Boolean));
  for (const s of e.sources)
    if (s.at && !seen.has(s.url)) events.push({ at: s.at, type: "source", text: `Reported by ${s.name}`, source: { name: s.name, url: s.url } });
  events.sort((a, b) => a.at.localeCompare(b.at));
  return {
    ...slim(e),
    aliases: e.aliases,
    summary: ai.summary || null,
    why: ai.why || null,
    who: ai.who || null,
    affected: ai.affected || null,
    steps: ai.steps || (ai.action ? [ai.action] : []),
    action: ai.action || null,
    flow: ai.flow?.steps?.length ? ai.flow : null,
    products: e.products.slice(0, 40),
    sources: [...e.sources]
      .sort((a, b) => (a.at || "").localeCompare(b.at || ""))
      .slice(0, 30)
      .map(({ name, url, at, title, trust }) => ({ name, url, at, title, trust })),
    exploit_claims: e.exploit_claims.map(({ name, trust, at, status, note }) => ({ name, trust, at, status, note })),
    events,
    ai: Boolean(e.ai),
    model: ai.model || null,
  };
}

export class Publisher {
  constructor(dir) {
    this.dir = dir;
    this.v1 = path.join(dir, "v1");
    this.hashes = new Map(); // Datei → Inhalts-Hash (nur im Speicher; beim Start wird alles einmal geschrieben)
    this.listeners = new Set();
    fs.mkdirSync(path.join(this.v1, "e"), { recursive: true });
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  #write(rel, body) {
    const h = sha(body);
    if (this.hashes.get(rel) === h) return false;
    const file = path.join(this.v1, rel);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
    this.hashes.set(rel, h);
    return true;
  }

  /** Schreibt alles Geänderte. Gibt true zurück, wenn sich sichtbare Daten geändert haben. */
  publish(store, { now, health, llmUsd }) {
    const keep = (e) =>
      isTop(e) ? e.updated >= ago(30) : e.kind === "malware" ? e.published >= ago(3) : e.published >= ago(7);
    const entries = store.entries.filter(keep);
    const index = entries.map((e) => compact(slim(e))).sort((a, b) => b.published.localeCompare(a.published));
    // Ablaufbild für jede Top-Karte (≈ 0,4 KB pro Eintrag); der lange Rest bekommt nur ein Symbol nach Art
    for (const x of index) if (x.top) {
      const flow = store.data.entries[x.id]?.ai?.flow;
      if (flow?.steps?.length) x.flow = flow;
    }
    let changed = this.#write("index.json", JSON.stringify({ entries: index }));

    const packages = [];
    for (const e of entries)
      for (const p of e.products)
        if (p.ecosystem && p.ecosystem !== "service" && p.name) packages.push([e.id, p.ecosystem, p.name, p.vulnerable || null, p.fixed || null]);
    changed = this.#write("packages.json", JSON.stringify({ columns: ["id", "ecosystem", "name", "vulnerable", "fixed"], rows: packages })) || changed;

    const wanted = new Set();
    for (const e of entries) {
      const rel = `e/${fileId(e.id)}.json`;
      wanted.add(`${fileId(e.id)}.json`);
      if (this.#write(rel, JSON.stringify(detail(e)))) changed = true;
    }
    for (const f of fs.readdirSync(path.join(this.v1, "e")))
      if (!wanted.has(f) && f.endsWith(".json")) {
        fs.rmSync(path.join(this.v1, "e", f));
        this.hashes.delete(`e/${f}`);
      }

    const prevMeta = this.meta;
    this.meta = {
      checked_at: now,
      data_changed_at: changed || !prevMeta ? now : prevMeta.data_changed_at,
      counts: { total: index.length, top: index.filter((i) => i.top).length },
      sources: health,
      llm_usd_today: llmUsd,
    };
    // meta.json wird immer geschrieben ("zuletzt geprüft"), zählt aber nicht als Datenänderung
    this.#write("meta.json", JSON.stringify(this.meta));
    if (changed) for (const fn of this.listeners) fn(this.meta);
    return changed;
  }
}
