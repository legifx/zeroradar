import { filterAdvisories, getAdvisories, getMeta } from "@/lib/data";

export const revalidate = 60;

// GET /api/advisories?view=top|exploited|breaches|all|malware|everything&since=ISO&eco=npm&q=php&limit=50
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const [all, meta] = await Promise.all([getAdvisories(), getMeta()]);
  const items = filterAdvisories(all, {
    view: p.get("view") || "top",
    since: p.get("since") || undefined,
    ecosystem: p.get("eco") || undefined,
    search: p.get("q") || undefined,
    limit: Math.min(Number(p.get("limit")) || 200, 1000),
  });
  return Response.json({ checked_at: meta.checked_at, count: items.length, items });
}
