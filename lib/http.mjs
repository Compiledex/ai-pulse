const USER_AGENT = 'Mozilla/5.0 (compatible; AI-Pulse/1.0; +https://github.com/Compiledex/ai-pulse)';

/**
 * GET a URL as text with a timeout, one retry on network/5xx errors, and an
 * optional cap on how many bytes are read (enough to find a <head> without
 * downloading a whole article).
 */
export async function fetchText(url, { timeoutMs = 15000, maxBytes = Infinity, retries = 1, accept } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, ...(accept ? { accept } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        // 4xx won't get better by asking again.
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { final: true });
        throw err;
      }
      return await readCapped(res, maxBytes);
    } catch (err) {
      lastError = err;
      if (err.final) break;
    }
  }
  throw lastError;
}

async function readCapped(res, maxBytes) {
  if (!Number.isFinite(maxBytes)) return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, { ...options, accept: 'application/json' }));
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
