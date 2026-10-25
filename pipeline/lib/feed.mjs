// Minimaler RSS/Atom-Parser ohne Abhängigkeiten. Reicht für Hersteller-Feeds und Mailinglisten.

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");

export const stripHtml = (s) =>
  decode(decode(s || ""))
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

function atomLink(block) {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return (alt || any || [])[1] || "";
}

export function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  for (const block of xml.match(re) || []) {
    const title = stripHtml(tag(block, "title"));
    const link = isAtom ? atomLink(block) : stripHtml(tag(block, "link")) || tag(block, "guid");
    const date =
      tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    const body = stripHtml(
      tag(block, "content:encoded") || tag(block, "content") || tag(block, "summary") || tag(block, "description"),
    );
    const at = date ? new Date(date) : null;
    items.push({
      title,
      url: link.trim(),
      published: at && !isNaN(at) ? at.toISOString() : null,
      text: body.slice(0, 4000),
    });
  }
  return items;
}
