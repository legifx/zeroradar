// Datenzugriff für Seiten, RSS, API und MCP. Quelle ist der Lese-Server der Pipeline auf dem
// Homeserver (ZR_DATA_URL, via Tailscale Funnel). Die Pipeline meldet jede Änderung an
// /api/revalidate → Tag "zr" wird sofort ungültig. Lokal: ZR_LOCAL_DATA=1 liest var/public/v1.
import fs from "node:fs/promises";
import path from "node:path";

export type Severity = "critical" | "high" | "medium" | "low" | "unknown";
export type Kind = "vuln" | "breach" | "incident" | "malware";
export type ExploitStatus = "yes" | "reported" | "no-known" | "unknown";
export type FixStatus = "available" | "partial" | "none" | "unknown";
export type Confidence = "confirmed" | "corroborated" | "single" | "unverified";
export type FlowStep = { icon: string; label: string; note?: string };
export type Flow = { steps: FlowStep[]; outcome?: string };

export type Entry = {
  id: string;
  aliases: string[];
  kind: Kind;
  top: boolean;
  score: number;
  title: string;
  plain: string | null;
  severity: Severity;
  cvss: number | null;
  epss: number | null;
  published: string;
  first_seen: string | null;
  updated: string;
  exploited: { status: ExploitStatus; since?: string; by?: string[]; note?: string };
  fix: { status: FixStatus; text: string | null; since: string | null };
  confidence: { level: Confidence; publishers: number };
  eco: string[];
  names: string[];
  hn: number;
  flow?: Flow;
};

export type Source = { name: string; url: string; at?: string; title?: string; trust: "official" | "research" | "press" | "community" };
export type Detail = Entry & {
  summary: string | null;
  why: string | null;
  who: string | null;
  affected: string | null;
  steps: string[];
  action: string | null;
  flow: Flow | null;
  products: { ecosystem?: string; name: string; vulnerable?: string | null; fixed?: string | null }[];
  sources: Source[];
  exploit_claims: { name: string; trust: string; at: string; status: string; note?: string }[];
  events: { at: string; type: string; text: string; source?: { name: string; url: string } }[];
  ai: boolean;
  model?: string | null;
};
export type Meta = {
  checked_at: string;
  data_changed_at: string;
  counts: { total: number; top: number };
  sources: Record<string, { ok: boolean; at?: string; items?: number; error?: string }>;
};

export const SITE_URL = process.env.ZR_SITE_URL || "https://zeroradar.vercel.app";
export const SYNAGY_URL = "https://synagy.org/?utm_source=zeroradar&utm_medium=footer";
const DATA_URL = process.env.ZR_DATA_URL || "https://jlhome6353.tail8a7388.ts.net/zeroradar/v1";
export const TAG = "zr";

const fileId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, "_");

async function load<T>(rel: string): Promise<T | null> {
  if (process.env.ZR_LOCAL_DATA) {
    try {
      return JSON.parse(await fs.readFile(path.join(process.cwd(), "var/public/v1", rel), "utf8"));
    } catch {
      return null;
    }
  }
  const res = await fetch(`${DATA_URL}/${rel}`, { next: { revalidate: 300, tags: [TAG] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`data ${rel}: HTTP ${res.status}`);
  return res.json();
}

/** Kompakten Index (Standardwerte weggelassen) wieder vollständig machen. */
function normalize(x: Partial<Entry> & { id: string }): Entry {
  return {
    aliases: [],
    top: false,
    score: 0,
    plain: null,
    cvss: null,
    epss: null,
    first_seen: null,
    eco: [],
    names: [],
    hn: 0,
    kind: "vuln",
    severity: "unknown",
    title: x.id,
    published: x.updated || new Date(0).toISOString(),
    updated: x.published || new Date(0).toISOString(),
    ...x,
    exploited: { status: "unknown", ...(x.exploited || {}) },
    fix: { status: "unknown", text: null, since: null, ...(x.fix || {}) },
    confidence: x.confidence || { level: "single", publishers: 1 },
  };
}

export async function getEntries(): Promise<Entry[]> {
  const j = await load<{ entries: Entry[] }>("index.json");
  return (j?.entries || []).map(normalize);
}

export async function getMeta(): Promise<Meta> {
  return (await load<Meta>("meta.json")) || { checked_at: new Date(0).toISOString(), data_changed_at: "", counts: { total: 0, top: 0 }, sources: {} };
}

export async function getDetail(id: string): Promise<Detail | null> {
  const want = id.toUpperCase();
  const entry = (await getEntries()).find((a) => a.id.toUpperCase() === want || a.aliases.some((x) => x.toUpperCase() === want));
  if (!entry) return null;
  const d = await load<Detail>(`e/${fileId(entry.id)}.json`);
  return d ? (normalize(d) as Detail) : null;
}

export type PackageRow = [id: string, ecosystem: string, name: string, vulnerable: string | null, fixed: string | null];
export async function getPackages(): Promise<PackageRow[]> {
  return (await load<{ rows: PackageRow[] }>("packages.json"))?.rows || [];
}

// ---------- Filter & Sortierung (Seite, RSS, API, MCP) ----------
export type View = "top" | "exploited" | "unpatched" | "fixes" | "breaches" | "all" | "malware" | "everything";

export function filterEntries(
  list: Entry[],
  q: { view?: string; since?: string; ecosystem?: string; search?: string; limit?: number; sort?: string },
) {
  let out = list;
  const view = (q.view || "top") as View;
  switch (view) {
    case "all":
      out = out.filter((a) => a.kind !== "malware");
      break;
    case "exploited":
      out = out.filter((a) => a.exploited.status === "yes" || a.exploited.status === "reported");
      break;
    case "unpatched":
      out = out.filter((a) => a.top && a.kind === "vuln" && (a.fix.status === "none" || a.fix.status === "unknown"));
      break;
    case "fixes":
      out = out.filter((a) => a.fix.since && (a.fix.status === "available" || a.fix.status === "partial"));
      break;
    case "breaches":
      out = out.filter((a) => a.kind === "breach" || a.kind === "incident");
      break;
    case "malware":
      out = out.filter((a) => a.kind === "malware");
      break;
    case "everything":
      break;
    default:
      out = out.filter((a) => a.top);
  }
  if (q.since) out = out.filter((a) => (a.first_seen || a.published) >= q.since! || a.updated >= q.since!);
  if (q.ecosystem) {
    const e = q.ecosystem.toLowerCase();
    out = out.filter((a) => a.eco.some((x) => x.toLowerCase() === e));
  }
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((a) => [a.id, ...a.aliases, a.title, a.plain || "", ...a.names].some((x) => x.toLowerCase().includes(s)));
  }
  if (view === "fixes") out = [...out].sort((a, b) => (b.fix.since || "").localeCompare(a.fix.since || ""));
  else if (view === "top" && q.sort !== "new") out = [...out].sort((a, b) => hotness(b) - hotness(a));
  return q.limit ? out.slice(0, q.limit) : out;
}

/** Relevanz mit Zeitverfall: Wichtiges bleibt ein paar Tage oben, Neues steigt schnell auf. */
export function hotness(a: Entry, now = Date.now()) {
  const ageH = Math.max(0, (now - Date.parse(a.first_seen || a.published)) / 3600e3);
  return (a.score ?? 0) / (1 + ageH / 48);
}

export const isFresh = (a: Entry, now = Date.now()) =>
  Boolean(a.first_seen) && now - Date.parse(a.first_seen!) < 6 * 3600e3 && now - Date.parse(a.published) < 48 * 3600e3;
