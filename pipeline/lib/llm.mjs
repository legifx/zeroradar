// OpenRouter-Aufruf mit Zero Data Retention. Ohne Key liefert ask() null,
// die Pipeline läuft dann mit Rohdaten weiter.
const API = "https://openrouter.ai/api/v1/chat/completions";
export const MODEL = process.env.ZERORADAR_MODEL || "anthropic/claude-haiku-5.5";

export const llmAvailable = () => Boolean(process.env.ZERORADAR_OPENROUTER_KEY);

let spentUsd = 0;
export const spent = () => spentUsd;

export async function askJson(system, user, { maxTokens = 700 } = {}) {
  if (!llmAvailable()) return null;
  const res = await fetch(API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.ZERORADAR_OPENROUTER_KEY}`,
      "content-type": "application/json",
      "x-title": "Zero Radar",
      "http-referer": "https://github.com/legifx/zeroradar",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.1,
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
  const text = j.choices?.[0]?.message?.content || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`kein JSON in Antwort: ${text.slice(0, 120)}`);
  return JSON.parse(m[0]);
}
