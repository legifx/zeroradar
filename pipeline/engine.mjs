// Die Zero-Radar-Engine: fragt jede Quelle in ihrem eigenen Takt ab, führt Meldungen zusammen,
// lässt die KI triagieren und erklären, verfolgt Fixes nach und veröffentlicht nach jeder Änderung.
// Genutzt vom Dauerdienst (daemon.mjs) und vom Einmal-Lauf (run.mjs).
import crypto from "node:crypto";
import { Store, sevRank } from "./lib/store.mjs";
import { ghsa, ghsaByCve, nvd, kev, epss, hibp, osvFixes } from "./sources/advisories.mjs";
import { FEEDS, fetchFeed, hackernews, cvesIn } from "./sources/signals.mjs";
import { triage, enrich, enrichHash, pool, findDuplicates } from "./ai.mjs";
import { spent, llmAvailable } from "./lib/llm.mjs";
import { Publisher } from "./lib/publish.mjs";
import { isTop, urgency } from "./rules.mjs";

const EXPLOIT_WORDS = /\b(actively exploited|exploited in the wild|in-the-wild exploitation|under active attack|being exploited|zero-day attacks?|exploitation (?:has been )?(?:observed|detected|confirmed))\b/i;
const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();

export class Engine {
  constructor({ storeFile, publicDir, log, githubToken, nvdKey, dailyLlmUsd = 2 }) {
    this.store = new Store(storeFile);
    this.publisher = new Publisher(publicDir);
    this.log = log;
    this.githubToken = githubToken;
    this.nvdKey = nvdKey;
    this.dailyLlmUsd = dailyLlmUsd;
    this.health = this.store.data.health || {};
    this.last = this.store.data.lastRun || {}; // Task → Zeitpunkt des letzten Erfolgs
    this.lastDedupe = 0;
    this.boot = this.store.backfill;
    this.tasks = this.#tasks();
  }

