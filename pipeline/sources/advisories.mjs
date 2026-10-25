// Strukturierte Quellen: GitHub Advisory DB, NVD, CISA KEV, OSV, EPSS, Have I Been Pwned.
// Jede Quelle liefert "Beobachtungen" (obs); store.mjs führt sie zu Einträgen zusammen.
import { getIfChanged, getJson } from "../lib/http.mjs";
import { stripHtml } from "../lib/feed.mjs";

const sevFromScore = (s) =>
  s == null ? "unknown" : s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : s > 0 ? "low" : "unknown";
const official = (name, url, at, title) => ({ name, url, at, title, trust: "official" });

// ---------- GitHub Advisory Database (reviewed = mit Paket + Versionsbereich) ----------
function fromGhsa(a, type = a.type) {
  const score = a.cvss_severities?.cvss_v4?.score || a.cvss_severities?.cvss_v3?.score || a.cvss?.score || null;
  return {
    id: a.cve_id || a.ghsa_id,
    aliases: [a.ghsa_id, a.cve_id].filter(Boolean),
    kind: type === "malware" ? "malware" : "vuln",
    title: a.summary,
    text: (a.description || "").slice(0, 3000),
    severity: type === "malware" ? "critical" : a.severity === "moderate" ? "medium" : a.severity || sevFromScore(score),
    cvss: score,
    epss: a.epss?.percentage ?? null,
    published: a.published_at,
    products: (a.vulnerabilities || []).map((v) => ({
      ecosystem: v.package?.ecosystem,
      name: v.package?.name,
      vulnerable: v.vulnerable_version_range || null,
      fixed: v.first_patched_version || null,
    })),
    source: official("GitHub Advisory", a.html_url, a.published_at, a.summary),
    updated_at: a.updated_at,
  };
}

