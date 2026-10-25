import { getEntries, getPackages, type Entry } from "@/lib/data";
import { matchPackages } from "@/lib/match.mjs";

type Product = { ecosystem: string; name: string; vulnerable: string | null; fixed: string | null };

export async function check(packages: { ecosystem: string; name: string; version?: string }[]) {
  const [entries, rows] = await Promise.all([getEntries(), getPackages()]);
  const byId = new Map(entries.map((e) => [e.id, { entry: e, products: [] as Product[] }]));
  for (const [id, ecosystem, name, vulnerable, fixed] of rows) byId.get(id)?.products.push({ ecosystem, name, vulnerable, fixed });
  const hits = matchPackages(packages, [...byId.values()]) as {
    advisory: { entry: Entry };
    package: { ecosystem: string; name: string; version?: string };
    product: Product;
    certainty: "affected" | "maybe";
  }[];
  return {
    checked: packages.length,
    findings: hits.map(({ advisory: { entry: a }, package: pkg, product, certainty }) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      kind: a.kind,
      exploited: a.exploited.status,
      fix: a.fix.text,
      package: pkg,
      vulnerable: product.vulnerable,
      fixed: product.fixed,
      certainty,
      url: `/v/${encodeURIComponent(a.id)}`,
    })),
  };
}