  // ---------- Takt pro Quelle (Sekunden) ----------
  #tasks() {
    const since = (task, fallbackSec, overlapSec = 600) =>
      this.last[task] ? ago((Date.now() - Date.parse(this.last[task])) / 1000 + overlapSec) : ago(fallbackSec);
    const http = (key) => (this.store.data.http[key] ||= {});
    const D = 86400;
    const t = [
      { id: "ghsa", every: 60, run: () => ghsa({ since: since("ghsa", this.boot ? 10 * D : 3 * D), token: this.githubToken }).then((o) => ({ obs: o })) },
      { id: "ghsa-updated", every: 120, run: () => ghsa({ since: since("ghsa-updated", D), token: this.githubToken, sort: "updated" }).then((o) => ({ obs: o, onlyExisting: true })) },
      { id: "nvd", every: 300, run: () => nvd({ since: since("nvd", this.boot ? 7 * D : 2 * D, 3600), apiKey: this.nvdKey }).then((o) => ({ obs: o })) },
      { id: "nvd-modified", every: 600, run: () => nvd({ since: since("nvd-modified", 6 * 3600, 1800), apiKey: this.nvdKey, mode: "modified" }).then((o) => ({ obs: o, onlyExisting: true })) },
      { id: "kev", every: 300, run: () => kev({ since: ago(this.boot ? 30 * D : 14 * D), httpCache: http("kev") }).then((o) => ({ obs: o })) },
      { id: "hibp", every: 1800, run: () => hibp({ since: ago(this.boot ? 30 * D : 14 * D), httpCache: http("hibp") }).then((o) => ({ obs: o })) },
      { id: "hn", every: 180, run: () => hackernews({ since: ago(2 * D), log: this.log }).then((s) => ({ signals: s })) },
      { id: "epss", every: 6 * 3600, run: () => this.#epss() },
      { id: "fixwatch", every: 900, run: () => this.#fixWatch() },
    ];
    for (const f of FEEDS)
      t.push({ id: `feed:${f.id}`, every: f.every || 300, run: () => fetchFeed(f, { since: ago(this.boot ? 7 * D : 3 * D), httpCache: http(`feed:${f.id}`) }).then((s) => ({ signals: s })) });
    return t;
  }

  due(now = Date.now()) {
    return this.tasks.filter((t) => !this.health[t.id]?.at || now - Date.parse(this.health[t.id].at) >= t.every * 1000);
  }

  /** Ein Takt: fällige Quellen abfragen, verarbeiten. Gibt true zurück, wenn sich Daten geändert haben. */
  async tick({ all = false } = {}) {
    const now = new Date().toISOString();
    const due = all ? this.tasks : this.due();
    if (!due.length) return this.#afterProcessing(now, { enrichOnly: true });
    const results = await pool(due, 8, async (t) => {
      const t0 = Date.now();
      try {
        const r = await t.run();
        this.health[t.id] = { ok: true, at: now, items: (r.obs || r.signals || []).length, ms: Date.now() - t0 };
        this.last[t.id] = now;
        return r;
      } catch (err) {
        this.health[t.id] = { ok: false, at: now, error: String(err.message || err).slice(0, 160) };
        this.log(`Quelle ${t.id} fehlgeschlagen: ${err.message}`);
        return {};
      }
    });

    let created = 0;
    for (const r of results)
      for (const o of r.obs || []) if (this.store.merge(o, now, { onlyExisting: r.onlyExisting }).created) created++;
    const signals = results.flatMap((r) => r.signals || []).filter((s) => !this.store.seen(s.url));
    created += await this.#signals(signals, now);
    return this.#afterProcessing(now, { created });
  }

  // ---------- Signale (Feeds, HN) ----------
  async #signals(signals, now) {
    const asObs = (s, id, extra = {}) => {
      const m = `${s.title} ${s.text}`.match(EXPLOIT_WORDS);
      return {
        id,
        aliases: [id],
        text: `${s.title}. ${s.text}`.slice(0, 2500),
        published: s.published,
        points: s.points,
        exploited: m ? { status: "reported", since: s.published, note: `${s.feedName}: "${m[0]}"` } : undefined,
        source: { name: s.feedName, url: s.url, at: s.published, trust: s.trust, title: s.title.slice(0, 140) },
        ...extra,
      };
    };
    const toTriage = [];
    for (const s of signals) {
      const cves = cvesIn(`${s.title} ${s.text}`);
      const known = cves.filter((c) => this.store.find([c]));
      if (known.length) {
        for (const c of known.slice(0, 5)) this.store.merge(asObs(s, this.store.find([c]).id), now);
        this.store.markSeen(s.url, now);
      } else toTriage.push({ ...s, cves });
    }
    if (!toTriage.length) return 0;

    const recent = this.store.entries
      .filter((e) => e.updated >= ago(7 * 86400) && e.kind !== "malware" && (sevRank(e.severity) >= 3 || e.kind !== "vuln"))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    const order = { official: 0, research: 1, press: 2, community: 3 };
    toTriage.sort((a, b) => order[a.trust] - order[b.trust] || b.published.localeCompare(a.published));
    const verdicts = this.#llmOk() ? await triage(toTriage, recent, this.log, this.boot ? 150 : 40) : toTriage.map(() => null);

    let created = 0;
    toTriage.forEach((s, i) => {
      const v = verdicts[i];
      if (!v) {
        if (llmAvailable() && this.#llmOk()) return; // über dem Limit oder Fehler: nächster Takt
        if (s.trust === "official" && s.cves.length && s.cves.length <= 3)
          for (const c of s.cves) this.store.merge(asObs(s, c, { kind: "vuln", title: s.title, severity: "unknown" }), now);
        this.store.markSeen(s.url, now);
        return;
      }
      this.store.markSeen(s.url, now);
      if (!v.relevant) return;
      const ex = ["yes", "reported"].includes(v.exploited)
        ? { status: "reported", since: s.published, note: `${s.feedName} reports exploitation` }
        : undefined;
      const base = { kind: v.kind, severity: v.severity, title: v.title };
      const obs = (id) => {
        const o = asObs(s, id, base);
        if (ex && !o.exploited) o.exploited = ex;
        return o;
      };
      const match = v.match_id && this.store.find([v.match_id]);
      const cves = [...new Set([...(v.cves || []), ...s.cves])].filter((c) => /^CVE-\d{4}-\d+$/i.test(c));
      if (match) this.store.merge(obs(match.id), now);
      else if (cves.length) for (const c of cves.slice(0, 5)) this.store.merge(obs(c.toUpperCase()), now);
      else {
        const id = `ZR-${crypto.createHash("sha1").update(s.url).digest("hex").slice(0, 8)}`;
        if (this.store.merge(obs(id), now).created) created++;
      }
    });
    if (created) this.needDedupe = true;
    return created;
  }

  // ---------- Fix-Wächter: offene Einträge regelmäßig gegen OSV und GHSA prüfen ----------
  async #fixWatch() {
    const open = this.store.entries
      .filter((e) => isTop(e) && /^CVE-/.test(e.id) && e.updated >= ago(30 * 86400))
      .filter((e) => !e.products.some((p) => p.fixed) && e.ai?.fix_status !== "available")
      .sort((a, b) => (b.fix_checked_at ? 0 : 1) - (a.fix_checked_at ? 0 : 1) || (a.fix_checked_at || "").localeCompare(b.fix_checked_at || ""))
      .slice(0, 25);
    const obs = [];
    const now = new Date().toISOString();
    await pool(open, 4, async (e) => {
      e.fix_checked_at = now;
      try {
        const fixes = await osvFixes(e.id);
        if (fixes.length)
          obs.push({ id: e.id, products: fixes, source: { name: "OSV", url: `https://osv.dev/vulnerability/${e.id}`, at: now, trust: "official", title: `Fixed versions for ${e.id}` } });
        if (!fixes.length && this.githubToken) for (const g of await ghsaByCve(e.id, this.githubToken)) obs.push(g);
      } catch (err) {
        this.log(`fixwatch ${e.id}: ${err.message}`);
      }
    });
    return { obs, onlyExisting: true };
  }