const ghHeaders = (token) => ({
  accept: "application/vnd.github+json",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

/** sort "published": neue Advisories; sort "updated": nachträglich geänderte (z. B. neue Fix-Version). */
export async function ghsa({ since, token, sort = "published" }) {
  const field = sort === "updated" ? "updated_at" : "published_at";
  const out = [];
  for (const type of sort === "updated" ? ["reviewed"] : ["reviewed", "malware"]) {
    for (let page = 1; page <= 5; page++) {
      const list = await getJson(
        `https://api.github.com/advisories?type=${type}&sort=${sort}&direction=desc&per_page=100&page=${page}`,
        { headers: ghHeaders(token) },
      );
      for (const a of list) if (!a.withdrawn_at && a[field] >= since) out.push(fromGhsa(a, type));
      if (!list.length || list.at(-1)[field] < since) break;
    }
  }
  return out;
}

export async function ghsaByCve(cve, token) {
  const list = await getJson(`https://api.github.com/advisories?cve_id=${encodeURIComponent(cve)}`, {
    headers: ghHeaders(token),
  });
  return list.filter((a) => !a.withdrawn_at).map((a) => fromGhsa(a));
}

// ---------- NVD ----------
// mode "published": neue CVEs ab High. mode "modified": geänderte CVEs (nur für bekannte Einträge genutzt).
export async function nvd({ since, apiKey, mode = "published" }) {
  const fmt = (d) => d.toISOString().replace("Z", "");
  const param = mode === "modified" ? "lastMod" : "pub";
  const headers = apiKey ? { apiKey } : {};
  const out = [];
  // NVD sortiert aufsteigend, max. 2000 pro Seite: alles durchblättern
  for (let offset = 0; offset < 6000; offset += 500) {
    if (offset && !apiKey) await new Promise((r) => setTimeout(r, 6500)); // 5 Anfragen / 30 s ohne Key
    const url =
      `https://services.nvd.nist.gov/rest/json/cves/2.0?${param}StartDate=${fmt(new Date(since))}` +
      `&${param}EndDate=${fmt(new Date())}&resultsPerPage=500&startIndex=${offset}`;
    const j = await getJson(url, { headers, timeout: 40000 });
    for (const { cve } of j.vulnerabilities || []) {
      const m = cve.metrics || {};
      const metric = [m.cvssMetricV40, m.cvssMetricV31, m.cvssMetricV30].find((x) => x?.length)?.[0];
      const score = metric?.cvssData?.baseScore ?? null;
      if (mode === "published" && (score == null || score < 7)) continue;
      const desc = cve.descriptions?.find((d) => d.lang === "en")?.value || "";
      const patchRefs = (cve.references || []).filter((r) => (r.tags || []).some((t) => /Patch|Release Notes|Vendor Advisory/.test(t)));
      out.push({
        id: cve.id,
        aliases: [cve.id],
        kind: "vuln",
        title: desc.split(/(?<=\.)\s/)[0].slice(0, 200),
        text: desc.slice(0, 3000) + (patchRefs.length ? ` Patch/advisory references: ${patchRefs.slice(0, 4).map((r) => r.url).join(" ")}` : ""),
        severity: sevFromScore(score),
        cvss: score,
        published: new Date(cve.published + "Z").toISOString(),
        patch_refs: patchRefs.length,
        exploited: cve.cisaExploitAdd
          ? { status: "yes", since: new Date(cve.cisaExploitAdd).toISOString(), note: "Listed in CISA KEV" }
          : undefined,
        source: official("NVD", `https://nvd.nist.gov/vuln/detail/${cve.id}`, cve.published + "Z", cve.id),
      });
    }
    if (offset + 500 >= (j.totalResults || 0)) break;
  }
  return out;
}

// ---------- CISA KEV: bestätigte Angriffe in freier Wildbahn ----------
export async function kev({ since, httpCache }) {
  const j = await getIfChanged("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", httpCache, {
    timeout: 40000,
    as: "json",
  });
  if (!j) return [];
  return (j.vulnerabilities || [])
    .filter((v) => new Date(v.dateAdded).toISOString() >= since.slice(0, 10))
    .map((v) => ({
      id: v.cveID,
      aliases: [v.cveID],
      kind: "vuln",
      title: `${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`,
      text: `${v.shortDescription} Required action: ${v.requiredAction}`,
      severity: "critical",
      published: new Date(v.dateAdded).toISOString(),
      exploited: {
        status: "yes",
        since: new Date(v.dateAdded).toISOString(),
        note: v.knownRansomwareCampaignUse === "Known" ? "Used in ransomware campaigns (CISA KEV)" : "Listed in CISA KEV",
      },
      source: official("CISA KEV", `https://www.cve.org/CVERecord?id=${v.cveID}`, new Date(v.dateAdded).toISOString(), v.vulnerabilityName),
    }));
}

// ---------- OSV: Fix-Versionen über alle Open-Source-Ökosysteme ----------
const OSV_ECO = { npm: "npm", PyPI: "pip", Packagist: "composer", Go: "go", "crates.io": "rust", Maven: "maven", NuGet: "nuget", RubyGems: "rubygems", Pub: "pub", Hex: "erlang" };

function osvProducts(v) {
  const out = [];
  for (const a of v.affected || []) {
    const eco = OSV_ECO[a.package?.ecosystem?.split(":")[0]] || (a.package?.ecosystem || "").toLowerCase();
    for (const r of a.ranges || []) {
      if (r.type === "GIT") continue;
      let intro = null;
      for (const ev of r.events || []) {
        if (ev.introduced != null) intro = ev.introduced;
        if (ev.fixed != null)
          out.push({
            ecosystem: eco,
            name: a.package?.name,
            vulnerable: `${intro && intro !== "0" ? `>= ${intro}, ` : ""}< ${ev.fixed}`,
            fixed: ev.fixed,
          });
      }
    }
  }
  return out;
}

/** Fix-Infos zu einer CVE aus OSV; folgt Aliassen, wenn die CVE selbst nicht als Eintrag existiert. */
export async function osvFixes(cve) {
  const fetchOne = async (id) => {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
    return { status: res.status, body: await res.json() };
  };
  let r = await fetchOne(cve);
  let vulns = [];
  if (r.status === 200) vulns = [r.body];
  else {
    const aliases = String(r.body?.message || "").match(/[A-Z][A-Z0-9-]+-\d{4}-[\w-]+|GHSA-[\w-]+/g) || [];
    for (const id of aliases.slice(0, 4)) {
      const x = await fetchOne(id);
      if (x.status === 200) vulns.push(x.body);
    }
  }
  return vulns.flatMap(osvProducts).filter((p) => p.name && p.fixed);
}

// ---------- EPSS: Wahrscheinlichkeit für Ausnutzung in den nächsten 30 Tagen ----------
export async function epss(cves) {
  const result = {};
  for (let i = 0; i < cves.length; i += 100) {
    const batch = cves.slice(i, i + 100);
    try {
      const j = await getJson(`https://api.first.org/data/v1/epss?cve=${batch.join(",")}`);
      for (const r of j.data || []) result[r.cve] = +r.epss;
    } catch {
      /* EPSS ist Zusatzinfo, Ausfall ist egal */
    }
  }
  return result;
}

// ---------- Have I Been Pwned: neu aufgenommene, geprüfte Datenlecks ----------
export async function hibp({ since, httpCache }) {
  const list = await getIfChanged("https://haveibeenpwned.com/api/v3/breaches", httpCache, { timeout: 30000, as: "json" });
  if (!list) return [];
  return list
    .filter((b) => b.AddedDate >= since && !b.IsSpamList && !b.IsFabricated)
    .map((b) => ({
      id: `HIBP-${b.Name}`,
      aliases: [`HIBP-${b.Name}`],
      kind: "breach",
      title: `${b.Title} data breach: ${b.PwnCount.toLocaleString("en-US")} accounts`,
      text: `${stripHtml(b.Description)} Exposed data: ${(b.DataClasses || []).join(", ")}. Breach date: ${b.BreachDate}.`,
      severity: b.PwnCount >= 1e6 ? "high" : "medium",
      published: b.AddedDate,
      products: [{ ecosystem: "service", name: b.Domain || b.Title, vulnerable: null, fixed: null }],
      source: official("Have I Been Pwned", `https://haveibeenpwned.com/PwnedWebsites#${b.Name}`, b.AddedDate, b.Title),
    }));
}
