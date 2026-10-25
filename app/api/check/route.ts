import { check } from "@/lib/check";

// POST /api/check  {"packages":[{"ecosystem":"npm","name":"next","version":"16.2.9"}]}
// Gleicht Pakete gegen alle Einträge auf dem Radar ab (auch Malware-Pakete).
export async function POST(req: Request) {
  let body: { packages?: { ecosystem: string; name: string; version?: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const packages = (body.packages || []).filter((p) => p && p.name && p.ecosystem).slice(0, 5000);
  if (!packages.length) return Response.json({ error: "packages[] with ecosystem + name required" }, { status: 400 });
  return Response.json(await check(packages));
}
