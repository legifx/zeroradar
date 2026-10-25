// Kleine Strichsymbole für das Ablaufbild (24er-Raster). Die Namen gibt das KI-Schema vor (pipeline/ai.mjs).
const P: Record<string, React.ReactNode> = {
  attacker: (
    <>
      <path d="M5 21v-1.5A6.5 6.5 0 0 1 11.5 13h1a6.5 6.5 0 0 1 6.5 6.5V21" />
      <path d="M7.5 8.5a4.5 4.5 0 0 1 9 0V10a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 9h9" />
    </>
  ),
  internet: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  browser: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18M6.5 6.8h.01M9 6.8h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  package: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  ci: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  repo: (
    <>
      <circle cx="6" cy="5.5" r="2.2" />
      <circle cx="6" cy="18.5" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <path d="M6 7.7v8.6M18 10.2c0 4-6 3-11 6.5" />
    </>
  ),
  app: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
    </>
  ),
  cloud: <path d="M7 19h10a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.1 11.5 3.75 3.75 0 0 0 7 19z" />,
  device: (
    <>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2.3" />
      <circle cx="5" cy="18" r="2.3" />
      <circle cx="19" cy="18" r="2.3" />
      <path d="M10.9 7 6.1 16M13.1 7l4.8 9M7.3 18h9.4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      <path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  data: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 15.5h6M9 19h3" />
    </>
  ),
  malware: (
    <>
      <rect x="7.5" y="7" width="9" height="12" rx="4.5" />
      <path d="M12 7v12M9.5 7.3a2.5 2.5 0 0 1 5 0M7.5 11H4M20 11h-3.5M7.5 15.5H4M20 15.5h-3.5M8.5 18.5l-2.5 2M15.5 18.5l2.5 2" />
    </>
  ),
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />,
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.3h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sources: (
    <>
      <rect x="3.5" y="5" width="11" height="14" rx="1.5" />
      <path d="M17.5 7.5v12a1.5 1.5 0 0 1-1.5 1.5H7M7 9h4.5M7 12h4.5M7 15h3" />
    </>
  ),
};
// Abweichende Namen aus älteren Antworten des Modells
const ALIAS: Record<string, string> = { file: "data", breach: "database", phone: "device", laptop: "device", web: "internet", token: "key", secret: "key", git: "repo" };

export const BAD = new Set(["attacker", "malware"]);
export const iconName = (n: string) => (P[n] ? n : ALIAS[n] || "app");

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      {P[iconName(name)]}
    </svg>
  );
}
