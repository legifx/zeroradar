import { getAdvisories, type Advisory } from "@/lib/data";
import { matchPackages } from "@/lib/match.mjs";

export async function check(packages: { ecosystem: string; name: string; version?: string }[]) {
  const hits = matchPackages(packages, await getAdvisories()) as {
    advisory: Advisory;
    package: { ecosystem: string; name: string; version?: string };
    product: { vulnerable?: string; fixed?: string };
    certainty: "affected" | "maybe";
  }[];
  return {
    checked: packages.length,
    findings: hits.map((h) => ({
      id: h.advisory.id,
      title: h.advisory.title,
      severity: h.advisory.severity,
      kind: h.advisory.kind,
      exploited: h.advisory.exploited.status,
      package: h.package,
      vulnerable: h.product.vulnerable || null,
      fixed: h.product.fixed || null,
      certainty: h.certainty,
      action: h.advisory.action,
      url: `/v/${encodeURIComponent(h.advisory.id)}`,
    })),
  };
}
