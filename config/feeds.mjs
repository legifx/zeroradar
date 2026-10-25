// Feeds, die Zero Radar abfragt. Neue Quelle = eine Zeile hier.
//
// trust (wie sehr wir einer Quelle allein glauben):
//   official   Hersteller, Projekt, CERT/Behörde, Distribution — gilt allein als bestätigt
//   research   Security-Mailinglisten und Forschungsteams — technisch, aber ungeprüft
//   press      etablierte Fachpresse — glaubwürdig, wird durch zweite Quelle bestätigt
//   community  Hacker News, Reddit — nur Hinweis, ohne zweite Quelle "unverified"
// all: true    jeder Eintrag ist sicherheitsrelevant; sonst Stichwortfilter
// every        Abfrageintervall in Sekunden (bedingte Anfragen mit ETag, daher günstig)
export const FEEDS = [
  // Hersteller & Projekte
  { id: "php", name: "PHP", trust: "official", every: 120, url: "https://www.php.net/feed.atom" },
  { id: "gitlab", name: "GitLab", trust: "official", all: true, every: 120, url: "https://about.gitlab.com/security-releases.xml" },
  { id: "nodejs", name: "Node.js", trust: "official", all: true, every: 120, url: "https://nodejs.org/en/feed/vulnerability.xml" },
  { id: "chrome", name: "Google Chrome", trust: "official", every: 300, url: "https://chromereleases.googleblog.com/feeds/posts/default" },
  { id: "msrc", name: "Microsoft MSRC", trust: "official", all: true, every: 300, url: "https://api.msrc.microsoft.com/update-guide/rss" },
  { id: "wordpress", name: "WordPress", trust: "official", all: true, every: 300, url: "https://wordpress.org/news/category/security/feed/" },
  { id: "kubernetes", name: "Kubernetes", trust: "official", all: true, every: 300, url: "https://kubernetes.io/docs/reference/issues-security/official-cve-feed/feed.xml" },
  { id: "django", name: "Django", trust: "official", every: 300, url: "https://www.djangoproject.com/rss/weblog/" },
  { id: "python", name: "Python", trust: "official", every: 300, url: "https://blog.python.org/feeds/posts/default" },
  { id: "rust", name: "Rust", trust: "official", every: 600, url: "https://blog.rust-lang.org/feed.xml" },
  { id: "github", name: "GitHub Security Blog", trust: "official", every: 300, url: "https://github.blog/security/feed/" },
  { id: "cisco", name: "Cisco PSIRT", trust: "official", all: true, every: 300, url: "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml" },
  { id: "fortinet", name: "Fortinet PSIRT", trust: "official", all: true, every: 300, url: "https://filestore.fortinet.com/fortiguard/rss/ir.xml" },
  { id: "paloalto", name: "Palo Alto Networks", trust: "official", all: true, every: 300, url: "https://security.paloaltonetworks.com/rss.xml" },
  { id: "jenkins", name: "Jenkins", trust: "official", all: true, every: 600, url: "https://www.jenkins.io/security/advisories/rss.xml" },

  // Distributionen
  { id: "debian", name: "Debian Security", trust: "official", all: true, every: 300, url: "https://www.debian.org/security/dsa-long.rdf" },
  { id: "ubuntu", name: "Ubuntu Security", trust: "official", all: true, every: 300, url: "https://ubuntu.com/security/notices/rss.xml" },

  // CERTs & Behörden
  { id: "cisa-adv", name: "CISA", trust: "official", all: true, every: 300, url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
  { id: "certbund", name: "CERT-Bund (BSI)", trust: "official", all: true, every: 300, url: "https://wid.cert-bund.de/content/public/securityAdvisory/rss" },
  { id: "cert-eu", name: "CERT-EU", trust: "official", all: true, every: 600, url: "https://cert.europa.eu/publications/security-advisories-rss" },
  { id: "ncsc-uk", name: "NCSC UK", trust: "official", all: true, every: 600, url: "https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml" },

  // Forschung & Mailinglisten
  { id: "oss-sec", name: "oss-security", trust: "research", all: true, every: 120, url: "https://seclists.org/rss/oss-sec.rss" },
  { id: "fulldisc", name: "Full Disclosure", trust: "research", all: true, every: 300, url: "https://seclists.org/rss/fulldisclosure.rss" },
  { id: "watchtowr", name: "watchTowr Labs", trust: "research", all: true, every: 600, url: "https://labs.watchtowr.com/rss/" },
  { id: "socket", name: "Socket", trust: "research", every: 300, url: "https://socket.dev/api/blog/feed.atom" },
  { id: "wiz", name: "Wiz Research", trust: "research", every: 600, url: "https://www.wiz.io/feed/rss.xml" },

  // Fachpresse
  { id: "bleeping", name: "BleepingComputer", trust: "press", every: 120, url: "https://www.bleepingcomputer.com/feed/" },
  { id: "thn", name: "The Hacker News", trust: "press", every: 120, url: "https://feeds.feedburner.com/TheHackersNews" },
  { id: "securityweek", name: "SecurityWeek", trust: "press", every: 180, url: "https://www.securityweek.com/feed/" },
  { id: "therecord", name: "The Record", trust: "press", every: 300, url: "https://therecord.media/feed" },
  { id: "darkreading", name: "Dark Reading", trust: "press", every: 300, url: "https://www.darkreading.com/rss.xml" },
  { id: "databreaches", name: "DataBreaches.net", trust: "press", all: true, every: 300, url: "https://databreaches.net/feed/" },

  // Community (nur Hinweise)
  { id: "netsec", name: "r/netsec", trust: "community", every: 300, url: "https://www.reddit.com/r/netsec/new/.rss" },
];

// Hacker News (Algolia): Security-Stories ab dieser Punktzahl
export const HN_QUERIES = ["vulnerability", "CVE", "exploit", "data breach", "leaked", "RCE", "supply chain attack", "zero-day"];
export const HN_MIN_POINTS = 25;

export const SECURITY_WORDS =
  /\b(security|vulnerab\w*|cve-\d{4}|exploit\w*|rce|remote code|zero[- ]day|0-?day|breach\w*|leak\w*|compromis\w*|malware|backdoor\w*|ransomware|supply[- ]chain|patch(?:es|ed)? now|advisory|injection|bypass|hijack\w*|stolen|exposed)\b/i;

/** Vertrauensstufe der strukturierten Quellen (Feeds tragen ihre eigene). */
export const SOURCE_TRUST = {
  "GitHub Advisory": "official",
  NVD: "official",
  "CISA KEV": "official",
  OSV: "official",
  "Have I Been Pwned": "official",
  "Hacker News": "community",
};
