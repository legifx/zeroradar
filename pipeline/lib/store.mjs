// Zustand der Pipeline: alle Einträge, gesehene URLs, HTTP-Cache der Feeds. Liegt in var/store.json.
// Jeder Eintrag sammelt Quellen (mit Vertrauensstufe), Belege für Ausnutzung und eine Zeitleiste.
import fs from "node:fs";
import path from "node:path";
import { SOURCE_TRUST, FEEDS } from "../../config/feeds.mjs";

const SEV = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
export const sevRank = (s) => SEV[s] ?? 0;
const TRUST = { community: 0, press: 1, research: 2, official: 3 };
const TIER_TRUST = { vendor: "official", list: "research", news: "press" }; // Alt-Daten v1
export const trustOf = (src) =>
  src.trust || SOURCE_TRUST[src.name] || TIER_TRUST[src.tier] || (FEED_TRUST[src.name] ?? "press");
const FEED_TRUST = Object.fromEntries(FEEDS.map((f) => [f.name, f.trust]));

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 2, entries: {}, seenUrls: {}, http: {}, runs: 0 };
    if (fs.existsSync(file)) this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    this.data.http ||= {};
    this.alias = new Map();
    for (const e of Object.values(this.data.entries)) {
      upgrade(e);
      this.#indexAliases(e);
    }
    this.backfill = this.data.runs === 0;
    this.dirty = false;
  }

  #indexAliases(e) {
    for (const a of [e.id, ...(e.aliases || [])]) this.alias.set(a.toUpperCase(), e.id);
  }

  find(ids) {
    for (const a of ids || []) {
      const id = this.alias.get(String(a).toUpperCase());
      if (id) return this.data.entries[id];
    }
    return null;
  }

  get entries() {
    return Object.values(this.data.entries);
  }

  /**
   * Beobachtung einarbeiten. opts.onlyExisting: nur bekannte Einträge aktualisieren
   * (für "geändert seit"-Abfragen, die sonst tausende Altlasten anlegen würden).
   */
  merge(obs, now, opts = {}) {
    let e = this.find([obs.id, ...(obs.aliases || [])]);
    if (!e && opts.onlyExisting) return { entry: null, created: false, changed: false };
    const created = !e;
    if (!e) {
      e = upgrade({
        id: obs.id,
        aliases: [],
        kind: obs.kind || "vuln",
        title: obs.title,
        severity: "unknown",
        cvss: null,
        epss: null,
        published: obs.published || now,
        first_seen: now,
        backfill: this.backfill || undefined,
        updated: now,
        products: [],
        sources: [],
        text: "",
        hn_points: 0,
      });
      this.data.entries[e.id] = e;
    }
    const before = fingerprint(e);
    const hadFix = e.products.some((p) => p.fixed);
    const prevExploit = e.exploited.status;
    const prevSev = e.severity;

    e.aliases = [...new Set([...e.aliases, ...(obs.aliases || []), obs.id])].filter((a) => a !== e.id);
    if (e.id.startsWith("GHSA-") || e.id.startsWith("ZR-")) {
      const cve = e.aliases.find((a) => /^CVE-/i.test(a));
      if (cve) this.#rename(e, cve.toUpperCase());
    }
    if (obs.kind && obs.kind !== "vuln" && e.kind === "vuln" && e.id.startsWith("ZR-")) e.kind = obs.kind;
    if (sevRank(obs.severity) > sevRank(e.severity)) e.severity = obs.severity;
    if (obs.cvss != null && (e.cvss == null || obs.cvss > e.cvss)) e.cvss = obs.cvss;
    if (obs.epss != null) e.epss = obs.epss;
    if (obs.published && obs.published < e.published) e.published = obs.published;
    if (!e.title || (obs.source?.name === "GitHub Advisory" && obs.title)) e.title = obs.title || e.title;
    for (const p of obs.products || []) {
      if (!p.name) continue;
      const same = e.products.find((q) => q.ecosystem === p.ecosystem && q.name === p.name && q.vulnerable === p.vulnerable);
      if (!same) e.products.push(p);
      else if (p.fixed && !same.fixed) same.fixed = p.fixed;
    }
    if (obs.source) {
      const src = { ...obs.source, trust: trustOf(obs.source) };
      const newPublisher = !e.sources.some((s) => s.name === src.name);
      if (!e.sources.some((s) => s.url === src.url)) {
        e.sources.push(src);
        if (newPublisher && !created && !this.backfill)
          event(e, now, "source", `${src.name} reported on it`, src);
      }
      if (obs.exploited) {
        const claim = { name: src.name, trust: src.trust, at: obs.exploited.since || now, status: obs.exploited.status, note: obs.exploited.note };
        if (!e.exploit_claims.some((c) => c.name === claim.name && c.status === claim.status)) e.exploit_claims.push(claim);
      }
    }
    if (obs.points) e.hn_points = Math.max(e.hn_points || 0, obs.points);
    if (obs.text && !e.text.includes(obs.text.slice(0, 200)))
      e.text = `${e.text}\n\n[${obs.source?.name || "?"}] ${obs.text}`.trim().slice(-9000);

    e.exploited = exploitStatus(e);
    if (!this.backfill && !created) {
      if (e.exploited.status !== prevExploit && e.exploited.status === "yes")
        event(e, now, "exploit_confirmed", e.exploited.note || "Exploitation confirmed");
      else if (e.exploited.status !== prevExploit && e.exploited.status === "reported")
        event(e, now, "exploit_reported", e.exploited.note || "Exploitation reported");
      if (!hadFix && e.products.some((p) => p.fixed)) {
        e.fix_found_at ||= now;
        const fx = e.products.filter((p) => p.fixed).slice(0, 3).map((p) => `${p.name} ${p.fixed}`).join(", ");
        event(e, now, "fix_available", `Fixed version published: ${fx}`, obs.source);
      }
      if (sevRank(e.severity) > sevRank(prevSev) && prevSev !== "unknown")
        event(e, now, "severity", `Severity raised to ${e.severity}`);
    }
    if (!hadFix && e.products.some((p) => p.fixed)) e.fix_found_at ||= now;

    const changed = created || before !== fingerprint(e);
    if (changed) {
      e.updated = now;
      this.dirty = true;
    }
    this.#indexAliases(e);
    return { entry: e, created, changed };
  }

  /** Eintrag `drop` in `keep` aufgehen lassen (Duplikat desselben Vorfalls). */
  absorb(keep, drop, now) {
    if (keep === drop) return;
    for (const src of drop.sources) {
      this.merge({ id: keep.id, aliases: [drop.id, ...drop.aliases], severity: drop.severity, cvss: drop.cvss, published: drop.published, products: drop.products, source: src, text: "" }, now);
    }
    for (const c of drop.exploit_claims) if (!keep.exploit_claims.some((k) => k.name === c.name && k.status === c.status)) keep.exploit_claims.push(c);
    keep.exploited = exploitStatus(keep);
    keep.events = [...keep.events, ...drop.events].sort((a, b) => a.at.localeCompare(b.at)).slice(-40);
    if (drop.text && !keep.text.includes(drop.text.slice(0, 200))) keep.text = `${keep.text}\n\n${drop.text}`.slice(-9000);
    if (drop.first_seen < keep.first_seen) keep.first_seen = drop.first_seen;
    keep.hn_points = Math.max(keep.hn_points || 0, drop.hn_points || 0);
    if (keep.kind === "vuln" && drop.kind !== "vuln" && keep.id.startsWith("ZR-")) keep.kind = drop.kind;
    delete this.data.entries[drop.id];
    for (const a of [drop.id, ...drop.aliases]) this.alias.set(a.toUpperCase(), keep.id);
    keep.updated = now;
    this.dirty = true;
  }

  /** Ereignis von außen (z. B. KI erkennt Fix im Text). */
  addEvent(e, now, type, text, src) {
    event(e, now, type, text, src);
    e.updated = now;
    this.dirty = true;
  }

  #rename(e, newId) {
    if (this.data.entries[newId] && this.data.entries[newId] !== e) return; // existiert schon separat
    delete this.data.entries[e.id];
    e.aliases = [...new Set([...e.aliases, e.id])].filter((a) => a !== newId);
    e.id = newId;
    this.data.entries[newId] = e;
  }

  seen(url) {
    return Boolean(this.data.seenUrls[url]);
  }
  markSeen(url, now) {
    this.data.seenUrls[url] = now;
  }

  prune(now, days = 45) {
    const cutoff = new Date(Date.parse(now) - days * 864e5).toISOString();
    for (const [id, e] of Object.entries(this.data.entries)) if (e.updated < cutoff) delete this.data.entries[id];
    for (const [u, t] of Object.entries(this.data.seenUrls)) if (t < cutoff) delete this.data.seenUrls[u];
  }

  save() {
    this.data.runs++;
    this.data.version = 2;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}

