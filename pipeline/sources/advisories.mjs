// Strukturierte Quellen: GitHub Advisory DB, NVD, CISA KEV, EPSS, Have I Been Pwned.
// Jede Quelle liefert "Beobachtungen" (obs); store.mjs führt sie zu Einträgen zusammen.
import { get, getJson } from "../lib/http.mjs";
import { stripHtml } from "../lib/feed.mjs";

const sevFromScore = (s) =>
  s == null ? "unknown" : s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : s > 0 ? "low" : "unknown";

// ---------- GitHub Advisory Database (reviewed = mit Paket + Versionsbereich) ----------
export async function ghsa({ since, token }) {
  const headers = { accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const out = [];
  for (const type of ["reviewed", "malware"]) {
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/advisories?type=${type}&sort=published&direction=desc&per_page=100&page=${page}`;
      const list = await getJson(url, { headers });
      for (const a of list) {
        if (a.withdrawn_at) continue;
        const score = a.cvss_severities?.cvss_v4?.score || a.cvss_severities?.cvss_v3?.score || a.cvss?.score || null;
        out.push({
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
          source: { name: "GitHub Advisory", url: a.html_url, at: a.published_at },
          refs: (a.references || []).slice(0, 8),
        });
      }
      if (!list.length || list.at(-1).published_at < since) break;
    }
  }
  return out.filter((o) => o.published >= since);
}

// ---------- NVD: neue CVEs, nur ab High (sonst zu viel Rauschen) ----------
export async function nvd({ since, apiKey }) {
  const fmt = (d) => d.toISOString().replace("Z", "");
  const start = new Date(since);
  const end = new Date();
  const headers = apiKey ? { apiKey } : {};
  const out = [];
  // NVD sortiert aufsteigend und liefert max. 2000 pro Seite: alles durchblättern (Erstlauf ~7 Tage)
  for (let offset = 0; offset < 6000; offset += 500) {
    if (offset && !apiKey) await new Promise((r) => setTimeout(r, 6500)); // 5 Anfragen / 30 s ohne Key
    const url =
      `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt(start)}&pubEndDate=${fmt(end)}` +
      `&resultsPerPage=500&startIndex=${offset}`;
    const j = await getJson(url, { headers, timeout: 40000 });
    for (const { cve } of j.vulnerabilities || []) {
      const m = cve.metrics || {};
      const metric = [m.cvssMetricV40, m.cvssMetricV31, m.cvssMetricV30].find((x) => x?.length)?.[0];
      const score = metric?.cvssData?.baseScore ?? null;
      if (score == null || score < 7) continue;
      const desc = cve.descriptions?.find((d) => d.lang === "en")?.value || "";
      out.push({
        id: cve.id,
        aliases: [cve.id],
        kind: "vuln",
        title: desc.split(/(?<=\.)\s/)[0].slice(0, 200),
        text: desc.slice(0, 3000),
        severity: sevFromScore(score),
        cvss: score,
        published: new Date(cve.published + "Z").toISOString(),
        source: { name: "NVD", url: `https://nvd.nist.gov/vuln/detail/${cve.id}`, at: cve.published + "Z" },
        refs: (cve.references || []).slice(0, 8).map((r) => r.url),
      });
    }
    if (offset + 500 >= (j.totalResults || 0)) break;
  }
  return out;
}

// ---------- CISA KEV: bestätigte Angriffe in freier Wildbahn ----------
export async function kev({ since }) {
  const j = await getJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", {
    timeout: 40000,
  });
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
      source: {
        name: "CISA KEV",
        url: `https://www.cve.org/CVERecord?id=${v.cveID}`,
        at: new Date(v.dateAdded).toISOString(),
      },
    }));
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

// ---------- Have I Been Pwned: neu aufgenommene Datenlecks ----------
export async function hibp({ since }) {
  const list = await getJson("https://haveibeenpwned.com/api/v3/breaches", { timeout: 30000 });
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
      source: { name: "Have I Been Pwned", url: `https://haveibeenpwned.com/PwnedWebsites#${b.Name}`, at: b.AddedDate },
    }));
}

