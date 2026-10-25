import Link from "next/link";
import { isFresh, type Entry, type Flow } from "@/lib/data";
import { BAD, Icon, iconName } from "./icons";
import { RelTime } from "./reltime";

export function RadarLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 16 26 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      <circle cx="22.5" cy="20.5" r="3" fill="var(--red)" />
    </svg>
  );
}

export const SEV_WORD: Record<Entry["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  unknown: "Unrated",
};
const SEV_TAG: Record<Entry["severity"], string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", unknown: "" };
const SEV_HELP: Record<Entry["severity"], string> = {
  critical: "Critical: attackers can usually take over the affected system or data",
  high: "High: serious damage possible, often needs one extra condition",
  medium: "Medium: limited damage or hard to exploit",
  low: "Low: minor impact",
  unknown: "Not rated yet",
};
export const KIND_WORD: Record<Entry["kind"], string> = {
  vuln: "Vulnerability",
  breach: "Data breach",
  incident: "Security incident",
  malware: "Malicious package",
};
const KIND_TAG: Record<Entry["kind"], string> = { vuln: "", breach: "Leak", incident: "Incident", malware: "Malware" };

export function confWord(c: Entry["confidence"]) {
  const n = c.publishers;
  if (c.level === "confirmed") return n > 1 ? `Official, ${n} sources` : "Official source";
  if (c.level === "corroborated") return `${n} independent sources`;
  if (c.level === "single") return "1 source, unconfirmed";
  return "Unverified";
}

export function SevTag({ a }: { a: Entry }) {
  const tag = SEV_TAG[a.severity] || KIND_TAG[a.kind] || "Unrated";
  return (
    <span className={`tag sev-${a.severity}`} title={SEV_TAG[a.severity] ? SEV_HELP[a.severity] : KIND_WORD[a.kind]}>
      {tag}
    </span>
  );
}

// Nur kurze Versionsangaben ("16.4.1", "next 16.4.1, 15.5.9") direkt nennen; Sätze stehen im Tooltip
const versionish = (s: string | null): s is string => !!s && s.length <= 36 && /\d+\.\d+/.test(s) && !/\b(update|apply|upgrade|install|released)\b/i.test(s);

/** Statuszeile: ausgenutzt? Fix? Wie viele Quellen? Als Text, nicht als Pillen. */
export function Status({ a, ids = true }: { a: Entry; ids?: boolean }) {
  const ex = a.exploited;
  const by = ex.by?.length ? ex.by.slice(0, 2).join(", ") : null;
  const vuln = a.kind === "vuln";
  const cve = a.id.startsWith("ZR-") ? a.aliases.find((x) => !x.startsWith("ZR-")) : a.id;
  return (
    <div className="status">
      {isFresh(a) && <span className="s-new">New</span>}
      {ex.status === "yes" && (
        <span className="s-exp" title="Confirmed by an official source such as CISA or the vendor">
          Exploited{by ? ` (${by})` : ""}
        </span>
      )}
      {ex.status === "reported" && (
        <span className="s-rep" title="Reported by researchers or press, not yet confirmed officially">
          Attacks reported{by ? ` (${by})` : ""}
        </span>
      )}
      {vuln && (a.fix.status === "available" || a.fix.status === "partial") && (
        <span className="s-fix" title={a.fix.text || undefined}>
          {a.fix.status === "partial" ? "Partial fix" : versionish(a.fix.text) ? `Fixed in ${a.fix.text}` : "Fix available"}
          {a.fix.since && Date.now() - Date.parse(a.fix.since) < 3 * 864e5 && (
            <>
              {" "}· out <RelTime iso={a.fix.since} />
            </>
          )}
        </span>
      )}
      {vuln && a.fix.status === "none" && <span className="s-nofix">No fix yet</span>}
      <span className="s-src" title="How many independent publishers report this">
        {confWord(a.confidence)}
      </span>
      {ids && cve && <span className="s-id">{cve}</span>}
      {ids && a.eco.length > 0 && <span className="s-id">{a.eco.join(", ")}</span>}
    </div>
  );
}

/** Ablauf als Zeile: Symbol + Stichwort, Pfeile dazwischen, Ergebnis in Rot. */
export function MiniFlow({ flow }: { flow: Flow }) {
  const steps = flow.steps.slice(0, 4);
  return (
    <ol className="mini" aria-label="How the attack works">
      <li className="how">How it works:</li>
      {steps.map((s, i) => (
        <li key={i} className={BAD.has(iconName(s.icon)) ? "bad" : undefined}>
          <Icon name={s.icon} size={15} />
          {s.label}
        </li>
      ))}
      {flow.outcome && <li className="end">{flow.outcome}</li>}
    </ol>
  );
}

/** Ausführliches Ablaufbild (Detailseite): waagrecht am Rechner, senkrecht am Handy. */
export function FlowDiagram({ flow }: { flow: Flow }) {
  return (
    <ol className="flow">
      {flow.steps.map((s, i) => (
        <li key={i} className={BAD.has(iconName(s.icon)) ? "bad" : undefined}>
          <span className="ic">
            <Icon name={s.icon} size={22} />
          </span>
          <span className="n">{i + 1}</span>
          <b>{s.label}</b>
          {s.note && <span className="note">{s.note}</span>}
        </li>
      ))}
      {flow.outcome && (
        <li className="end">
          <span className="ic">
            <Icon name="alert" size={22} />
          </span>
          <span className="n">Result</span>
          <b>{flow.outcome}</b>
        </li>
      )}
    </ol>
  );
}

const HM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function EntryRow({ a, when, rich = true }: { a: Entry; when: string; rich?: boolean }) {
  return (
    <li className="row">
      <time className="t" dateTime={when}>
        {HM.format(new Date(when))}
      </time>
      <SevTag a={a} />
      <div className="body">
        <Link href={`/v/${encodeURIComponent(a.id)}`} className="title">
          {a.title}
        </Link>
        {rich && a.plain && <p className="plain">{a.plain}</p>}
        {rich && a.flow && <MiniFlow flow={a.flow} />}
        {!rich && a.names.length > 0 && a.kind !== "breach" && <p className="names">{a.names.join(", ")}</p>}
        <Status a={a} />
      </div>
    </li>
  );
}
