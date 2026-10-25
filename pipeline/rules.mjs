// Gemeinsame Regeln für Engine und Veröffentlichung: was ist "Top", wie relevant ist ein Eintrag.
import { confidence } from "./lib/store.mjs";

export const isTop = (e) =>
  e.kind === "breach" ||
  e.kind === "incident" ||
  (e.kind !== "malware" &&
    (["yes", "reported"].includes(e.exploited.status) ||
      e.severity === "critical" ||
      (e.severity === "high" && (e.products.some((p) => p.ecosystem && p.ecosystem !== "service") || e.sources.length > 1))));

export const urgency = (e) => (["yes", "reported"].includes(e.exploited.status) ? 2 : 0) + (e.kind !== "vuln" ? 1 : 0);

const SEV_POINTS = { critical: 3, high: 2, medium: 1 };
/** Relevanz für die Top-Ansicht (die Seite verrechnet sie noch mit dem Alter). */
export const score = (e) => {
  const c = confidence(e);
  return (
    (SEV_POINTS[e.severity] || 0) +
    ({ yes: 4, reported: 3 }[e.exploited.status] || 0) +
    Math.min(c.serious - 1, 4) +
    (e.sources.some((s) => s.trust !== "official") ? 2 : 0) +
    (e.hn_points >= 200 ? 2 : e.hn_points >= 50 ? 1 : 0) +
    (e.products.some((p) => p.ecosystem && p.ecosystem !== "service") ? 1 : 0) +
    (e.kind === "breach" || e.kind === "incident" ? 1 : 0) -
    (c.level === "unverified" ? 3 : 0)
  );
};
