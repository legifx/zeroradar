// KI-Schritte: (1) Triage roher Meldungen, (2) Kurzbewertung pro Eintrag.
// Regel für beide Prompts: nur aus dem gelieferten Material, nichts erfinden.
import crypto from "node:crypto";
import { askJson, llmAvailable, MODEL } from "./lib/llm.mjs";

const TRIAGE_SYSTEM = `You triage security news for developers and ops teams. Answer ONLY with JSON.
Decide whether the item reports a NEW, concrete security problem (vulnerability, exploited bug, supply-chain compromise, malicious package, data breach/leak, compromised service) that developers or server admins may need to act on.
Not relevant: opinion pieces, product marketing, funding news, generic tips, conference talks, arrests, policy, old incidents without new facts, routine non-security releases.
If it matches one of the KNOWN ENTRIES (same vulnerability or same incident), return its id in match_id.
Schema: {"relevant":bool,"match_id":string|null,"kind":"vuln"|"breach"|"incident"|"malware","severity":"critical"|"high"|"medium"|"low"|"unknown","title":string (max 90 chars, neutral, names product + problem),"cves":[string],"exploited":"yes"|"reported"|"no-known"|"unknown"}`;

const ENRICH_SYSTEM = `You write short, precise security briefings for developers. Answer ONLY with JSON.
Use ONLY facts from the provided material. If something is not stated, use null or "unknown" — never guess versions, numbers or exploitation status.
Schema: {
 "title": string (max 90 chars, product + problem, no hype),
 "summary": string (1-2 sentences: what is affected and what the flaw/incident is),
 "why": string (1-2 sentences: concrete impact, e.g. unauthenticated RCE, data exposed, who is at risk),
 "affected": string|null (products/versions affected, compact),
 "fixed": string|null (fixed versions or mitigation; null if no fix mentioned),
 "fix_status": "available"|"partial"|"none"|"unknown",
 "exploited": "yes"|"reported"|"no-known"|"unknown",
 "exploited_note": string|null (who reports exploitation, if stated),
 "action": string (one imperative sentence: what to do now)
}`;

export async function triage(items, recentEntries, log, cap) {
  if (!llmAvailable()) return items.map(() => null);
  const known = recentEntries
    .slice(0, 80)
    .map((e) => `${e.id} | ${e.ai?.title || e.title}`)
    .join("\n");
  const out = [];
  for (const [i, it] of items.entries()) {
    if (i >= cap) { out.push(null); continue; }
    try {
      out.push(
        await askJson(
          TRIAGE_SYSTEM,
          `KNOWN ENTRIES:\n${known || "(none)"}\n\nITEM (${it.feedName}, ${it.published}):\nTitle: ${it.title}\nURL: ${it.url}\n${it.text.slice(0, 1800)}`,
          { maxTokens: 300 },
        ),
      );
    } catch (err) {
      log(`triage: ${err.message}`);
      out.push(null);
    }
  }
  return out;
}

export const enrichHash = (e) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify([e.sources.map((s) => s.url).sort(), e.exploited.status, e.products.length]))
    .digest("hex")
    .slice(0, 12);

export async function enrich(entry, log) {
  const products = entry.products
    .slice(0, 12)
    .map((p) => `${p.ecosystem || "?"}/${p.name}: vulnerable ${p.vulnerable || "?"}, fixed ${p.fixed || "?"}`)
    .join("\n");
  const material =
    `ID: ${entry.id} (${entry.aliases.join(", ")})\nKind: ${entry.kind}\nSeverity: ${entry.severity}` +
    (entry.cvss ? ` (CVSS ${entry.cvss})` : "") +
    `\nExploitation (structured): ${entry.exploited.status}${entry.exploited.note ? ` - ${entry.exploited.note}` : ""}` +
    `\nSources: ${entry.sources.map((s) => s.name).join(", ")}` +
    (products ? `\nPackages:\n${products}` : "") +
    `\n\nMaterial:\n${entry.text.slice(0, 6000)}`;
  try {
    const r = await askJson(ENRICH_SYSTEM, material);
    return r && { ...r, model: MODEL, hash: enrichHash(entry) };
  } catch (err) {
    log(`enrich ${entry.id}: ${err.message}`);
    return null;
  }
}
