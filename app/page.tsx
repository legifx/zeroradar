import Link from "next/link";
import { filterEntries, getEntries, getMeta, hotness, type Entry } from "@/lib/data";
import { EntryRow } from "@/components/ui";
import { LiveBar } from "@/components/live";

const VIEWS = [
  { key: "top", label: "Top", help: "Critical, exploited or widely relevant." },
  { key: "exploited", label: "Exploited", help: "Attackers already use these. If you run the software, start here." },
  { key: "unpatched", label: "No fix known", help: "No source lists a fixed version yet. Entries update when one appears." },
  { key: "fixes", label: "New fixes", help: "Patched versions, newest first. Many came out after the flaw was known." },
  { key: "breaches", label: "Leaks", help: "Data breaches and security incidents at companies and services." },
  { key: "malware", label: "Malware", help: "Malicious packages on npm, PyPI and others. Installed one? Remove it and rotate your secrets." },
  { key: "all", label: "All", help: "Every vulnerability from the last 7 days, including minor ones." },
] as const;

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function dayLabel(iso: string, now: number) {
  const d = iso.slice(0, 10);
  const label = DAY.format(new Date(iso));
  if (d === new Date(now).toISOString().slice(0, 10)) return `Today, ${label}`;
  if (d === new Date(now - 864e5).toISOString().slice(0, 10)) return `Yesterday, ${label}`;
  return label;
}

function byDay(list: Entry[], when: (a: Entry) => string, now: number) {
  const groups: { label: string; items: Entry[] }[] = [];
  for (const a of list) {
    const label = dayLabel(when(a), now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(a);
  }
  return groups;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view) || VIEWS[0];
  const q = sp.q?.trim().slice(0, 80) || "";
  const limit = Math.min(Number(sp.n) || 60, 500);
  const [all, meta] = await Promise.all([getEntries(), getMeta()]);
  const now = Date.now();

  const count = Object.fromEntries(VIEWS.map((v) => [v.key, filterEntries(all, { view: v.key }).length]));
  const list = filterEntries(all, { view: q && view.key === "top" ? "everything" : view.key, search: q || undefined });
  const when = (a: Entry) => (view.key === "fixes" ? a.fix.since : null) || a.first_seen || a.published;

  // "Top": die drei mit dem höchsten Risiko gerade jetzt oben, darunter alles chronologisch
  let lead: Entry[] = [];
  let rest = list;
  if (view.key === "top" && !q) {
    lead = [...list].sort((a, b) => hotness(b, now) - hotness(a, now)).slice(0, 3);
    const ids = new Set(lead.map((a) => a.id));
    rest = list.filter((a) => !ids.has(a.id));
  }
  if (view.key !== "fixes") rest = [...rest].sort((a, b) => when(b).localeCompare(when(a)));
  const shown = rest.slice(0, limit);
  const rich = view.key !== "all" && view.key !== "malware";
  const href = (v: string) => (v === "top" ? "/" : `/?view=${v}`);
  const sources = Object.values(meta.sources);

  return (
    <main className="wrap feed">
      <LiveBar
        initial={{
          checked_at: meta.checked_at,
          data_changed_at: meta.data_changed_at,
          sources: { total: sources.length, ok: sources.filter((s) => s.ok).length },
        }}
      />
      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href(v.key)} aria-current={v.key === view.key ? "page" : undefined}>
            {v.label} <span className="c">{count[v.key]}</span>
          </Link>
        ))}
      </nav>
      <form className="search" action="/" role="search">
        {view.key !== "top" && <input type="hidden" name="view" value={view.key} />}
        <label htmlFor="q" className="sr">
          Search
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Product, package or CVE, e.g. gitlab, next, CVE-2026-…" />
        <button type="submit">Search</button>
      </form>
      <p className="legend">
        {q ? `${list.length} results for “${q}”. ` : `${view.help} `}
        <span className="s-exp">▲</span> exploited: attackers already use it. <span className="s-fix">✓</span> fixed: a patched
        version exists. Sources: independent publishers reporting it. <Link href="/about">How we rate</Link>
      </p>

      {lead.length > 0 && (
        <section>
          <h2 className="day">Highest risk right now</h2>
          <ol className="rows">
            {lead.map((a) => (
              <EntryRow key={a.id} a={a} when={when(a)} />
            ))}
          </ol>
        </section>
      )}

      {shown.length === 0 && <p className="empty">Nothing here right now.</p>}
      {byDay(shown, when, now).map((g) => (
        <section key={g.label}>
          <h2 className="day">
            {g.label} <span>UTC</span>
          </h2>
          <ol className="rows">
            {g.items.map((a) => (
              <EntryRow key={a.id} a={a} when={when(a)} rich={rich} />
            ))}
          </ol>
        </section>
      ))}
      {rest.length > shown.length && (
        <Link
          className="more"
          href={`/?${new URLSearchParams({ ...(view.key !== "top" ? { view: view.key } : {}), ...(q ? { q } : {}), n: String(limit + 100) })}`}
          scroll={false}
        >
          Show {Math.min(100, rest.length - shown.length)} more
        </Link>
      )}
    </main>
  );
}
