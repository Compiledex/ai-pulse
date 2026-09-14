/**
 * RSS 2.0 / Atom parsing without a dependency.
 *
 * This is deliberately a forgiving, regex-based reader rather than a strict XML
 * parser: real-world feeds regularly contain invalid markup (unescaped "&",
 * stray HTML) that would make a strict parser reject the whole document. We
 * only need a handful of well-known fields from each entry.
 */

import {
  decodeEntities, htmlToText, parseAttrs, resolveUrl, truncate, xmlToHtml,
} from './text.mjs';

const SUMMARY_MAX = 280;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inner content of the first matching element, or null. */
function element(block, name) {
  const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i');
  return block.match(re)?.[1] ?? null;
}

/** Every opening (or self-closing) tag with this name, as attribute maps. */
function tags(block, name) {
  const re = new RegExp(`<${escapeRe(name)}\\b[^>]*>`, 'gi');
  return [...block.matchAll(re)].map((m) => parseAttrs(m[0]));
}

function firstText(block, names) {
  for (const name of names) {
    const raw = element(block, name);
    if (raw != null) {
      const text = htmlToText(xmlToHtml(raw));
      if (text) return text;
    }
  }
  return '';
}

function firstHtml(block, names) {
  for (const name of names) {
    const raw = element(block, name);
    if (raw != null && raw.trim()) return xmlToHtml(raw);
  }
  return '';
}

/** Images we never want as a card cover: tracking pixels, emoji, avatars. */
export function isJunkImage(url) {
  return /feedburner|pixel|\/emoji\/|gravatar\.com|\/avatar|spacer|blank\.gif|1x1|doubleclick|stats\.wp/i.test(url);
}

function looksLikeImage(attrs) {
  const type = attrs.type ?? '';
  if (attrs.medium === 'image' || type.startsWith('image/')) return true;
  if (attrs.medium || type) return false; // explicitly video/audio/etc.
  return /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(attrs.url ?? '') || !!attrs.url;
}

function pickImage(block, html, base) {
  const candidates = [];

  // media:content, largest first when widths are given.
  const media = tags(block, 'media:content')
    .filter(looksLikeImage)
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  candidates.push(...media.map((a) => a.url));
  candidates.push(...tags(block, 'media:thumbnail').map((a) => a.url));
  candidates.push(...tags(block, 'enclosure').filter((a) => (a.type ?? '').startsWith('image/')).map((a) => a.url));

  // First real <img> in the body (src or a lazy-loading attribute).
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    if (Number(a.width) === 1 || Number(a.height) === 1) continue;
    candidates.push(a.src, a['data-src'], a['data-lazy-src']);
  }

  for (const c of candidates) {
    const url = resolveUrl(c, base);
    if (url && !isJunkImage(url)) return url;
  }
  return null;
}

function parseDate(block, names) {
  for (const name of names) {
    const raw = element(block, name);
    if (!raw) continue;
    const date = new Date(decodeEntities(xmlToHtml(raw)).trim());
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function atomLink(block) {
  const links = tags(block, 'link');
  const alt = links.find((l) => l.href && (!l.rel || l.rel === 'alternate'));
  return alt?.href ?? links.find((l) => l.href)?.href ?? null;
}

/**
 * Parses a feed document into plain entries:
 *   { title, url, summary, image, published: Date }
 * Entries without a usable title, link or date are dropped.
 */
export function parseFeed(xml, feedUrl) {
  const isAtom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  const entries = [];
  for (const [, block] of xml.matchAll(blockRe)) {
    const title = firstText(block, ['title']);

    // RSS <link> holds text; Atom <link> is an empty tag with href.
    const rssLink = element(block, 'link');
    const rawLink = rssLink?.trim()
      ? decodeEntities(xmlToHtml(rssLink)).trim()
      : atomLink(block);
    const url = resolveUrl(rawLink, feedUrl);

    const published = parseDate(block, ['pubDate', 'published', 'dc:date', 'updated', 'a10:updated']);
    if (!title || !url || !published) continue;

    const body = firstHtml(block, ['content:encoded', 'content', 'description', 'summary']);
    const teaser = firstHtml(block, ['description', 'summary']) || body;

    entries.push({
      title,
      url,
      summary: truncate(htmlToText(teaser), SUMMARY_MAX),
      image: pickImage(block, `${body} ${teaser}`, url),
      published,
    });
  }
  return entries;
}

/**
 * Finds a page's share image (og:image / twitter:image) in its HTML head.
 * Returns an absolute URL or null.
 */
export function extractShareImage(html, pageUrl) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttrs(m[0]));
  const find = (key) => metas.find((a) => (a.property ?? a.name ?? '').toLowerCase() === key)?.content;
  const url = resolveUrl(find('og:image') ?? find('og:image:url') ?? find('twitter:image'), pageUrl);
  return url && !isJunkImage(url) ? url : null;
}

/** og:description / meta description, as plain text. */
export function extractDescription(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttrs(m[0]));
  const find = (key) => metas.find((a) => (a.property ?? a.name ?? '').toLowerCase() === key)?.content;
  return truncate(htmlToText(find('og:description') ?? find('description') ?? ''), SUMMARY_MAX);
}