function upgrade(e) {
  e.exploit_claims ||= [];
  e.events ||= [];
  for (const s of e.sources || []) if (!s.trust || s.tier) { s.trust = trustOf({ ...s, trust: undefined }); delete s.tier; }
  // Alt-Daten (v1): Ausnutzung als Einzelwert → Beleg
  if (e.exploited?.status && e.exploited.status !== "unknown" && !e.exploit_claims.length) {
    const src = e.sources.find((s) => (e.exploited.note || "").includes(s.name)) || e.sources[0] || { name: "?", trust: "press" };
    e.exploit_claims.push({ name: src.name, trust: e.exploited.note?.includes("KEV") ? "official" : src.trust, at: e.exploited.since || e.updated, status: e.exploited.status, note: e.exploited.note });
  }
  e.exploited = exploitStatus(e);
  return e;
}

function fingerprint(e) {
  return JSON.stringify([e.severity, e.exploited.status, e.sources.length, e.products.length, e.products.filter((p) => p.fixed).length, e.exploit_claims.length]);
}

function event(e, at, type, text, src) {
  if (e.events.some((x) => x.type === type && x.text === text)) return;
  e.events.push({ at, type, text, source: src ? { name: src.name, url: src.url } : undefined });
  if (e.events.length > 40) e.events.splice(0, e.events.length - 40);
}

