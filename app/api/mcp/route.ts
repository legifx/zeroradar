// Remote-MCP-Server (Streamable HTTP, zustandslos, nur JSON-Antworten).
// Einbinden: claude mcp add --transport http zeroradar https://zeroradar.vercel.app/api/mcp
import { filterEntries, getDetail, getEntries, getMeta, SITE_URL, type Detail, type Entry } from "@/lib/data";
import { check } from "@/lib/check";

const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "latest_threats",
    description:
      "New security threats from the Zero Radar feed (updated continuously, usually within minutes of the first credible source): critical/exploited vulnerabilities, malicious packages, data breaches. Use at session start or before deploying to see what is new.",
    inputSchema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["top", "exploited", "unpatched", "fixes", "breaches", "all", "malware"],
          description: "top = critical, exploited or widely relevant (default); fixes = recently released fixes; unpatched = important entries without a fix",
        },
        since: { type: "string", description: "ISO timestamp; only entries found or updated after it" },
        ecosystem: { type: "string", description: "npm, pip, composer, go, rust, maven, nuget, rubygems, actions …" },
        query: { type: "string", description: "Free-text filter: CVE id, package or product name" },
        limit: { type: "number", description: "Max entries (default 20, max 100)" },
      },
    },
  },
  {
    name: "get_threat",
    description: "Full briefing for one entry: what it is, why it is dangerous, exploitation status, fixed versions, sources.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "CVE-…, GHSA-… or ZR-… id" } },
      required: ["id"],
    },
  },
  {
    name: "check_packages",
    description:
      "Check dependencies (e.g. parsed from lockfiles) against everything on the radar, including malicious packages. Returns affected packages with fixed versions.",
    inputSchema: {
      type: "object",
      properties: {
        packages: {
          type: "array",
          items: {
            type: "object",
            properties: { ecosystem: { type: "string" }, name: { type: "string" }, version: { type: "string" } },
            required: ["ecosystem", "name"],
          },
        },
      },
      required: ["packages"],
    },
  },
];

const flags = (a: Entry) =>
  [
    a.severity,
    a.exploited.status === "yes" ? "EXPLOITED" : a.exploited.status === "reported" ? "exploitation reported" : "",
    a.fix.status === "available" ? "fix available" : a.fix.status === "partial" ? "partial fix" : a.fix.status === "none" ? "NO FIX" : "",
    `${a.confidence.level} (${a.confidence.publishers} source${a.confidence.publishers === 1 ? "" : "s"})`,
  ]
    .filter(Boolean)
    .join(", ");

const line = (a: Entry) =>
  `- ${a.id} [${flags(a)}] ${a.title}` +
  (a.plain ? `\n  ${a.plain}` : "") +
  (a.fix.text ? `\n  fix: ${a.fix.text}` : "") +
  `\n  ${SITE_URL}/v/${encodeURIComponent(a.id)}`;

function full(a: Detail) {
  return [
    `${a.id} — ${a.title}`,
    `kind: ${a.kind} · ${flags(a)}${a.cvss != null ? ` · CVSS ${a.cvss}` : ""}${a.epss != null ? ` · EPSS ${(a.epss * 100).toFixed(1)}%` : ""}`,
    `disclosed: ${a.published} · picked up: ${a.first_seen || "before launch"} · updated: ${a.updated}`,
    a.summary && `What: ${a.summary}`,
    a.why && `Why dangerous: ${a.why}`,
    a.who && `Affected if: ${a.who}`,
    a.flow && `Attack: ${a.flow.steps.map((s) => s.label).join(" → ")}${a.flow.outcome ? ` ⇒ ${a.flow.outcome}` : ""}`,
    `Exploited: ${a.exploited.status}${a.exploit_claims.length ? ` (${a.exploit_claims.map((c) => `${c.name}: ${c.status}`).join("; ")})` : ""}`,
    `Fix: ${a.fix.status}${a.fix.text ? ` — ${a.fix.text}` : ""}${a.fix.since ? ` (since ${a.fix.since})` : ""}`,
    a.steps.length > 0 && `Steps:\n${a.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`,
    a.products.length > 0 &&
      `Packages:\n${a.products.map((p) => `  ${p.ecosystem || "?"}/${p.name}: vulnerable ${p.vulnerable || "?"}, fixed ${p.fixed || "—"}`).join("\n")}`,
    `Sources:\n${a.sources.map((s) => `  [${s.trust}] ${s.name}: ${s.url}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "latest_threats") {
    const [all, meta] = await Promise.all([getEntries(), getMeta()]);
    const list = filterEntries(all, {
      view: (args.view as string) || "top",
      since: args.since as string | undefined,
      ecosystem: args.ecosystem as string | undefined,
      search: args.query as string | undefined,
    })
      .sort((a, b) => (b.first_seen || b.published).localeCompare(a.first_seen || a.published))
      .slice(0, Math.min(Number(args.limit) || 20, 100));
    return `Zero Radar · last check ${meta.checked_at} · ${list.length} entries\n\n${list.map(line).join("\n") || "(nothing new)"}`;
  }
  if (name === "get_threat") {
    const a = await getDetail(String(args.id || ""));
    return a ? full(a) : `No entry ${args.id} on the radar (only recent threats are tracked).`;
  }
  if (name === "check_packages") {
    const pkgs = Array.isArray(args.packages) ? (args.packages as { ecosystem: string; name: string; version?: string }[]) : [];
    const r = await check(pkgs.slice(0, 5000));
    if (!r.findings.length) return `Checked ${r.checked} packages: none affected by anything currently on the radar.`;
    return (
      `Checked ${r.checked} packages: ${r.findings.length} finding(s)\n\n` +
      r.findings
        .map(
          (f) =>
            `- ${f.package.ecosystem}/${f.package.name}@${f.package.version || "?"} → ${f.id} [${f.severity}${f.kind === "malware" ? ", MALICIOUS PACKAGE" : ""}${f.exploited === "yes" ? ", EXPLOITED" : ""}] ${f.title}\n  vulnerable ${f.vulnerable || "?"}, fixed ${f.fixed || "—"} (${f.certainty})${f.fix ? `\n  fix: ${f.fix}` : ""}\n  ${SITE_URL}${f.url}`,
        )
        .join("\n")
    );
  }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "zeroradar", title: "Zero Radar", version: "0.2.0" },
        instructions:
          "Zero Radar tracks new critical vulnerabilities, exploited bugs, malicious packages and data breaches (updated every 5 minutes). Call latest_threats to see what is new; call check_packages with the project's dependencies to find affected ones.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call":
      try {
        const text = await callTool(String(msg.params?.name), (msg.params?.arguments as Record<string, unknown>) || {});
        return ok({ content: [{ type: "text", text }] });
      } catch (err) {
        const e = err as Error & { code?: number };
        if (e.code) return { jsonrpc: "2.0", id: msg.id, error: { code: e.code, message: e.message } };
        return ok({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    default:
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const msgs = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(msgs.filter((m) => m.id !== undefined && m.id !== null).map(handle))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

export async function GET() {
  return new Response("Zero Radar MCP endpoint — use POST (Streamable HTTP).", { status: 405, headers: { allow: "POST" } });
}
