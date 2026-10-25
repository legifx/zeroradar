import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDetail, type Detail, type Source } from "@/lib/data";
import { Chips, FlowDiagram, KIND_WORD, SEV_WORD, confWord } from "@/components/ui";
import { Icon } from "@/components/icons";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getDetail(decodeURIComponent((await params).id));
  if (!a) return { title: "Not on the radar" };
  return { title: a.title, description: a.plain || a.summary || undefined };
}

const FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const fmt = (iso?: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? `${FMT.format(new Date(iso))} UTC` : "—");
function dur(ms: number) {
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

const TRUST: Record<Source["trust"], { title: string; help: string }> = {
  official: { title: "Official", help: "vendor, government CERT or advisory database" },
  research: { title: "Security researchers", help: "research teams and mailing lists" },
  press: { title: "Security press", help: "established security newsrooms" },
  community: { title: "Community", help: "discussion sites — treat with care" },
};

function Verdict({ a }: { a: Detail }) {
  const ex = a.exploited;
  const firstClaim = a.exploit_claims.find((c) => c.status === ex.status) || a.exploit_claims[0];
  const exploit =
    ex.status === "yes"
      ? { a: "Yes", c: "bad", x: `Confirmed by ${ex.by?.join(", ") || firstClaim?.name || "an official source"}${ex.since ? ` · ${fmt(ex.since).slice(0, 11)}` : ""}` }
      : ex.status === "reported"
        ? { a: "Reported", c: "warn", x: `By ${ex.by?.join(", ") || firstClaim?.name || "a source"} — not officially confirmed yet` }
        : ex.status === "no-known"
          ? { a: "Not known", c: "", x: "No attacks reported so far" }
          : { a: "Unclear", c: "", x: "No reports either way yet" };
  const fixable = a.kind === "vuln";
  const fix = !fixable
    ? { q: "What to do", a: a.kind === "malware" ? "Remove it" : "Check exposure", c: "warn", x: a.action || "See the steps below" }
    : a.fix.status === "available"
      ? { q: "Fix available?", a: "Yes", c: "good", x: a.fix.text || "Update to the latest version" }
      : a.fix.status === "partial"
        ? { q: "Fix available?", a: "Partly", c: "warn", x: a.fix.text || "Not for every affected version" }
        : a.fix.status === "none"
          ? { q: "Fix available?", a: "Not yet", c: "bad", x: "Use the workaround below until a patch ships" }
          : { q: "Fix available?", a: "Unclear", c: "", x: "No fixed version published in the sources yet" };
  return (
    <div className="verdict">
      <div>
        <div className="q">Severity</div>
        <div className={`a sev-${a.severity}`} style={{ color: "var(--sevc, var(--ink))" }}>
          {SEV_WORD[a.severity]}
        </div>
        <div className="x">{a.cvss != null ? `CVSS ${a.cvss} of 10` : KIND_WORD[a.kind]}</div>
      </div>
      <div>
        <div className="q">Being exploited?</div>
        <div className={`a ${exploit.c}`}>
          {exploit.c === "bad" && <Icon name="alert" size={17} />}
          {exploit.a}
        </div>
        <div className="x">{exploit.x}</div>
      </div>
      <div>
        <div className="q">{fix.q}</div>
        <div className={`a ${fix.c}`}>
          {fix.c === "good" && <Icon name="check" size={17} />}
          {fix.a}
        </div>
        <div className="x">
          {fix.x}
          {fixable && a.fix.since ? ` · since ${fmt(a.fix.since).slice(0, 11)}` : ""}
        </div>
      </div>
      <div>
        <div className="q">How sure is this?</div>
        <div className="a">{confWord(a.confidence)}</div>
        <div className="x">
          {a.confidence.level === "confirmed"
            ? "Backed by an official source"
            : a.confidence.level === "corroborated"
              ? "Several independent publishers agree"
              : "Only one publisher so far — may change"}
        </div>
      </div>
    </div>
  );
}

export default async function Page({ params }: Props) {
  const a = await getDetail(decodeURIComponent((await params).id));
  if (!a) notFound();
  const cve = a.id.startsWith("ZR-") ? a.aliases.find((x) => !x.startsWith("ZR-")) : a.id;
  const products = [...new Map(a.products.map((p) => [`${p.ecosystem}|${p.name}|${p.vulnerable}|${p.fixed}`, p])).values()];
  const steps = a.steps.length ? a.steps : a.action ? [a.action] : [];
  const lag = a.first_seen ? Date.parse(a.first_seen) - Date.parse(a.published) : null;
  const groups = (["official", "research", "press", "community"] as const)
    .map((t) => ({ t, items: a.sources.filter((s) => (s.trust || "press") === t) }))
    .filter((g) => g.items.length);

  return (
    <main className={`wrap detail sev-${a.severity}`}>
      <Link href="/" className="back">
        ← All threats
      </Link>
      <div className="d-eyebrow">
        <span className="sev">{SEV_WORD[a.severity]}</span>
        <span>{KIND_WORD[a.kind]}</span>
        {cve && <span className="mono">{cve}</span>}
        <span>updated {fmt(a.updated)}</span>
      </div>
      <h1>{a.title}</h1>
      {(a.plain || a.summary) && <p className="lede">{a.plain || a.summary}</p>}
      <Chips a={a} full />
      <Verdict a={a} />

      {a.flow && (
        <section className="sec">
          <h2>
            How the attack works <small>simplified</small>
          </h2>
          <FlowDiagram flow={a.flow} />
        </section>
      )}

      {(a.summary || a.why) && (
        <section className="sec prose">
          <h2>What happened</h2>
          {a.summary && a.summary !== a.plain && <p>{a.summary}</p>}
          {a.why && (
            <div className="callout bad">
              <strong>Why it is dangerous: </strong>
              {a.why}
            </div>
          )}
        </section>
      )}

      {(a.who || a.affected || products.length > 0) && (
        <section className="sec">
          <h2>Are you affected?</h2>
          {a.who && <p className="prose">{a.who}</p>}
          {a.affected && !products.length && <p className="prose">{a.affected}</p>}
          {products.length > 0 && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Package / product</th>
                    <th>Affected versions</th>
                    <th>Fixed in</th>
                  </tr>
                </thead>
                <tbody>
                  {products.slice(0, 40).map((p, i) => (
                    <tr key={i}>
                      <td>
                        <b>{p.name}</b>
                        {p.ecosystem && p.ecosystem !== "service" && <span className="muted"> · {p.ecosystem}</span>}
                      </td>
                      <td className="v">{p.vulnerable || "see advisory"}</td>
                      <td className={`v${p.fixed ? " ok" : ""}`}>{p.fixed || "no fix yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {steps.length > 0 && (
        <section className="sec">
          <h2>What to do</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="sec">
        <h2>Timeline</h2>
        <ol className="timeline">
          {a.events.map((e, i) => (
            <li key={i} className={`t-${e.type}`}>
              <div className="when">{fmt(e.at)}</div>
              <div className="what">
                {e.text}
                {e.source && (
                  <>
                    {" "}
                    — <a href={e.source.url} rel="noopener nofollow" target="_blank">{e.source.name}</a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sec">
        <h2>
          Sources <small>{a.sources.length} reports, oldest first</small>
        </h2>
        <div className="srcgrp">
          {groups.map((g) => (
            <div key={g.t}>
              <h3>
                {TRUST[g.t].title} <span>{TRUST[g.t].help}</span>
              </h3>
              <ul>
                {g.items.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} rel="noopener nofollow" target="_blank">
                      {s.title && s.title !== s.name ? s.title : s.name}
                    </a>
                    <span className="muted">
                      {s.title && s.title !== s.name ? `${s.name} · ` : ""}
                      {fmt(s.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="sec">
        <h2>Technical details</h2>
        <dl className="facts">
          <dt>ID</dt>
          <dd className="mono">{[a.id, ...a.aliases.filter((x) => x !== a.id)].join(" · ")}</dd>
          {a.cvss != null && (
            <>
              <dt>CVSS</dt>
              <dd>{a.cvss} / 10</dd>
            </>
          )}
          {a.epss != null && (
            <>
              <dt>EPSS</dt>
              <dd>{(a.epss * 100).toFixed(a.epss < 0.1 ? 1 : 0)}% chance of exploitation within 30 days</dd>
            </>
          )}
          <dt>Disclosed</dt>
          <dd>{fmt(a.published)}</dd>
          <dt>On Zero Radar</dt>
          <dd>{a.first_seen ? `${fmt(a.first_seen)}${lag != null && lag > 0 ? ` (${dur(lag)} after disclosure)` : ""}` : "before the radar started"}</dd>
          <dt>Last change</dt>
          <dd>{fmt(a.updated)}</dd>
        </dl>
      </section>

      <p className="aimark">
        {a.ai
          ? `The plain-language parts and the attack diagram were written by an AI model${a.model ? ` (${a.model})` : ""} from the sources above. Facts like versions, exploitation and dates come from the sources themselves.`
          : "This entry has not been explained yet — the text comes directly from the source."}{" "}
        <Link href="/about">How Zero Radar works</Link>
      </p>
    </main>
  );
}
