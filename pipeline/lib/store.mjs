// Zustand der Pipeline: alle Einträge, gesehene URLs. Liegt in var/store.json (nicht im Repo).
import fs from "node:fs";
import path from "node:path";

const SEV = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
const EXPLOITED = { unknown: 0, "no-known": 1, reported: 2, yes: 3 };
export const sevRank = (s) => SEV[s] ?? 0;

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 1, entries: {}, seenUrls: {}, runs: 0 };
    if (fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, "utf8"));
    this.alias = new Map();
    for (const e of Object.values(this.data.entries)) this.#indexAliases(e);
    this.backfill = this.data.runs === 0;
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

  /** Beobachtung einarbeiten. Gibt {entry, created, changed} zurück. */
  merge(obs, now) {
    let e = this.find([obs.id, ...(obs.aliases || [])]);
    const created = !e;
    if (!e) {
      e = {
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
        exploited: { status: "unknown" },
        sources: [],
        text: "",
        hn_points: 0,
      };
      // CVE-ID schlägt GHSA-/Hilfs-IDs als Primärschlüssel
      this.data.entries[e.id] = e;
    }
    const before = JSON.stringify([e.severity, e.exploited.status, e.sources.length, e.products.length]);

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
    if (obs.exploited && EXPLOITED[obs.exploited.status] > EXPLOITED[e.exploited.status]) e.exploited = obs.exploited;
    for (const p of obs.products || []) {
      if (!p.name) continue;
      const same = e.products.find(
        (q) => q.ecosystem === p.ecosystem && q.name === p.name && q.vulnerable === p.vulnerable,
      );
      if (!same) e.products.push(p);
    }
    if (obs.source && !e.sources.some((s) => s.url === obs.source.url)) e.sources.push(obs.source);
    if (obs.points) e.hn_points = Math.max(e.hn_points || 0, obs.points);
    if (obs.text && !e.text.includes(obs.text.slice(0, 200)))
      e.text = `${e.text}\n\n[${obs.source?.name || "?"}] ${obs.text}`.trim().slice(-8000);

    const changed = created || before !== JSON.stringify([e.severity, e.exploited.status, e.sources.length, e.products.length]);
    if (changed) e.updated = now;
    this.#indexAliases(e);
    return { entry: e, created, changed };
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
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
