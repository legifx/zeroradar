// Kleiner fetch-Wrapper: Timeout, eigener User-Agent, ein Retry bei Netz-/5xx-Fehlern.
const UA = "zeroradar/0.1 (+https://github.com/legifx/zeroradar)";

export async function get(url, { headers = {}, timeout = 20000, as = "text" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.status = res.status;
        throw err;
      }
      return as === "json" ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      if (err.status && err.status < 500) break;
    }
  }
  throw lastErr;
}

export const getJson = (url, opts = {}) => get(url, { ...opts, as: "json" });
