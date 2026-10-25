import Link from "next/link";
import { filterAdvisories, getAdvisories, getMeta } from "@/lib/data";
import { AdvisoryCard } from "@/components/ui";
import { RelTime } from "@/components/reltime";

const VIEWS = [
  { id: "top", label: "Top" },
  { id: "exploited", label: "Exploited" },
  { id: "breaches", label: "Breaches & incidents" },
  { id: "all", label: "All vulns" },
  { id: "malware", label: "Malicious packages" },
];
const PAGE = 60;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.id === sp.view) ? sp.view! : "top";
  const [all, meta] = await Promise.all([getAdvisories(), getMeta()]);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.id, filterAdvisories(all, { view: v.id }).length]));
  const list = filterAdvisories(all, { view, search: sp.q, ecosystem: sp.eco, sort: sp.sort });
  const page = Math.max(1, Number(sp.page) || 1);
  const shown = list.slice(0, page * PAGE);
  const stale = Date.now() - Date.parse(meta.checked_at) > 20 * 60e3;
  const failing = Object.entries(meta.sources).filter(([, s]) => !s.ok).map(([k]) => k);
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ view, q: sp.q, eco: sp.eco, sort: sp.sort, ...p }).filter(([, v]) => v) as [string, string][]);
    if (q.get("view") === "top") q.delete("view");
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <main className="wrap">
      <section className="hero">
        <h1>Security flaws &amp; leaks, the moment they surface.</h1>
        <p>
          Zero Radar checks advisory databases, vendor bulletins, security mailing lists and the community every five
          minutes, and turns every new critical bug, exploited flaw, malicious package and data breach into a short,
          actionable briefing — before the newsletters do.
        </p>
        <div className="status">
          <span className={`pulse${stale ? " stale" : ""}`} />
          <span>
            {stale ? "delayed" : "live"} · last check <RelTime iso={meta.checked_at} /> · {meta.counts.total} tracked
            {failing.length > 0 && ` · ${failing.join(", ")} unreachable`}
          </span>
        </div>
      </section>

      <div className="filters">
        {VIEWS.map((v) => (
          <Link key={v.id} href={href({ view: v.id, page: undefined })} className={`tab${v.id === view ? " on" : ""}`}>
            {v.label}
            <span className="n">{counts[v.id]}</span>
          </Link>
        ))}
        <form className="search" action="/">
          {view !== "top" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={sp.q} placeholder="Search CVE, package, product…" aria-label="Search" />
        </form>
      </div>

      {view === "top" && (
        <div className="sortline">
          Sort:{" "}
          <Link href={href({ sort: undefined, page: undefined })} className={sp.sort !== "new" ? "on" : ""}>
            most relevant
          </Link>{" "}
          ·{" "}
          <Link href={href({ sort: "new", page: undefined })} className={sp.sort === "new" ? "on" : ""}>
            newest
          </Link>
        </div>
      )}
      <div className="list">
        {shown.map((a) => (
          <AdvisoryCard key={a.id} a={a} />
        ))}
        {shown.length === 0 && <div className="empty">Nothing here{sp.q ? ` for “${sp.q}”` : ""}.</div>}
        {list.length > shown.length && (
          <Link className="tab" style={{ alignSelf: "center" }} href={href({ page: String(page + 1) })}>
            Show more ({list.length - shown.length})
          </Link>
        )}
      </div>
    </main>
  );
}
