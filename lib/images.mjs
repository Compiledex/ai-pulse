/**
 * Keeping story pictures sharp.
 *
 * Several feeds only carry thumbnails — BBC's are 240px wide, the Guardian's
 * 700px, Import AI's 150px — which look pixelated stretched over a card. The
 * build therefore:
 *   1. asks the image CDN for a larger rendition when its URL allows it,
 *   2. uses the article's own share image instead of a feed image whose URL
 *      says it's small,
 *   3. measures every picture once, and drops ones too small to look good,
 *      so those stories get an AI illustration instead.
 */

import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');

/** Pictures narrower than this aren't worth showing on a card. */
export const MIN_WIDTH = 480;

/** Feed images whose URL says they're narrower than this get swapped for the share image. */
export const PREFERRED_WIDTH = 1000;

/** Same picture, larger rendition, for CDNs whose URLs encode the size. */
export function upgradeImageUrl(url) {
  if (!url) return url;
  // BBC ichef: .../ace/standard/240/... (the share-image variant adds a branding bar, so stay on "standard")
  if (/^https:\/\/ichef\.bbci\.co\.uk\/(ace|news)\//.test(url)) {
    return url.replace(/\/(ace|news)\/(standard|ws)\/\d+\//, '/ace/standard/1536/');
  }
  // WordPress Photon (i0.wp.com): size query parameters shrink the original
  if (/^https:\/\/i\d\.wp\.com\//.test(url)) {
    const u = new URL(url);
    for (const key of ['resize', 'fit', 'w', 'h']) u.searchParams.delete(key);
    return u.href;
  }
  // Google-hosted images: =w528-h297-... sizing suffix
  if (/^https:\/\/lh\d\.googleusercontent\.com\//.test(url)) {
    return url.replace(/=([whs]\d+(-[a-z0-9]+)*)$/i, '=w1600');
  }
  return url;
}

/**
 * Share images some publishers stamp with their logo (the Guardian adds an
 * "overlay" to its og:image). The unbranded feed picture looks better.
 */
export function isBrandedShareImage(url) {
  return /[?&]overlay-(base64|align|width)=/.test(url ?? '');
}

/** The width a URL says the image has, when it says so; otherwise null. */
export function sizeHint(url) {
  if (!url) return null;
  const patterns = [
    /\/(?:ace|news)\/(?:standard|ws)\/(\d+)\//, // BBC ichef
    /[?&](?:width|w)=(\d+)\b/, // ?width=700
    /[?&]resize=(\d+)(?:%2C|,)/i, // ?resize=150,150
    /\.max-(\d+)x\d+/, // Google blog .max-600x600
    /\.width-(\d+)\./, // Google blog .width-600.
    /[,/]w_(\d+)[,/]/, // Cloudinary / Substack w_600
    /=w(\d+)(?:-|$)/, // googleusercontent =w528
    /-(\d{2,4})x\d{2,4}\.(?:jpe?g|png|webp)(?:\?|$)/i, // WordPress -300x200.jpg
  ];
  for (const re of patterns) {
    const m = re.exec(url);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Reads just enough of an image to learn its dimensions.
 * Returns { width, height } or null when it can't be read.
 */
export async function probeImageSize(url, { timeoutMs = 10000, maxBytes = 256 * 1024 } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; AI-Pulse/1.0; +https://github.com/Compiledex/ai-pulse)', range: `bytes=0-${maxBytes - 1}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });

  const chunks = [];
  let size = 0;
  const reader = res.body.getReader();
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});

  try {
    const { width, height } = await sharp(Buffer.concat(chunks), { failOn: 'none' }).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}
