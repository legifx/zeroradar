// Lockfile-Parser für scan.mjs und den Server-Wächter. Ohne Abhängigkeiten.

export const PARSERS = {
  "package-lock.json": (s) => {
    const j = JSON.parse(s);
    const out = [];
    for (const [k, v] of Object.entries(j.packages || {})) {
      if (!k || !v.version) continue;
      out.push({ ecosystem: "npm", name: v.name || k.split("node_modules/").pop(), version: v.version });
    }
    for (const [name, v] of Object.entries(j.dependencies || {})) if (v.version) out.push({ ecosystem: "npm", name, version: v.version });
    return out;
  },
  "pnpm-lock.yaml": (s) =>
    [...s.matchAll(/^\s{2}['"]?\/?(@?[^@\s'"]+)@([0-9][^:('"\s]*)/gm)].map((m) => ({ ecosystem: "npm", name: m[1], version: m[2] })),
  "yarn.lock": (s) =>
    [...s.matchAll(/^"?(@?[^@\s"]+)@[^\n]*\n\s+version:? "?([^"\s]+)"?/gm)].map((m) => ({ ecosystem: "npm", name: m[1], version: m[2] })),
  "bun.lock": (s) =>
    [...s.matchAll(/"(@?[^@"\s]+)@(\d[^"]*)"/g)].map((m) => ({ ecosystem: "npm", name: m[1], version: m[2] })),
  "composer.lock": (s) => {
    const j = JSON.parse(s);
    return [...(j.packages || []), ...(j["packages-dev"] || [])].map((p) => ({ ecosystem: "composer", name: p.name, version: String(p.version).replace(/^v/, "") }));
  },
  "poetry.lock": (s) => tomlPackages(s, "pip"),
  "uv.lock": (s) => tomlPackages(s, "pip"),
  "Cargo.lock": (s) => tomlPackages(s, "rust"),
  "Pipfile.lock": (s) => {
    const j = JSON.parse(s);
    return Object.entries({ ...j.default, ...j.develop }).map(([name, v]) => ({ ecosystem: "pip", name, version: String(v.version || "").replace(/^==/, "") }));
  },
  "go.sum": (s) => {
    const seen = new Map();
    for (const m of s.matchAll(/^(\S+) v([^\s/]+?)(?:\/go\.mod)? h1:/gm)) seen.set(m[1], m[2].replace(/\+incompatible$/, ""));
    return [...seen].map(([name, version]) => ({ ecosystem: "go", name, version }));
  },
  "Gemfile.lock": (s) =>
    [...s.matchAll(/^ {4}([a-zA-Z0-9_.-]+) \(([^)\s]+)\)$/gm)].map((m) => ({ ecosystem: "rubygems", name: m[1], version: m[2] })),
};

function tomlPackages(s, ecosystem) {
  return [...s.matchAll(/\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g)].map((m) => ({ ecosystem, name: m[1], version: m[2] }));
}

export function requirements(s) {
  return [...s.matchAll(/^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([^\s;#]+)/gm)].map((m) => ({ ecosystem: "pip", name: m[1], version: m[2] }));
}
