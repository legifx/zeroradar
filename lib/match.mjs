// Versionsvergleich und Range-Matching für GHSA-Ranges wie ">= 2.0.0, < 2.3.1".
// Geteilt zwischen Website (/api/check, MCP) und Skill-Skript. Bewusst tolerant:
// was sich nicht sicher parsen lässt, liefert "maybe" statt still "nicht betroffen".

const ECOSYSTEM_ALIASES = {
  npm: "npm", node: "npm", yarn: "npm", pnpm: "npm",
  pip: "pip", pypi: "pip", python: "pip",
  composer: "composer", packagist: "composer", php: "composer",
  go: "go", golang: "go",
  cargo: "rust", crates: "rust", "crates.io": "rust", rust: "rust",
  maven: "maven", gradle: "maven",
  nuget: "nuget", rubygems: "rubygems", gem: "rubygems", bundler: "rubygems",
  pub: "pub", swift: "swift", hex: "erlang", erlang: "erlang", actions: "actions",
};

export const normEcosystem = (e) => ECOSYSTEM_ALIASES[String(e || "").toLowerCase()] || String(e || "").toLowerCase();

export const normName = (ecosystem, name) => {
  const n = String(name || "").trim().toLowerCase();
  // PEP 503: _ . - sind bei PyPI gleichwertig
  return normEcosystem(ecosystem) === "pip" ? n.replace(/[-_.]+/g, "-") : n;
};

function parseVersion(v) {
  const s = String(v).trim().replace(/^v/i, "");
  const m = s.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) return null;
  const nums = m[1].split(".").map(Number);
  const pre = m[2].replace(/^[-+.]/, "");
  return { nums, pre: /^(post|p)\d*/i.test(pre) || pre.startsWith("+") ? "" : pre };
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  const len = Math.max(x.nums.length, y.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1; // 1.0.0 > 1.0.0-rc1
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** true | false | "maybe" */
export function inRange(version, range) {
  if (!range) return "maybe";
  let unsure = false;
  for (const part of String(range).split(",")) {
    const m = part.trim().match(/^(>=|<=|>|<|=|==)?\s*(.+)$/);
    if (!m) { unsure = true; continue; }
    const c = compareVersions(version, m[2]);
    if (c === null) { unsure = true; continue; }
    const op = m[1] || "=";
    const ok =
      op === ">=" ? c >= 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : op === "<" ? c < 0 : c === 0;
    if (!ok) return false;
  }
  return unsure ? "maybe" : true;
}

/**
 * packages: [{ecosystem, name, version}], advisories: Liste aus advisories.json.
 * Liefert pro Treffer {advisory, package, product, certainty}.
 */
export function matchPackages(packages, advisories) {
  const index = new Map();
  for (const adv of advisories) {
    for (const p of adv.products || []) {
      if (!p.ecosystem || !p.name) continue;
      const key = `${normEcosystem(p.ecosystem)}:${normName(p.ecosystem, p.name)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ adv, product: p });
    }
  }
  const hits = [];
  for (const pkg of packages) {
    const key = `${normEcosystem(pkg.ecosystem)}:${normName(pkg.ecosystem, pkg.name)}`;
    for (const { adv, product } of index.get(key) || []) {
      const r = pkg.version ? inRange(pkg.version, product.vulnerable) : "maybe";
      if (r === false) continue;
      hits.push({ advisory: adv, package: pkg, product, certainty: r === true ? "affected" : "maybe" });
    }
  }
  return hits;
}