/**
 * Ausnutzung aus Belegen: "yes" = KEV oder offizielle Quelle bestätigt,
 * "reported" = mindestens eine seriöse Quelle (Presse/Forschung) meldet es.
 * Reine Community-Hinweise ändern den Status nicht.
 */
export function exploitStatus(e) {
  const claims = (e.exploit_claims || []).filter((c) => c.status === "yes" || c.status === "reported");
  const confirmed = claims.filter((c) => c.trust === "official" && (c.status === "yes" || /KEV|in the wild|exploited/i.test(c.note || "")));
  const serious = claims.filter((c) => c.trust !== "community");
  const names = (list) => [...new Set(list.map((c) => c.name))];
  const first = (list) => list.map((c) => c.at).sort()[0];
  if (confirmed.length) return { status: "yes", since: first(confirmed), note: `Confirmed by ${names(confirmed).join(", ")}`, by: names(claims) };
  if (serious.length) return { status: "reported", since: first(serious), note: `Reported by ${names(serious).join(", ")}`, by: names(claims) };
  return { status: "unknown", by: names(claims) };
}

/**
 * Wie belastbar ist der Eintrag? confirmed: offizielle Quelle; corroborated: ≥2 unabhängige
 * seriöse Herausgeber; single: einer; unverified: nur Community.
 */
export function confidence(e) {
  const pubs = new Map();
  for (const s of e.sources) {
    const t = trustOf(s);
    if (!pubs.has(s.name) || TRUST[t] > TRUST[pubs.get(s.name)]) pubs.set(s.name, t);
  }
  const serious = [...pubs.values()].filter((t) => t !== "community").length;
  const official = [...pubs.values()].includes("official");
  const level = official ? "confirmed" : serious >= 2 ? "corroborated" : serious === 1 ? "single" : "unverified";
  return { level, publishers: pubs.size, serious, official };
}
