/**
 * Small, dependency-free helpers for turning scraped markup into clean text.
 *
 * Feeds are messy: the same "description" can arrive as CDATA-wrapped HTML,
 * entity-escaped HTML, or double-escaped entities. Everything that reaches the
 * page goes through these functions first.
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©', reg: '®',
  trade: '™', euro: '€', pound: '£', times: '×', laquo: '«', raquo: '»',
};

export function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : whole;
      } catch {
        return whole; // out-of-range code point
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Unwraps every CDATA section, leaving its contents untouched. */
export function unwrapCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * Raw XML node content -> the HTML string it represents.
 * CDATA content is literal; anything outside CDATA is XML-escaped and needs
 * one round of decoding. Mixed content (text + CDATA) is handled piecewise.
 */
export function xmlToHtml(raw) {
  if (!raw) return '';
  const parts = raw.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/);
  return parts
    .map((p) => (p.startsWith('<![CDATA[') ? unwrapCdata(p) : decodeEntities(p)))
    .join('');
}

export function stripTags(html) {
  return html
    .replace(/<(script|style|figcaption)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

/** HTML -> single-line plain text. */
export function htmlToText(html) {
  return decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

export function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** Parses the attributes of a single tag, e.g. `<meta a="1" b='2'>`. */
export function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

export function resolveUrl(href, base) {
  if (!href) return null;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = /^(utm_\w+|ref|ref_src|source|guccounter|mc_cid|mc_eid|fbclid|gclid)$/i;

/** A comparison key for URLs: no tracking params, hash, "www." or trailing slash. */
export function urlKey(href) {
  try {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    const query = url.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ''}`.toLowerCase();
  } catch {
    return href;
  }
}

/** A comparison key for headlines: letters and digits only. */
export function titleKey(title) {
  return title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}
