import { filterAdvisories, getAdvisories, SITE_URL } from "@/lib/data";

export const revalidate = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// /feed.xml            → Top
// /feed.xml?view=exploited|breaches|all|malware, &eco=npm
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "top";
  const eco = url.searchParams.get("eco") || undefined;
  const items = filterAdvisories(await getAdvisories(), { view, ecosystem: eco })
    .sort((a, b) => (b.first_seen || b.published).localeCompare(a.first_seen || a.published))
    .slice(0, 100);

  const body = items
    .map((a) => {
      const flags = [
        a.severity.toUpperCase(),
        a.exploited.status === "yes" ? "EXPLOITED" : a.exploited.status === "reported" ? "exploitation reported" : null,
        a.fix.status === "available" ? "fix available" : a.fix.status === "none" ? "NO FIX" : null,
      ].filter(Boolean);
      const desc = [
        a.summary,
        a.why && `Why it matters: ${a.why}`,
        a.fix.text && `Fix: ${a.fix.text}`,
        a.action && `Action: ${a.action}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return `<item>
<title>${esc(`[${flags.join(" · ")}] ${a.title}`)}</title>
<link>${SITE_URL}/v/${encodeURIComponent(a.id)}</link>
<guid isPermaLink="false">${esc(a.id)}</guid>
<pubDate>${new Date(a.first_seen || a.published).toUTCString()}</pubDate>
<category>${esc(a.kind)}</category>
<description>${esc(desc || a.title)}</description>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Zero Radar${view !== "top" ? ` — ${esc(view)}` : ""}</title>
<link>${SITE_URL}</link>
<atom:link href="${esc(url.href)}" rel="self" type="application/rss+xml"/>
<description>New critical vulnerabilities, exploited bugs, malicious packages and data breaches — checked every 5 minutes.</description>
<ttl>5</ttl>
${body}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
