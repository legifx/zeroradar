// Unstrukturierte Quellen: Hersteller-Feeds, Mailinglisten, Fachpresse, Hacker News.
// Liefert rohe Meldungen; was davon ein Eintrag wird, entscheidet triage.mjs.
import { get, getJson } from "../lib/http.mjs";
import { parseFeed } from "../lib/feed.mjs";
import { FEEDS, HN_QUERIES, HN_MIN_POINTS, SECURITY_WORDS } from "../../config/feeds.mjs";

export const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;

export async function feeds({ since, log }) {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const items = parseFeed(await get(f.url, { headers: { "user-agent": "Mozilla/5.0 (zeroradar)" } }));
      return items
        .filter((it) => it.url && (!it.published || it.published >= since))
        .filter((it) => f.all || SECURITY_WORDS.test(`${it.title} ${it.text.slice(0, 600)}`))
        .slice(0, 60)
        .map((it) => ({ ...it, feed: f.id, feedName: f.name, tier: f.tier, published: it.published || new Date().toISOString() }));
    }),
  );
  const out = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out.push(...r.value);
    else log(`feed ${FEEDS[i].id}: ${r.reason?.message || r.reason}`);
  });
  return out;
}

export async function hackernews({ since, log }) {
  const ts = Math.floor(new Date(since).getTime() / 1000);
  const seen = new Set();
  const out = [];
  for (const q of HN_QUERIES) {
    try {
      const j = await getJson(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story` +
          `&numericFilters=created_at_i>${ts},points>=${HN_MIN_POINTS}&hitsPerPage=30`,
      );
      for (const h of j.hits || []) {
        if (seen.has(h.objectID) || !SECURITY_WORDS.test(h.title)) continue;
        seen.add(h.objectID);
        out.push({
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
          published: h.created_at,
          text: `${h.points} points, ${h.num_comments} comments on Hacker News`,
          feed: "hn",
          feedName: "Hacker News",
          tier: "news",
          points: h.points,
        });
      }
    } catch (err) {
      log(`hn "${q}": ${err.message}`);
    }
  }
  return out;
}

export const cvesIn = (s) => [...new Set((String(s).match(CVE_RE) || []).map((c) => c.toUpperCase()))];
