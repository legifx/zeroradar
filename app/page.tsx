import Link from "next/link";
import { filterEntries, getEntries, getMeta, hotness, type Entry } from "@/lib/data";
import { EntryCard } from "@/components/ui";
import { LiveBar } from "@/components/live";
import { Icon } from "@/components/icons";

const VIEWS = [
  { key: "top", label: "Most important", help: "Critical, exploited or widely relevant — ranked by importance and freshness." },
  { key: "exploited", label: "Being exploited", help: "Attackers already use these. If you run the affected software, act on these first." },
  { key: "unpatched", label: "No fix known", help: "Important flaws where no source lists a fixed version yet. Check the vendor before you assume you are safe — the entry updates as soon as a fix appears." },
  { key: "fixes", label: "New fixes", help: "A fixed version came out — newest first. Many arrived after the flaw was already known." },
  { key: "breaches", label: "Breaches", help: "Data leaks and security incidents at companies and services." },
  { key: "malware", label: "Malware", help: "Packages on npm, PyPI & co. that contain malware. If you installed one, remove it and rotate your secrets." },
  { key: "all", label: "Everything", help: "Every vulnerability from the last 7 days, including the less critical ones." },
] as const;

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function dayLabel(iso: string, now: number) {
  const d = iso.slice(0, 10);
  if (d === new Date(now).toISOString().slice(0, 10)) return "Today";
  if (d === new Date(now - 864e5).toISOString().slice(0, 10)) return "Yesterday";
  return DAY.format(new Date(iso));
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
  const limit = Math.min(Number(sp.n) || 50, 500);
  const [all, meta] = await Promise.all([getEntries(), getMeta()]);
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600e3).toISOString();

  const counts = {
    exploited: filterEntries(all, { view: "exploited" }).length,
    fresh: all.filter((a) => a.top && a.first_seen && a.first_seen >= ago(24)).length,
    fixes: all.filter((a) => a.fix.since && a.fix.since >= ago(24 * 7) && a.fix.status !== "none").length,
    unpatched: filterEntries(all, { view: "unpatched" }).length,
  };
  const viewCount = Object.fromEntries(VIEWS.map((v) => [v.key, filterEntries(all, { view: v.key }).length]));

  const list = filterEntries(all, { view: q && view.key === "top" ? "everything" : view.key, search: q || undefined });
  const when = (a: Entry) => (view.key === "fixes" ? a.fix.since : null) || a.first_seen || a.published;
  let lead: Entry[] = [];
  let rest = list;
  if (view.key === "top" && !q) {
    lead = [...list].sort((a, b) => hotness(b, now) - hotness(a, now)).slice(0, 3);
    const leadIds = new Set(lead.map((a) => a.id));
    rest = list.filter((a) => !leadIds.has(a.id));
  }
  if (view.key !== "fixes") rest = [...rest].sort((a, b) => when(b).localeCompare(when(a)));
  const shown = rest.slice(0, limit);
  const variant = view.key === "all" || view.key === "malware" ? "compact" : "normal";
  const href = (v: string) => (v === "top" ? "/" : `/?view=${v}`);

  const sources = Object.values(meta.sources);
  return (
    <main className="wrap">
      <LiveBar
        initial={{
          checked_at: meta.checked_at,
          data_changed_at: meta.data_changed_at,
          sources: { total: sources.length, ok: sources.filter((s) => s.ok).length },
        }}
      />
      <section className="intro">
        <h1>New security flaws and leaks, explained in plain words.</h1>
        <p>
          Zero Radar watches official advisories, security teams, researchers and the security press around the clock.
          Every entry says what happened, who is affected, whether attackers already use it and whether a fix exists.
        </p>
      </section>

      <nav className="tiles" aria-label="Overview">
        <Link className="tile t-crit" href="/?view=exploited" aria-current={view.key === "exploited" ? "page" : undefined}>
          <div className="n">{counts.exploited}</div>
          <div className="l">Being exploited</div>
          <div className="h">Attacks confirmed or reported</div>
        </Link>
        <Link className="tile" href="/" aria-current={view.key === "top" ? "page" : undefined}>
          <div className="n">{counts.fresh}</div>
          <div className="l">New in 24 hours</div>
          <div className="h">Important new entries</div>
        </Link>
        <Link className="tile t-ok" href="/?view=fixes" aria-current={view.key === "fixes" ? "page" : undefined}>
          <div className="n">{counts.fixes}</div>
          <div className="l">Fixes released</div>
          <div className="h">Patched versions in the last 7 days</div>
        </Link>
        <Link className="tile t-warn" href="/?view=unpatched" aria-current={view.key === "unpatched" ? "page" : undefined}>
          <div className="n">{counts.unpatched}</div>
          <div className="l">No fix known</div>
          <div className="h">Important flaws, no patched version listed</div>
        </Link>
      </nav>

      <div className="cols">
        <div>
          <nav className="views" aria-label="Views">
            {VIEWS.map((v) => (
              <Link key={v.key} href={href(v.key)} aria-current={v.key === view.key ? "page" : undefined}>
                {v.label}
                <span className="c">{viewCount[v.key]}</span>
              </Link>
            ))}
          </nav>
          <form className="search" action="/" role="search">
            {view.key !== "top" && <input type="hidden" name="view" value={view.key} />}
            <label htmlFor="q" className="sr">
              Search
            </label>
            <input id="q" name="q" defaultValue={q} placeholder="Search a product, package or CVE — e.g. gitlab, next, CVE-2026-…" />
            <button type="submit">Search</button>
          </form>
          <p className="viewhelp">{q ? `${list.length} results for “${q}”.` : view.help}</p>

          {lead.length > 0 && (
            <>
              <h2 className="section-h">Most important right now</h2>
              <div className="list">
                {lead.map((a, i) => (
                  <EntryCard key={a.id} a={a} variant={i === 0 ? "lead" : "normal"} />
                ))}
              </div>
              <h2 className="section-h">Latest</h2>
            </>
          )}

          {shown.length === 0 && <p className="empty">Nothing here right now.</p>}
          {byDay(shown, when, now).map((g) => (
            <section key={g.label}>
              <h3 className="day">{g.label}</h3>
              <div className="list">
                {g.items.map((a) => (
                  <EntryCard key={a.id} a={a} variant={variant} />
                ))}
              </div>
            </section>
          ))}
          {rest.length > shown.length && (
            <Link className="more" href={`/?${new URLSearchParams({ ...(view.key !== "top" ? { view: view.key } : {}), ...(q ? { q } : {}), n: String(limit + 100) })}`} scroll={false}>
              Show {Math.min(100, rest.length - shown.length)} more
            </Link>
          )}
        </div>

        <aside className="aside">
          <section className="box">
            <h2>How to read an entry</h2>
            <dl>
              <div>
                <dt>
                  <span className="sw" style={{ background: "var(--crit)" }} />
                  <span className="sw" style={{ background: "var(--high)" }} />
                  <span className="sw" style={{ background: "var(--med)" }} />
                  Severity
                </dt>
                <dd>Critical, high, medium or low — how much damage a successful attack can do.</dd>
              </div>
              <div>
                <dt style={{ color: "var(--crit)" }}>
                  <Icon name="alert" size={16} /> Exploited in the wild
                </dt>
                <dd>Confirmed by an official body like CISA or the vendor. “Attacks reported” means researchers or press report it.</dd>
              </div>
              <div>
                <dt style={{ color: "var(--ok)" }}>
                  <Icon name="check" size={16} /> Fix available
                </dt>
                <dd>A patched version exists. When a fix appears later, the entry is updated right away.</dd>
              </div>
              <div>
                <dt>
                  <Icon name="shield" size={16} /> Sources
                </dt>
                <dd>
                  How many independent publishers report it. Official sources and several reports agreeing are more reliable
                  than a single post.
                </dd>
              </div>
            </dl>
          </section>
          <section className="box">
            <h2>Words you will see</h2>
            <dl>
              <div>
                <dt>CVE</dt>
                <dd>The public ID of a vulnerability, like CVE-2026-12345.</dd>
              </div>
              <div>
                <dt>CVSS</dt>
                <dd>Severity score from 0 to 10. 9 and above is critical.</dd>
              </div>
              <div>
                <dt>EPSS</dt>
                <dd>Estimated chance that the flaw is exploited in the next 30 days.</dd>
              </div>
              <div>
                <dt>RCE</dt>
                <dd>Remote code execution — an attacker can run their own commands on your system.</dd>
              </div>
              <div>
                <dt>Supply-chain attack</dt>
                <dd>Attackers poison a library or tool that many others install.</dd>
              </div>
            </dl>
          </section>
          <section className="box">
            <h2>Get it where you work</h2>
            <ul>
              <li>
                <a href="/feed.xml">RSS feed</a> · <a href="/feed.xml?view=fixes">new fixes</a>
              </li>
              <li>
                <Link href="/integrate">MCP server for Claude Code &amp; co.</Link>
              </li>
              <li>
                <Link href="/integrate#skill">Skill that checks your lockfiles</Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
