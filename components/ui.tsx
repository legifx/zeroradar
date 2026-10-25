import Link from "next/link";
import { isFresh, type Entry, type Flow } from "@/lib/data";
import { BAD, Icon, iconName } from "./icons";
import { RelTime } from "./reltime";

export function RadarLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="2" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
      <path d="M16 16 28.1 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22" cy="7.5" r="2.6" fill="var(--crit)" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
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
export const KIND_WORD: Record<Entry["kind"], string> = {
  vuln: "Vulnerability",
  breach: "Data breach",
  incident: "Security incident",
  malware: "Malicious package",
};

export function confWord(c: Entry["confidence"]) {
  const n = c.publishers;
  if (c.level === "confirmed") return n > 1 ? `Official · ${n} sources` : "Official source";
  if (c.level === "corroborated") return `${n} independent sources`;
  if (c.level === "single") return "Single report";
  return "Unverified";
}

export function Chips({ a, full }: { a: Entry; full?: boolean }) {
  const ex = a.exploited;
  const by = ex.by?.length ? ex.by.slice(0, 2).join(", ") : null;
  const vulnish = a.kind === "vuln";
  return (
    <div className="chips">
      {isFresh(a) && <span className="chip new">NEW</span>}
      {ex.status === "yes" && (
        <span className="chip exp">
          <Icon name="alert" size={14} />
          <span>Exploited in the wild{by ? ` · ${by}` : ""}</span>
        </span>
      )}
      {ex.status === "reported" && (
        <span className="chip rep">
          <Icon name="alert" size={14} />
          <span>Attacks reported{by ? ` · ${by}` : ""}</span>
        </span>
      )}
      {vulnish && (a.fix.status === "available" || a.fix.status === "partial") && (
        <span className="chip fix" title={a.fix.text || undefined}>
          <Icon name="check" size={14} />
          <span>
            {a.fix.status === "partial" ? "Partial fix" : "Fix available"}
            {a.fix.since && Date.now() - Date.parse(a.fix.since) < 3 * 864e5 ? (
              <>
                {" "}· out <RelTime iso={a.fix.since} />
              </>
            ) : full && a.fix.text ? (
              ` · ${a.fix.text}`
            ) : null}
          </span>
        </span>
      )}
      {vulnish && a.fix.status === "none" && (
        <span className="chip nofix">
          <Icon name="clock" size={14} />
          <span>No fix yet</span>
        </span>
      )}
      <span className="chip conf" title="How many independent publishers report this">
        <Icon name={a.confidence.level === "confirmed" ? "shield" : "sources"} size={14} />
        <span>{confWord(a.confidence)}</span>
      </span>
    </div>
  );
}

/** Kleines Ablaufbild für Karten: Symbole mit Pfeilen, kurze Beschriftung, Ergebnis in Rot. */
export function MiniFlow({ flow }: { flow: Flow }) {
  const steps = flow.steps.slice(0, 4);
  return (
    <div className="mini" role="img" aria-label={`How it works: ${steps.map((s) => s.label).join(", then ")}${flow.outcome ? `. Result: ${flow.outcome}` : ""}`}>
      {steps.map((s, i) => (
        <div key={i} className={`st${BAD.has(iconName(s.icon)) ? " bad" : ""}`}>
          <span className="bub">
            <Icon name={s.icon} />
          </span>
          <span className="lbl">{s.label}</span>
        </div>
      ))}
      {flow.outcome && (
        <div className="st end">
          <span className="bub">
            <Icon name="alert" />
          </span>
          <span className="lbl">{flow.outcome}</span>
        </div>
      )}
    </div>
  );
}

/** Ausführliches Ablaufbild (Detailseite): waagrecht am Rechner, senkrecht am Handy. */
export function FlowDiagram({ flow }: { flow: Flow }) {
  return (
    <ol className="flow" style={{ listStyle: "none", padding: 0 }}>
      {flow.steps.map((s, i) => (
        <li key={i} className={`fs${BAD.has(iconName(s.icon)) ? " bad" : ""}`}>
          <span className="bub">
            <Icon name={s.icon} size={22} />
          </span>
          <div className="n">STEP {i + 1}</div>
          <div className="lbl">{s.label}</div>
          {s.note && <div className="note">{s.note}</div>}
        </li>
      ))}
      {flow.outcome && (
        <li className="fs end">
          <span className="bub">
            <Icon name="alert" size={22} />
          </span>
          <div className="n">RESULT</div>
          <div className="lbl">{flow.outcome}</div>
        </li>
      )}
    </ol>
  );
}

export function EntryCard({ a, variant = "normal" }: { a: Entry; variant?: "lead" | "normal" | "compact" }) {
  const compact = variant === "compact" || (!a.plain && !a.flow);
  return (
    <Link href={`/v/${encodeURIComponent(a.id)}`} className={`card sev-${a.severity}${compact ? " compact" : ""}${variant === "lead" ? " lead" : ""}`}>
      <div className="eyebrow">
        {a.severity !== "unknown" && <span className="sev">{SEV_WORD[a.severity]}</span>}
        <span>{KIND_WORD[a.kind]}</span>
        <span className="mono">{a.id.startsWith("ZR-") ? a.aliases.find((x) => !x.startsWith("ZR-")) || "" : a.id}</span>
        {a.eco.length > 0 && <span>{a.eco.join(" · ")}</span>}
        <span className="when">
          <RelTime iso={a.first_seen || a.published} />
        </span>
      </div>
      <h3>{a.title}</h3>
      {!compact && a.plain && <p className="plain">{a.plain}</p>}
      {!compact && a.flow && <MiniFlow flow={a.flow} />}
      {compact && a.names.length > 0 && a.kind !== "breach" && <div className="names">{a.names.join(", ")}</div>}
      <Chips a={a} />
    </Link>
  );
}
