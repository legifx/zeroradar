// Feeds, die Zero Radar abfragt. Neue Quelle = eine Zeile hier.
//   tier "vendor": offizielle Hersteller-/Projektmeldungen (höchstes Vertrauen)
//   tier "list":   Security-Mailinglisten (frühe, technische Erstmeldungen)
//   tier "news":   Fachpresse und Community (frühe Hinweise auf Vorfälle ohne CVE)
//   all: true      jeder Eintrag ist sicherheitsrelevant; sonst Stichwortfilter
export const FEEDS = [
  { id: "php", name: "PHP", tier: "vendor", url: "https://www.php.net/feed.atom" },
  { id: "gitlab", name: "GitLab Security", tier: "vendor", all: true, url: "https://about.gitlab.com/security-releases.xml" },
  { id: "nodejs", name: "Node.js Security", tier: "vendor", all: true, url: "https://nodejs.org/en/feed/vulnerability.xml" },
  { id: "chrome", name: "Chrome Releases", tier: "vendor", url: "https://chromereleases.googleblog.com/feeds/posts/default" },
  { id: "msrc", name: "Microsoft MSRC", tier: "vendor", all: true, url: "https://api.msrc.microsoft.com/update-guide/rss" },
  { id: "wordpress", name: "WordPress Security", tier: "vendor", all: true, url: "https://wordpress.org/news/category/security/feed/" },
  { id: "kubernetes", name: "Kubernetes CVE Feed", tier: "vendor", all: true, url: "https://kubernetes.io/docs/reference/issues-security/official-cve-feed/feed.xml" },
  { id: "debian", name: "Debian DSA", tier: "vendor", all: true, url: "https://www.debian.org/security/dsa-long.rdf" },
  { id: "ubuntu", name: "Ubuntu USN", tier: "vendor", all: true, url: "https://ubuntu.com/security/notices/rss.xml" },
  { id: "django", name: "Django", tier: "vendor", url: "https://www.djangoproject.com/rss/weblog/" },
  { id: "python", name: "Python Insider", tier: "vendor", url: "https://blog.python.org/feeds/posts/default" },
  { id: "rust", name: "Rust Blog", tier: "vendor", url: "https://blog.rust-lang.org/feed.xml" },
  { id: "github", name: "GitHub Security Blog", tier: "vendor", url: "https://github.blog/security/feed/" },

  { id: "oss-sec", name: "oss-security", tier: "list", all: true, url: "https://seclists.org/rss/oss-sec.rss" },
  { id: "fulldisc", name: "Full Disclosure", tier: "list", all: true, url: "https://seclists.org/rss/fulldisclosure.rss" },
  { id: "watchtowr", name: "watchTowr Labs", tier: "list", all: true, url: "https://labs.watchtowr.com/rss/" },
  { id: "socket", name: "Socket", tier: "list", url: "https://socket.dev/api/blog/feed.atom" },

  { id: "bleeping", name: "BleepingComputer", tier: "news", url: "https://www.bleepingcomputer.com/feed/" },
  { id: "thn", name: "The Hacker News", tier: "news", url: "https://feeds.feedburner.com/TheHackersNews" },
  { id: "securityweek", name: "SecurityWeek", tier: "news", url: "https://www.securityweek.com/feed/" },
  { id: "databreaches", name: "DataBreaches.net", tier: "news", all: true, url: "https://databreaches.net/feed/" },
  { id: "netsec", name: "r/netsec", tier: "news", url: "https://www.reddit.com/r/netsec/new/.rss" },
];

// Hacker News (Algolia): Security-Stories ab dieser Punktzahl
export const HN_QUERIES = ["vulnerability", "CVE", "exploit", "data breach", "leaked", "RCE", "supply chain attack", "zero-day"];
export const HN_MIN_POINTS = 25;

export const SECURITY_WORDS =
  /\b(security|vulnerab\w*|cve-\d{4}|exploit\w*|rce|remote code|zero[- ]day|0-?day|breach\w*|leak\w*|compromis\w*|malware|backdoor\w*|ransomware|supply[- ]chain|patch(?:es|ed)? now|advisory|injection|bypass|hijack\w*|stolen|exposed)\b/i;
