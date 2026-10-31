// KI-Aufrufe. Standard: Claude Code headless (`claude -p`) über legis Claude-Abo, ohne Einstellungen,
// Tools und MCP. Fällt Claude aus (Limit, Login abgelaufen), 15 min Pause und solange OpenRouter mit
// Zero Data Retention, falls ein Key gesetzt ist. Ohne beides liefert askJson() null, die Pipeline läuft
// dann mit Rohdaten weiter.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://openrouter.ai/api/v1/chat/completions";
const USE_CLAUDE = (process.env.ZERORADAR_LLM || "claude") === "claude";
const CLAUDE_MODEL = process.env.ZERORADAR_CLAUDE_MODEL || "claude-haiku-5-5";
const OR_MODEL = process.env.ZERORADAR_MODEL || "anthropic/claude-haiku-5.5";
export const MODEL = USE_CLAUDE ? CLAUDE_MODEL : OR_MODEL;

const hasOpenRouter = () => Boolean(process.env.ZERORADAR_OPENROUTER_KEY);
export const llmAvailable = () => USE_CLAUDE || hasOpenRouter();

let spentUsd = 0; // echtes Geld (OpenRouter)
let aboUsd = 0; // API-Gegenwert der Abo-Aufrufe, zählt gegen legis Limits
const spentByTag = {};
export const spent = () => spentUsd;
export const spentAbo = () => aboUsd;
/** Kosten je Schritt (triage, enrich, dedupe) seit Prozessstart, Abo als Gegenwert. */
export const spentBy = () => ({ ...spentByTag });

let log = () => {};
export const setLlmLog = (fn) => (log = fn);

let claudePausedUntil = 0;

export async function askJson(system, user, { maxTokens = 1500, effort = "none", tag = "other" } = {}) {
  const o = { effort, tag };
  if (USE_CLAUDE && Date.now() >= claudePausedUntil) {
    try {
      return await withRetry((mt) => claudeCall(system, user, { ...o, maxTokens: mt }), maxTokens);
    } catch (err) {
      if (err.retry) throw err; // Modell hat geantwortet, nur kein JSON: kein Grund für den Ausweichweg
      claudePausedUntil = Date.now() + 15 * 60e3;
      log(`claude: ${err.message} → 15 min Pause${hasOpenRouter() ? ", solange OpenRouter" : ""}`);
    }
  }
  if (!hasOpenRouter()) return null;
  return withRetry((mt) => openRouterCall(system, user, { ...o, maxTokens: mt }), maxTokens);
}

async function withRetry(fn, maxTokens) {
  try {
    return await fn(maxTokens);
  } catch (err) {
    if (!err.retry) throw err;
    return fn(maxTokens * 2); // abgeschnitten: einmal mit mehr Platz
  }
}

function parseJson(text, why) {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    if (!m) throw new Error("kein JSON");
    return JSON.parse(m[0]);
  } catch {
    const err = new Error(`kein JSON (${why}, ${text.length} Zeichen): ${text.slice(0, 80)}`);
    err.retry = true;
    throw err;
  }
}

// ---------- Claude Code (Abo) ----------
// Leerer Arbeitsordner, damit Claude Code keine CLAUDE.md findet. Ein claude-Prozess braucht ~580 MB,
// daher standardmäßig nur einer zugleich (Dienst hat MemoryMax=800M, Server wenig freien RAM).
const CWD = path.join(os.tmpdir(), "zeroradar-claude");
const PARALLEL = Number(process.env.ZR_CLAUDE_PARALLEL || 1);
const CLAUDE_ARGS = [
  "-p", "--model", CLAUDE_MODEL, "--output-format", "json", "--tools", "", "--setting-sources", "",
  "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence",
  "--exclude-dynamic-system-prompt-sections", "--effort", "low",
];
let active = 0;
const waiting = [];
const acquire = () => (active < PARALLEL ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
const release = () => (waiting.length ? waiting.shift()() : active--);

async function claudeCall(system, user, { maxTokens, effort, tag }) {
  await acquire();
  try {
    fs.mkdirSync(CWD, { recursive: true });
    const env = {
      ...process.env,
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens),
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };
    delete env.ANTHROPIC_API_KEY; // nie versehentlich über die API abrechnen
    if (effort === "none") env.MAX_THINKING_TOKENS = "0";
    const raw = await run("claude", [...CLAUDE_ARGS, "--system-prompt", system], user, env, 180e3);
    let j;
    try {
      j = JSON.parse(raw);
    } catch {
      throw new Error(`unlesbare Ausgabe: ${raw.slice(0, 160)}`);
    }
    if (j.is_error) throw new Error(String(j.result || j.subtype).slice(0, 200));
    const cost = j.total_cost_usd || 0;
    aboUsd += cost;
    spentByTag[tag] = (spentByTag[tag] || 0) + cost;
    return parseJson(String(j.result || ""), j.stop_reason || j.subtype);
  } finally {
    release();
  }
}

function run(cmd, args, input, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: CWD, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (errOut += d));
    p.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0 || out.trim().startsWith("{")) resolve(out);
      else reject(new Error(`exit ${code ?? signal}: ${(errOut || out).trim().slice(0, 200)}`));
    });
    p.stdin.end(input);
  });
}

// ---------- OpenRouter (Ausweichweg, echtes Geld) ----------
async function openRouterCall(system, user, { maxTokens, effort, tag }) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.ZERORADAR_OPENROUTER_KEY}`,
      "content-type": "application/json",
      "x-title": "Zero Radar",
      "http-referer": "https://github.com/legifx/zeroradar",
    },
    body: JSON.stringify({
      model: OR_MODEL,
      max_tokens: maxTokens,
      temperature: 0.1,
      // Haiku denkt sonst adaptiv und verbraucht das Token-Budget, bevor JSON kommt
      reasoning: { effort },
      provider: { zdr: true, data_collection: "deny" },
      usage: { include: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  spentUsd += j.usage?.cost || 0;
  spentByTag[`or:${tag}`] = (spentByTag[`or:${tag}`] || 0) + (j.usage?.cost || 0);
  return parseJson(j.choices?.[0]?.message?.content || "", j.choices?.[0]?.finish_reason);
}
