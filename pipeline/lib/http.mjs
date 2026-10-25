// Kleiner fetch-Wrapper: Timeout, eigener User-Agent, ein Retry bei Netz-/5xx-Fehlern,
// bedingte Anfragen (ETag/Last-Modified), damit häufiges Abfragen die Quellen kaum belastet.
const UA = "zeroradar/0.2 (+https://github.com/legifx/zeroradar)";

async function request(url, { headers = {}, timeout = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok && res.status !== 304) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (err.status && err.status < 500) break;
    }
  }
  throw lastErr;
}

export async function get(url, opts = {}) {
  const res = await request(url, opts);
  return opts.as === "json" ? res.json() : res.text();
}

export const getJson = (url, opts = {}) => get(url, { ...opts, as: "json" });

/**
 * Bedingter Abruf. cache: {etag, lastModified} vom letzten Mal (wird aktualisiert).
 * Gibt null zurück, wenn sich nichts geändert hat (304).
 */
export async function getIfChanged(url, cache, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cache?.etag) headers["if-none-match"] = cache.etag;
  if (cache?.lastModified) headers["if-modified-since"] = cache.lastModified;
  const res = await request(url, { ...opts, headers });
  if (res.status === 304) return null;
  if (cache) {
    cache.etag = res.headers.get("etag") || undefined;
    cache.lastModified = res.headers.get("last-modified") || undefined;
  }
  return opts.as === "json" ? res.json() : res.text();
}
