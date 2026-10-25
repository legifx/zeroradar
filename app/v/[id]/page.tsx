import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdvisory } from "@/lib/data";
import { Badges, sevClass } from "@/components/ui";
import { RelTime } from "@/components/reltime";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getAdvisory(decodeURIComponent((await params).id));
  if (!a) return { title: "Not found" };
  return { title: `${a.id}: ${a.title}`, description: a.summary || a.title };
}

const EXPLOIT_TEXT = {
  yes: "Yes — confirmed exploitation in the wild",
  reported: "Reported — exploitation reported, not yet confirmed by CISA KEV",
  "no-known": "No known exploitation so far",
  unknown: "Unknown — no exploitation information in the sources yet",
};
const FIX_TEXT = { available: "Fixed version available", partial: "Partially fixed", none: "No fix yet", unknown: "Unknown" };

export default async function Detail({ params }: Props) {
  const a = await getAdvisory(decodeURIComponent((await params).id));
  if (!a) notFound();
  const fixedPkgs = a.products.filter((p) => p.fixed);

  return (
    <main className={`wrap detail ${sevClass(a)}`}>
      <Link href="/" className="note">
        ← back to the radar
      </Link>
      <div className="meta" style={{ marginTop: 18 }}>
        <b>{a.id}</b>
        {a.aliases.slice(0, 4).map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <h1>{a.title}</h1>
      <Badges a={a} />

      <div className="grid">
        <div className="cell">
          <div className="k">Disclosed</div>
          <div className="v">
            <RelTime iso={a.published} />
          </div>
        </div>
        <div className="cell">
          <div className="k">Picked up by Zero Radar</div>
          <div className="v">{a.first_seen ? <RelTime iso={a.first_seen} /> : "before launch"}</div>
        </div>
        <div className="cell">
          <div className="k">Severity</div>
          <div className="v">
            {a.severity}
            {a.cvss != null && ` · CVSS ${a.cvss}`}
          </div>
        </div>
        <div className="cell">
          <div className="k">Exploit probability (EPSS)</div>
          <div className="v">{a.epss != null ? `${(a.epss * 100).toFixed(1)}% in 30 days` : "n/a"}</div>
        </div>
        <div className="cell">
          <div className="k">Last update</div>
          <div className="v">
            <RelTime iso={a.updated} />
          </div>
        </div>
      </div>

      {a.action && (
        <div className="sec action">
          <h3>What to do now</h3>
          <p>{a.action}</p>
        </div>
      )}
      {a.summary && (
        <div className="sec">
          <h3>What is it</h3>
          <p>{a.summary}</p>
        </div>
      )}
      {a.why && (
        <div className="sec">
          <h3>Why it is dangerous</h3>
          <p>{a.why}</p>
        </div>
      )}
      <div className="sec">
        <h3>Exploited in the wild?</h3>
        <p>
          {EXPLOIT_TEXT[a.exploited.status]}
          {a.exploited.note ? ` (${a.exploited.note})` : ""}
        </p>
      </div>
      <div className="sec">
        <h3>Fix</h3>
        <p>
          {FIX_TEXT[a.fix.status]}
          {a.fix.text ? `: ${a.fix.text}` : ""}
          {!a.fix.text && fixedPkgs.length > 0 && `: ${fixedPkgs.map((p) => `${p.name} ${p.fixed}`).join(", ")}`}
        </p>
        {a.affected && <p className="note" style={{ marginTop: 6 }}>Affected: {a.affected}</p>}
      </div>

      {a.products.length > 0 && (
        <div className="sec">
          <h3>Affected packages</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ecosystem</th>
                  <th>Package</th>
                  <th>Vulnerable</th>
                  <th>Fixed in</th>
                </tr>
              </thead>
              <tbody>
                {a.products.map((p, i) => (
                  <tr key={i}>
                    <td>{p.ecosystem || "—"}</td>
                    <td>
                      <code>{p.name}</code>
                    </td>
                    <td>
                      <code>{p.vulnerable || "?"}</code>
                    </td>
                    <td>
                      <code>{p.fixed || "—"}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sec sources">
        <h3>Sources</h3>
        <ul>
          {a.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener nofollow">
                {s.name}
              </a>
              {s.at && (
                <span className="note">
                  {" "}
                  · <RelTime iso={s.at} />
                </span>
              )}
            </li>
          ))}
        </ul>
        {a.ai && <p className="note">Briefing written by an AI model from the sources above — verify before acting.</p>}
      </div>

      <div className="sec">
        <h3>Am I affected?</h3>
        <p>
          Let your coding agent check your lockfiles against the radar: <Link href="/integrate">MCP server &amp; Claude Code skill →</Link>
        </p>
      </div>
    </main>
  );
}
