// Die Pipeline (daemon.mjs) meldet hier jede Datenänderung → Tag "zr" sofort ungültig,
// der nächste Seitenaufruf lädt frisch vom Lese-Server.
import { revalidateTag } from "next/cache";
import { TAG } from "@/lib/data";

export async function POST(req: Request) {
  const secret = process.env.ZR_REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-zr-secret") !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  revalidateTag(TAG, { expire: 0 });
  return Response.json({ ok: true, at: new Date().toISOString() });
}
