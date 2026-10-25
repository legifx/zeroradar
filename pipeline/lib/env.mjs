// Lädt .env.local / .env aus dem Projektordner, ohne gesetzte Variablen zu überschreiben.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VAR = path.join(ROOT, "var");

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export function makeLog({ echo = false } = {}) {
  const file = path.join(VAR, "pipeline.log");
  fs.mkdirSync(VAR, { recursive: true });
  return (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 5e6) fs.renameSync(file, `${file}.1`);
      fs.appendFileSync(file, line + "\n");
    } catch {}
    if (echo) console.log(line);
  };
}
