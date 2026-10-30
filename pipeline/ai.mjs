// KI-Schritte: (1) Triage roher Meldungen, (2) Kurzbewertung pro Eintrag.
// Regel für beide Prompts: nur aus dem gelieferten Material, nichts erfinden.
import crypto from "node:crypto";
import { askJson, llmAvailable, MODEL } from "./lib/llm.mjs";

const TRIAGE_SYSTEM = `You triage security news for developers and ops teams. Answer ONLY with JSON.
Decide whether the item reports a NEW, concrete security problem (vulnerability, exploited bug, supply-chain compromise, malicious package, data breach/leak, compromised service) that developers or server admins may need to act on.
Not relevant: opinion pieces, product marketing, funding news, generic tips, conference talks, arrests, policy, old incidents without new facts, routine non-security releases.
If it matches one of the KNOWN ENTRIES (same vulnerability or same incident), return its id in match_id.
Schema: {"relevant":bool,"match_id":string|null,"kind":"vuln"|"breach"|"incident"|"malware","severity":"critical"|"high"|"medium"|"low"|"unknown","title":string (max 90 chars, neutral, names product + problem),"cves":[string],"exploited":"yes"|"reported"|"no-known"|"unknown"}`;

const ENRICH_SYSTEM = `You write security briefings that a developer AND a less technical IT person can understand. Answer ONLY with JSON.
Use ONLY facts from the provided material. If something is not stated, use null or "unknown" — never guess versions, numbers, exploitation or fixes.
Newer sources override older ones: if a later source announces a fix or patched version, the fix is available.
Schema: {
 "title": string (max 80 chars, product + problem in plain words, no hype, no CVE id),
 "plain": string (1-2 short sentences for non-experts: what can go wrong, avoid jargon or explain it in passing),
 "summary": string (1-2 sentences, technical: what is affected and what the flaw/incident is),
 "why": string (1-2 sentences: concrete impact and who is at risk),
 "who": string (one sentence starting with "You are affected if" — concrete products, versions, configurations),
 "affected": string|null (compact list of affected products/versions),
 "fixed": string|null (fixed versions or official mitigation; null if none mentioned),
 "fix_status": "available"|"partial"|"none"|"unknown",
 "exploited": "yes"|"reported"|"no-known"|"unknown",
 "exploited_note": string|null (who reports exploitation, if stated),
 "steps": [string] (2-4 short imperative steps, most important first, e.g. "Update PHP to 8.4.27 or later"),
 "action": string (the single most important step, one sentence),
 "flow": {
   "steps": [{"icon": "attacker"|"internet"|"browser"|"user"|"email"|"package"|"ci"|"repo"|"app"|"server"|"database"|"cloud"|"device"|"network"|"key"|"data"|"malware",
              "label": string (max 4 words), "note": string (max 10 words)}],
   "outcome": string (max 8 words, the end result, e.g. "Attacker controls the server")
 } (3-5 steps showing how the attack or incident unfolds, left to right; null if the material does not explain it)
}`;

/** fn über items mit begrenzter Parallelität; Ergebnisse in Eingangsreihenfolge. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function triage(items, recentEntries, log, cap) {
  if (!llmAvailable()) return items.map(() => null);
  const known = recentEntries
    .slice(0, 80)
    .map((e) => `${e.id} | ${e.ai?.title || e.title}`)
    .join("\n");
  return pool(items, 8, async (it, i) => {
    if (i >= cap) return null;
    try {
      return await askJson(
        TRIAGE_SYSTEM,
        `KNOWN ENTRIES:\n${known || "(none)"}\n\nITEM (${it.feedName}, ${it.published}):\nTitle: ${it.title}\nURL: ${it.url}\n${it.text.slice(0, 1800)}`,
        { maxTokens: 600, tag: "triage" },
      );
    } catch (err) {
      log(`triage: ${err.message}`);
      return null;
    }
  });
}

const DEDUPE_SYSTEM = `You group security entries that describe the SAME vulnerability or the SAME incident (e.g. several news articles about one supply-chain attack, or a news item about exploitation of a CVE that is listed separately).
Different CVEs in the same product are NOT duplicates unless one article covers them as one issue AND one of the entries has no CVE id. Be conservative: only group when clearly the same.
Answer ONLY with JSON: {"groups":[["ID1","ID2"],...]} — empty list if none.`;

/** Liefert Gruppen von IDs, die denselben Vorfall beschreiben. */
export async function findDuplicates(entries, log) {
  if (!llmAvailable() || entries.length < 2) return [];
  const list = entries.map((e) => `${e.id} | ${e.kind} | ${(e.ai?.title || e.title || "").slice(0, 140)}`).join("\n");
  try {
    const r = await askJson(DEDUPE_SYSTEM, `ENTRIES:\n${list}`, { maxTokens: 6000, effort: "low", tag: "dedupe" });
    return (r?.groups || []).filter((g) => Array.isArray(g) && g.length > 1);
  } catch (err) {
    log(`dedupe: ${err.message}`);
    return [];
  }
}

export const enrichHash = (e) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify([e.sources.map((s) => s.url).sort(), e.exploited.status, e.products.length, e.products.filter((p) => p.fixed).length, 2]))
    .digest("hex")
    .slice(0, 12);

/** Strukturierter Stand (Ausnutzung, Pakete, Fixes); ändert er sich, wird sofort neu bewertet. */
export const enrichState = (e) => JSON.stringify([e.exploited.status, e.products.length, e.products.filter((p) => p.fixed).length]);

export async function enrich(entry, log) {
  const products = entry.products
    .slice(0, 12)
    .map((p) => `${p.ecosystem || "?"}/${p.name}: vulnerable ${p.vulnerable || "?"}, fixed ${p.fixed || "?"}`)
    .join("\n");
  const material =
    `ID: ${entry.id} (${entry.aliases.join(", ")})\nKind: ${entry.kind}\nSeverity: ${entry.severity}` +
    (entry.cvss ? ` (CVSS ${entry.cvss})` : "") +
    `\nExploitation (structured): ${entry.exploited.status}${entry.exploited.note ? ` - ${entry.exploited.note}` : ""}` +
    `\nSources (oldest first): ${[...entry.sources].sort((a, b) => (a.at || "").localeCompare(b.at || "")).map((s) => `${s.name} [${s.trust}] ${s.at?.slice(0, 16) || ""}`).join("; ")}` +
    (products ? `\nPackages:\n${products}` : "") +
    `\n\nMaterial:\n${entry.text.slice(0, 6000)}`;
  try {
    const r = await askJson(ENRICH_SYSTEM, material, { maxTokens: 2000, tag: "enrich" });
    return r && { ...r, model: MODEL, hash: enrichHash(entry), state: enrichState(entry), at: new Date().toISOString() };
  } catch (err) {
    log(`enrich ${entry.id}: ${err.message}`);
    return null;
  }
}
