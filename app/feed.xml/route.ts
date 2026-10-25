import { filterEntries, getEntries, SITE_URL } from "@/lib/data";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// /feed.xml            → Top
// /feed.xml?view=exploited|unpatched|fixes|breaches|all|malware, &eco=npm
// view=fixes: ein Eintrag pro neu erschienenem Fix (eigene guid), damit Reader ihn als neu zeigen
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "top";
  const fixes = view === "fixes";
  const when = (a: { first_seen: string | null; published: string; fix: { since: string | null } }) =>
    fixes ? a.fix.since : a.first_seen || a.published;
  const eco = url.searchParams.get("eco") || undefined;
  const items = filterEntries(await getEntries(), { view, ecosystem: eco })
    .sort((a, b) => (when(b) || "").localeCompare(when(a) || ""))
    .slice(0, 100);

  const body = items
    .map((a) => {
      const flags = [
        a.severity.toUpperCase(),
        a.exploited.status === "yes" ? "EXPLOITED" : a.exploited.status === "reported" ? "exploitation reported" : null,
        a.fix.status === "available" ? "fix available" : a.fix.status === "none" ? "NO FIX" : null,
        a.confidence.publishers > 1 ? `${a.confidence.publishers} sources` : null,
      ].filter(Boolean);
      const desc = [
        a.plain,
        a.fix.text && `Fix: ${a.fix.text}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return `<item>
<title>${esc(`${fixes ? "FIX RELEASED · " : ""}[${flags.join(" · ")}] ${a.title}`)}</title>
<link>${SITE_URL}/v/${encodeURIComponent(a.id)}</link>
<guid isPermaLink="false">${esc(fixes ? `${a.id}#fix` : a.id)}</guid>
<pubDate>${new Date(when(a) || a.published).toUTCString()}</pubDate>
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
<description>New critical vulnerabilities, exploited bugs, malicious packages and data breaches — updated continuously from official advisories, CERTs, researchers and press.</description>
<ttl>2</ttl>
${body}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
