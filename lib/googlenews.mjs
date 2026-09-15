/**
 * Google News search feeds.
 *
 * Used twice: for outlets that publish no feed of their own (Reuters, via a
 * site: search), and for "Around the web" — one search per AI, which is the
 * closest thing to what you'd see by googling it.
 *
 * The feed's links are news.google.com redirects and it carries no teaser or
 * image (its <description> just repeats the headline). The build resolves each
 * redirect to the real article (resolveGoogleNewsUrl), which gives a direct
 * link and lets the usual share-image lookup find a picture.
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; AI-Pulse/1.0; +https://github.com/Compiledex/ai-pulse)';

export function searchUrl(query, { days = 7 } = {}) {
  const q = encodeURIComponent(`${query} when:${days}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/** Headlines arrive as "Title - Publisher"; drop the suffix when it names the publisher. */
export function stripPublisher(title, publisher) {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

/**
 * Parsed Google News entries -> entries ready for normalizeEntries.
 * `keepPublisher` stores the original outlet so the page can show "Reuters
 * via Google News" instead of just "Google News".
 */
export function fromGoogleNews(entries, { keepPublisher = true, limit = Infinity } = {}) {
  return entries.slice(0, limit).map((e) => ({
    ...e,
    title: stripPublisher(e.title, e.publisher),
    summary: '', // only repeats the headline and outlet
    image: null, // looked up once the link is resolved to the real article
    publisher: keepPublisher ? e.publisher : null,
    via: 'Google News',
    googleUrl: e.url, // stable identity for caching, even after `url` is resolved
  }));
}

/** The article id is the last path segment of .../rss/articles/<id>. */
export function articleId(googleUrl) {
  try {
    const { hostname, pathname } = new URL(googleUrl);
    if (hostname !== 'news.google.com') return null;
    return pathname.split('/').pop() || null;
  } catch {
    return null;
  }
}

/** The signature and timestamp Google embeds in an article page, needed to ask for the real URL. */
export function parseArticleParams(html) {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  return signature && timestamp ? { signature, timestamp: Number(timestamp) } : null;
}

/** Form body for Google News' own "get article URL" call (what its redirect page does). */
export function decodeRequestBody(id, { signature, timestamp }) {
  const inner = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id, timestamp, signature,
  ]);
  return new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', inner, null, 'generic']]]) }).toString();
}

/** Pulls the article URL out of the batchexecute response, or null. */
export function parseDecodeResponse(text) {
  try {
    const [, json] = text.split('\n\n');
    const payload = JSON.parse(json)[0][2];
    const url = JSON.parse(payload)[1];
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * news.google.com/rss/articles/<id> -> the publisher's article URL.
 * Throws with `permanent: true` when the link can't ever be resolved, so the
 * build stops retrying it; other errors (timeouts, rate limits) retry next build.
 */
export async function resolveGoogleNewsUrl(googleUrl, { timeoutMs = 10000 } = {}) {
  const permanent = (message) => Object.assign(new Error(message), { permanent: true });
  const id = articleId(googleUrl);
  if (!id) throw permanent('not a Google News article link');

  const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!page.ok) throw Object.assign(new Error(`HTTP ${page.status}`), { permanent: page.status === 404 });
  const params = parseArticleParams(await page.text());
  if (!params) throw permanent('no signature on the article page');

  const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': USER_AGENT },
    body: decodeRequestBody(id, params),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const url = parseDecodeResponse(await res.text());
  if (!url) throw new Error('no URL in the response');
  return url;
}
