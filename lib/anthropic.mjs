/**
 * Anthropic publishes no RSS feed, so we read the /news index page instead.
 *
 * The page embeds its content as Next.js "flight" data: `post` objects for the
 * news archive (title, slug, publishedOn, summary) and `featuredGridLink`
 * objects for featured items, which can live outside /news/ — e.g. a model
 * launch at /claude-fable-and-mythos-5-1 or a report at
 * /threat-intelligence-report-september-2026. Reading that data catches both.
 *
 * The rendered links are parsed too, as a fallback in case the embedded data
 * changes shape. Class names there are CSS-module hashes that change between
 * deploys, so that parser only relies on tag names and the word "title".
 */

import { htmlToText, resolveUrl, truncate } from './text.mjs';

/** Concatenated, unescaped payload of every `self.__next_f.push([1, "..."])` script. */
export function flightData(html) {
  let out = '';
  for (const [, chunk] of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      out += JSON.parse(`"${chunk}"`);
    } catch {
      // A malformed chunk shouldn't cost us the rest.
    }
  }
  return out;
}

/** Every JSON object in `text` that starts with `{"_type":"<type>"`, parsed. */
export function objectsOfType(text, type) {
  const marker = `{"_type":"${type}"`;
  const found = [];
  let start = text.indexOf(marker);
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let end = start;
    for (; end < text.length; end++) {
      const c = text[end];
      if (inString) {
        if (c === '\\') end++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    try {
      found.push(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // Skip anything that isn't a complete object.
    }
    start = text.indexOf(marker, end + 1);
  }
  return found;
}

/** featuredGridLink objects start with "_key", so they need a looser search. */
function featuredLinks(text) {
  const found = [];
  for (const m of text.matchAll(/\{"_key":"[^"]*","_type":"featuredGridLink"/g)) {
    const rest = `{"_type":"featuredGridLink"${text.slice(m.index + m[0].length)}`;
    const [obj] = objectsOfType(rest, 'featuredGridLink');
    if (obj) found.push(obj);
  }
  return found;
}

function fromFlight(html, baseUrl) {
  const flight = flightData(html);
  if (!flight) return [];

  const posts = objectsOfType(flight, 'post').map((p) => ({
    title: htmlToText(p.title ?? ''),
    url: p.slug?.current ? resolveUrl(`/news/${p.slug.current}`, baseUrl) : null,
    summary: truncate(htmlToText(p.summary ?? ''), 280),
    image: p.cardPhoto?.url && !/\.svg(\?|$)/.test(p.cardPhoto.url) ? p.cardPhoto.url : null,
    published: new Date(p.publishedOn),
  }));

  const featured = featuredLinks(flight).map((f) => ({
    title: htmlToText(f.title ?? ''),
    url: resolveUrl(f.url, baseUrl),
    summary: truncate(htmlToText(f.summary ?? ''), 280),
    image: null,
    published: new Date(`${f.date}T12:00:00Z`),
  }));

  return [...featured, ...posts];
}

function fromLinks(html, baseUrl) {
  const entries = [];
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href="(\/news\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const rawDate = inner.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1];
    const rawTitle = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
      ?? inner.match(/<[a-z]+\b[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i)?.[1];
    if (!rawDate || !rawTitle) continue;

    // A paragraph inside the card, when present, is the teaser.
    const teaser = inner.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    entries.push({
      title: htmlToText(rawTitle),
      url: resolveUrl(href, baseUrl),
      summary: teaser ? htmlToText(teaser) : '',
      image: null,
      published: new Date(`${htmlToText(rawDate)} 12:00 UTC`),
    });
  }
  return entries;
}

export function parseAnthropicIndex(html, baseUrl) {
  const seen = new Set();
  const entries = [];
  // Embedded data first: it has exact timestamps and the off-/news/ links.
  for (const e of [...fromFlight(html, baseUrl), ...fromLinks(html, baseUrl)]) {
    if (!e.title || !e.url || Number.isNaN(e.published.getTime())) continue;
    const key = e.url.replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }
  return entries;
}
