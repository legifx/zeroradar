import { getMeta } from "@/lib/data";

// Kleiner Zustand für die Live-Leiste im Browser (zuletzt geprüft, letzte Datenänderung, Quellen).
export async function GET() {
  const m = await getMeta();
  const sources = Object.values(m.sources);
  return Response.json(
    {
      checked_at: m.checked_at,
      data_changed_at: m.data_changed_at,
      counts: m.counts,
      sources: { total: sources.length, ok: sources.filter((s) => s.ok).length },
    },
    { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } },
  );
}
