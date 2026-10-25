// Datenzugriff für Seiten und API. Die Pipeline schreibt auf den Branch "data";
// lokal (ZR_LOCAL_DATA=1) liest die Seite data/*.json direkt.
import fs from "node:fs/promises";
import path from "node:path";

export type Product = { ecosystem?: string; name: string; vulnerable?: string | null; fixed?: string | null };
export type Advisory = {
  id: string;
  aliases: string[];
  kind: "vuln" | "breach" | "incident" | "malware";
  top: boolean;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  cvss: number | null;
  epss: number | null;
  published: string;
  first_seen: string | null;
  updated: string;
  summary: string | null;
  why: string | null;
  affected: string | null;
  fix: { status: "available" | "partial" | "none" | "unknown"; text: string | null };
  action: string | null;
  exploited: { status: "yes" | "reported" | "no-known" | "unknown"; note?: string | null; since?: string };
  products: Product[];
  sources: { name: string; url: string; at?: string }[];
  hn_points: number;
  ai: boolean;
};
export type Meta = {
  checked_at: string;
  data_changed_at: string;
  counts: { total: number; top: number };
  sources: Record<string, { ok: boolean; items?: number; error?: string }>;
};

const REPO = process.env.ZR_REPO || "legifx/zeroradar";
export const REVALIDATE = 60;

async function load<T>(file: string): Promise<T> {
  if (process.env.ZR_LOCAL_DATA) {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", file), "utf8"));
  }
  const token = process.env.GITHUB_TOKEN;
  const url = token
    ? `https://api.github.com/repos/${REPO}/contents/${file}?ref=data`
    : `https://raw.githubusercontent.com/${REPO}/data/${file}`;
  const res = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}`, accept: "application/vnd.github.raw+json" } : {},
    next: { revalidate: REVALIDATE, tags: ["zr-data"] },
  });
  if (!res.ok) throw new Error(`data ${file}: HTTP ${res.status}`);
  return res.json();
}

export const getAdvisories = () => load<Advisory[]>("advisories.json");
export const getMeta = () => load<Meta>("meta.json");

export async function getAdvisory(id: string) {
  const all = await getAdvisories();
  const want = id.toUpperCase();
  return all.find((a) => a.id.toUpperCase() === want || a.aliases.some((x) => x.toUpperCase() === want)) || null;
}

export const SITE_URL = process.env.ZR_SITE_URL || "https://zeroradar.vercel.app";
export const SYNAGY_URL = "https://synagy.org/?utm_source=zeroradar&utm_medium=footer";

/** Filter, die Website, RSS, API und MCP gemeinsam nutzen. */
export function filterAdvisories(
  list: Advisory[],
  q: { view?: string; since?: string; ecosystem?: string; search?: string; limit?: number },
) {
  let out = list;
  switch (q.view) {
    case "all":
      out = out.filter((a) => a.kind !== "malware");
      break;
    case "exploited":
      out = out.filter((a) => a.exploited.status === "yes" || a.exploited.status === "reported");
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
    out = out.filter((a) => a.products.some((p) => p.ecosystem?.toLowerCase() === e));
  }
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((a) =>
      [a.id, ...a.aliases, a.title, a.summary || "", ...a.products.map((p) => p.name)].some((x) =>
        x.toLowerCase().includes(s),
      ),
    );
  }
  return q.limit ? out.slice(0, q.limit) : out;
}