  async #epss() {
    const ids = this.store.entries.filter((e) => isTop(e) && /^CVE-/.test(e.id)).map((e) => e.id);
    const scores = await epss(ids.slice(0, 600));
    for (const [id, p] of Object.entries(scores)) if (this.store.data.entries[id]) this.store.data.entries[id].epss = p;
    return { obs: [] };
  }

  // ---------- Duplikate, Bewertung, Veröffentlichung ----------
  async #afterProcessing(now, { created = 0, enrichOnly = false } = {}) {
    let merged = 0;
    if (this.needDedupe && Date.now() - this.lastDedupe > 120e3 && this.#llmOk()) {
      this.needDedupe = false;
      this.lastDedupe = Date.now();
      merged = await this.dedupe(now);
    }

    const queue = this.store.entries
      .filter((e) => isTop(e) && (!e.ai || e.ai.hash !== enrichHash(e)))
      .sort((a, b) => urgency(b) - urgency(a) || sevRank(b.severity) - sevRank(a.severity) || b.updated.localeCompare(a.updated))
      .slice(0, this.boot ? 120 : 15);
    let enriched = 0;
    if (queue.length && this.#llmOk()) {
      await pool(queue, 6, async (e) => {
        const r = await enrich(e, this.log);
        if (!r) return;
        const before = e.ai?.fix_status;
        e.ai = r;
        enriched++;
        // KI liest einen Fix aus neuen Quellen heraus, den die strukturierten Daten noch nicht kennen
        if (["available", "partial"].includes(r.fix_status) && !["available", "partial"].includes(before || "") && before !== undefined)
          this.store.addEvent(e, now, "fix_available", r.fixed ? `Fix: ${r.fixed}` : "A fix was published");
        if (!e.fix_found_at && ["available", "partial"].includes(r.fix_status)) e.fix_found_at = now;
        this.store.dirty = true;
      });
    }
    if (enrichOnly && !enriched && !merged) return false;

    this.store.data.health = this.health;
    this.store.data.lastRun = this.last;
    this.#trackSpend();
    this.store.prune(now);
    this.store.save();
    const changed = this.publisher.publish(this.store, { now, health: this.health, llmUsd: this.store.data.llm?.usd || 0 });
    if (created || merged || enriched || changed)
      this.log(`Takt: ${created} neu, ${merged} zusammengeführt, ${enriched} erklärt, ${changed ? "veröffentlicht" : "unverändert"}`);
    this.boot = false;
    this.store.backfill = false;
    return changed;
  }

  async dedupe(now) {
    const candidates = this.store.entries
      .filter((e) => e.updated >= ago(7 * 86400) && e.kind !== "malware" && (e.id.startsWith("ZR-") || e.sources.some((s) => s.trust !== "official") || e.exploited.status === "yes"))
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 250);
    const rank = (e) => (e.id.startsWith("CVE-") ? 0 : e.id.startsWith("GHSA-") ? 1 : 2) * 1000 - e.sources.length;
    let merged = 0;
    for (const group of await findDuplicates(candidates, this.log)) {
      const entries = [...new Set(group.map((id) => this.store.find([id])).filter(Boolean))];
      if (entries.filter((e) => e.id.startsWith("CVE-")).length > 1) continue; // nie zwei CVEs verschmelzen
      entries.sort((a, b) => rank(a) - rank(b));
      for (const drop of entries.slice(1)) {
        this.store.absorb(entries[0], drop, now);
        merged++;
      }
    }
    return merged;
  }

  #llmOk() {
    this.#trackSpend();
    return llmAvailable() && this.store.data.llm.usd < this.dailyLlmUsd;
  }

  /** Tagesbudget für die KI: Kosten seit dem letzten Blick aufaddieren, um Mitternacht (UTC) neu. */
  #trackSpend() {
    const day = new Date().toISOString().slice(0, 10);
    const l = (this.store.data.llm ||= { day, usd: 0 });
    if (l.day !== day) Object.assign(l, { day, usd: 0 });
    const s = spent();
    l.usd = +(l.usd + s - (this.spentSeen || 0)).toFixed(4);
    this.spentSeen = s;
  }
}
