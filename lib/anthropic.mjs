/**
 * Anthropic publishes no RSS feed, so we read the /news index page instead.
 *
 * Each story on that page is an <a href="/news/..."> that wraps a <time> and a
 * title (either a heading element or an element whose class mentions "title").
 * Class names are CSS-module hashes that change between deploys, so we only
 * rely on tag names and the word "title" — not on exact classes.
 */

import { htmlToText, resolveUrl } from './text.mjs';

export function parseAnthropicIndex(html, baseUrl) {
  const seen = new Set();
  const entries = [];

  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href="(\/news\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (seen.has(href)) continue;

    const rawDate = inner.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1];
    const rawTitle = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
      ?? inner.match(/<[a-z]+\b[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i)?.[1];
    if (!rawDate || !rawTitle) continue;

    const published = new Date(`${htmlToText(rawDate)} 12:00 UTC`);
    const title = htmlToText(rawTitle);
    const url = resolveUrl(href, baseUrl);
    if (!title || !url || Number.isNaN(published.getTime())) continue;

    // A paragraph inside the card, when present, is the teaser.
    const teaser = inner.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];

    seen.add(href);
    entries.push({ title, url, summary: teaser ? htmlToText(teaser) : '', image: null, published });
  }
  return entries;
}
