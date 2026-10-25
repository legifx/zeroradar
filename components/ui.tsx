import Link from "next/link";
import type { Advisory } from "@/lib/data";
import { RelTime } from "./reltime";

export function RadarLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--accent)" strokeOpacity=".5" strokeWidth="1.5" />
      <path d="M16 16 L16 2 A14 14 0 0 1 28.1 9 Z" fill="var(--accent)" fillOpacity=".28" />
      <line x1="16" y1="16" x2="28.1" y2="9" stroke="var(--accent)" strokeWidth="1.8" />
      <circle cx="21.5" cy="7.5" r="2" fill="var(--crit)" />
      <circle cx="16" cy="16" r="1.8" fill="var(--accent)" />
    </svg>
  );
}

const KIND_LABEL: Record<Advisory["kind"], string> = {
  vuln: "Vulnerability",
  breach: "Data breach",
  incident: "Incident",
  malware: "Malicious package",
};

export function Badges({ a }: { a: Advisory }) {
  const fresh =
    a.first_seen && Date.now() - Date.parse(a.first_seen) < 6 * 3600e3 && Date.now() - Date.parse(a.published) < 48 * 3600e3;
  return (
    <div className="badges">
      <span className="badge sev">{a.severity === "unknown" ? "unrated" : a.severity}</span>
      {a.kind !== "vuln" && <span className="badge">{KIND_LABEL[a.kind]}</span>}
      {a.exploited.status === "yes" && <span className="badge exp">● Exploited in the wild</span>}
      {a.exploited.status === "reported" && <span className="badge rep">Exploitation reported</span>}
      {a.kind === "vuln" && a.fix.status === "available" && <span className="badge fix">Fix available</span>}
      {a.kind === "vuln" && a.fix.status === "partial" && <span className="badge nofix">Partial fix</span>}
      {a.kind === "vuln" && a.fix.status === "none" && <span className="badge nofix">No fix yet</span>}
      {fresh && <span className="badge new">NEW</span>}
    </div>
  );
}

export function sevClass(a: Advisory) {
  return `sev-${a.severity}`;
}

export function AdvisoryCard({ a }: { a: Advisory }) {
  const eco = [...new Set(a.products.map((p) => p.ecosystem).filter(Boolean))].slice(0, 3);
  const names = [...new Set(a.products.map((p) => p.name))];
  return (
    <Link href={`/v/${encodeURIComponent(a.id)}`} className={`item ${sevClass(a)}`}>
      <div className="meta">
        <b>{a.id}</b>
        {a.cvss != null && <span>CVSS {a.cvss}</span>}
        {a.epss != null && a.epss >= 0.01 && <span>EPSS {(a.epss * 100).toFixed(a.epss < 0.1 ? 1 : 0)}%</span>}
        <span>
          disclosed <RelTime iso={a.published} />
        </span>
        {eco.length > 0 && <span>{eco.join(" · ")}</span>}
        {a.sources.length > 1 && <span>{a.sources.length} sources</span>}
      </div>
      <h2>{a.title}</h2>
      {a.summary && <p>{a.summary.length > 260 ? `${a.summary.slice(0, 257)}…` : a.summary}</p>}
      {!a.summary && names.length > 0 && <p className="mono">{names.slice(0, 6).join(", ")}</p>}
      <Badges a={a} />
    </Link>
  );
}
