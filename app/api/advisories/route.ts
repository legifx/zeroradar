import { filterEntries, getEntries, getMeta } from "@/lib/data";

// GET /api/advisories?view=top|exploited|unpatched|fixes|breaches|all|malware|everything&since=ISO&eco=npm&q=php&limit=50
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const [all, meta] = await Promise.all([getEntries(), getMeta()]);
  const items = filterEntries(all, {
    view: p.get("view") || "top",
    since: p.get("since") || undefined,
    ecosystem: p.get("eco") || undefined,
    search: p.get("q") || undefined,
    limit: Math.min(Number(p.get("limit")) || 200, 1000),
  });
  return Response.json({ checked_at: meta.checked_at, data_changed_at: meta.data_changed_at, count: items.length, items });
}
