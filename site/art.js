/**
 * Generated cover art for stories without an image (or whose image fails to
 * load). Deterministic per story: the same headline always gets the same
 * picture, tinted with its source's colour.
 *
 * On top of the pattern goes either the neon logo of each AI the story is
 * about (`marks`), or — when it isn't about a particular AI — the outlet's
 * name set large, like a masthead.
 */

let uid = 0;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hueOf(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex ?? '');
  if (!m) return 260;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 250; // greys (e.g. WIRED) get a cool violet
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(h * 60 + 360) % 360;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const f = (n) => Math.round(n * 10) / 10;

function waves(r, W, H) {
  let out = '';
  const lines = 9;
  const amp = 10 + r() * 26;
  const freq = 1 + r() * 2.5;
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < lines; i++) {
    const y0 = (H / (lines + 1)) * (i + 1);
    let d = `M0 ${f(y0)}`;
    for (let x = 0; x <= W; x += 16) {
      const y = y0 + Math.sin((x / W) * Math.PI * 2 * freq + phase + i * 0.45) * amp * (0.4 + i / lines);
      d += ` L${x} ${f(y)}`;
    }
    out += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${f(0.05 + (i / lines) * 0.2)}" stroke-width="1.2"/>`;
  }
  return out;
}

function rings(r, W, H) {
  const cx = W * (0.25 + r() * 0.5);
  const cy = H * (0.2 + r() * 0.6);
  let out = '';
  for (let i = 1; i <= 14; i++) {
    const rad = i * (12 + r() * 3);
    out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="none" stroke="#fff" stroke-opacity="${f(0.28 - i * 0.017)}" stroke-width="${i % 3 === 0 ? 1.6 : 0.8}"/>`;
  }
  return out;
}

function network(r, W, H) {
  const pts = Array.from({ length: 16 }, () => [r() * W, r() * H]);
  let out = '';
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < 120) {
        out += `<line x1="${f(pts[i][0])}" y1="${f(pts[i][1])}" x2="${f(pts[j][0])}" y2="${f(pts[j][1])}" stroke="#fff" stroke-opacity="${f((1 - d / 120) * 0.35)}"/>`;
      }
    }
  }
  for (const [x, y] of pts) {
    const rad = 1.5 + r() * 3;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="#fff" fill-opacity="${f(0.4 + r() * 0.5)}"/>`;
  }
  return out;
}

function horizon(r, W, H) {
  const hy = H * (0.35 + r() * 0.15);
  const vx = W * (0.3 + r() * 0.4);
  let out = '';
  for (let i = -10; i <= 10; i++) {
    out += `<line x1="${f(vx)}" y1="${f(hy)}" x2="${f(vx + i * 60)}" y2="${H}" stroke="#fff" stroke-opacity="0.12"/>`;
  }
  for (let i = 1; i <= 7; i++) {
    const y = hy + (H - hy) * (i / 7) ** 1.8;
    out += `<line x1="0" y1="${f(y)}" x2="${W}" y2="${f(y)}" stroke="#fff" stroke-opacity="${f(0.05 + i * 0.02)}"/>`;
  }
  out += `<circle cx="${f(vx)}" cy="${f(hy - 6)}" r="${f(26 + r() * 20)}" fill="#fff" fill-opacity="0.12"/>`;
  return out;
}

const PATTERNS = [waves, rings, network, horizon];

/**
 * @param marks  up to three `{ svg, color }` logos, in order of relevance
 */
/** The neon logo tiles, also used over AI illustrations. */
export function marksHtml(marks) {
  return `<div class="art-marks">${marks.map((m) => `<span class="art-mark" style="--c:${esc(m.color)}">${m.svg}</span>`).join('')}</div>`;
}

export function coverArt(seed, color, label, marks = [], { bare = false } = {}) {
  const r = rng(hash(seed));
  const W = 400;
  const H = 225;
  const id = `a${uid++}`;
  const h1 = hueOf(color);
  const h2 = (h1 + (r() > 0.5 ? 1 : -1) * (40 + r() * 70) + 360) % 360;
  const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)](r, W, H);

  const g1 = [f(W * (0.1 + r() * 0.4)), f(H * r())];
  const g2 = [f(W * (0.5 + r() * 0.5)), f(H * r())];

  let overlay = '';
  if (marks.length) overlay = `${marksHtml(marks)}<span class="art-label">${esc(label)}</span>`;
  else if (!bare) overlay = `<span class="art-title">${esc(label)}</span>`;

  return `<div class="art" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 45% 10%)"/><stop offset="1" stop-color="hsl(${f(h2)} 55% 18%)"/></linearGradient>
<radialGradient id="${id}g1"><stop offset="0" stop-color="hsl(${h1} 90% 62%)" stop-opacity=".7"/><stop offset="1" stop-color="hsl(${h1} 90% 62%)" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}g2"><stop offset="0" stop-color="hsl(${f(h2)} 90% 62%)" stop-opacity=".55"/><stop offset="1" stop-color="hsl(${f(h2)} 90% 62%)" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id}b)"/>
<circle cx="${g1[0]}" cy="${g1[1]}" r="190" fill="url(#${id}g1)"/>
<circle cx="${g2[0]}" cy="${g2[1]}" r="160" fill="url(#${id}g2)"/>
${pattern}
</svg>${overlay}</div>`;
}
