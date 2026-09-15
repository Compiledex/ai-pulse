/**
 * AI-generated illustrations for stories that have no picture of their own.
 *
 * Images come from Cloudflare Workers AI (FLUX.1 schnell), all in one visual
 * style that matches the page, so a feed mixing press photos and generated
 * art still reads as one design. Prompts never name real people and ask for
 * no faces, text or logos: an invented image of a real person on a news page
 * would look like a real photo of something that didn't happen.
 *
 * The free tier allows 10,000 "neurons" a day and one image costs ~173, so
 * the budget is spent in this order (see planCovers):
 *   1. a small pool of illustrations per theme, so every picture-less story
 *      can get one immediately;
 *   2. an illustration of its own for the newest stories;
 *   3. growing the pool, so older stories repeat less.
 */

import { PERSON_PATTERNS } from './people.mjs';

// The model renders 1024px wide; keep all of it so large cards stay sharp.
export const COVER_WIDTH = 1024;
export const COVER_HEIGHT = 576;

export const BUDGET = {
  neuronsPerDay: 9500, // stay just under the 10,000 free neurons
  neuronsPerImage: 175, // measured: 172.8 at 4 steps; the real figure is read from each response
  imagesPerBuild: 24,
  storiesPerDay: 36, // leaves room every day for the pool to keep growing
  poolStart: 2,
  poolFull: 6,
};

const STYLE = 'Wordless editorial illustration for a technology news website, purely visual. Dark navy and near-black background, glowing neon violet, cyan and magenta accents, soft cinematic volumetric light, clean modern composition with depth, high detail. The image contains absolutely no writing of any kind: no text, no letters, no words, no numbers, no signs, no labels, no logos, no watermarks, and no human faces.';

/** Themes follow topic ids from lib/topics.mjs, most specific first. */
export const THEMES = [
  { id: 'chips', subjects: ['glowing semiconductor chips on a circuit board', 'a vast data center corridor of server racks', 'a single processor chip radiating light', 'rows of GPUs linked by beams of light', 'a silicon wafer under a lens', 'cooling towers and power lines feeding a data center'] },
  { id: 'robotics', subjects: ['a sleek robotic arm assembling parts', 'a humanoid robot silhouette in a lab', 'a self-driving car made of light on a night road', 'factory robots working in formation', 'a robot hand reaching toward a glowing sphere', 'warehouse robots moving between shelves'] },
  { id: 'policy', subjects: ['a government building with classical columns', 'a judge\'s gavel resting beside a glowing circuit', 'a parliament chamber seen from above', 'balanced scales with digital particles', 'a legal document dissolving into data', 'a flag-lined hall with a glowing podium'] },
  { id: 'safety', subjects: ['a translucent shield protecting a neural network', 'a red warning light inside a server room', 'a padlock made of light around a glowing core', 'a control room with alert screens', 'a large emergency switch on a console', 'a protective dome over a city of data'] },
  { id: 'business', subjects: ['rising and falling stock charts made of light', 'a trading floor with glowing screens', 'stacks of coins turning into data streams', 'a skyscraper skyline reflected in a market chart', 'a handshake silhouette formed by circuits', 'a candlestick chart over a city at night'] },
  { id: 'coding', subjects: ['floating code editor windows', 'a developer desk with multiple monitors of code', 'a terminal window with glowing brackets', 'building blocks of software snapping together', 'a keyboard with light trails', 'a branching git tree of light'] },
  { id: 'agents', subjects: ['autonomous AI agents as glowing nodes completing tasks', 'a network of small assistants passing tasks along beams', 'a digital assistant orb operating several screens', 'an automated workflow of connected boxes', 'drones of light carrying documents', 'a conductor orchestrating streams of tasks'] },
  { id: 'media', subjects: ['film frames and paintbrush strokes merging into pixels', 'a camera lens reflecting generated worlds', 'a digital canvas painting itself', 'a cinema screen of swirling colors', 'photographs morphing into abstract art', 'a sound wave turning into video frames'] },
  { id: 'open-source', subjects: ['an open doorway flooded with light and code', 'a community of connected nodes sharing files', 'a library of glowing model files', 'interlocking puzzle pieces of light', 'a public square of floating repositories', 'open hands releasing glowing cubes'] },
  { id: 'research', subjects: ['a science lab with glowing experiments', 'a mathematical landscape of equations as terrain', 'a microscope examining a neural network', 'a brain made of constellations', 'scientific charts floating in space', 'a telescope aimed at a galaxy of data'] },
  { id: 'general', subjects: ['an abstract neural network of glowing nodes', 'data streams flowing through a dark tunnel', 'a luminous artificial brain', 'a horizon of circuits under a neon sky', 'a sphere of intelligence pulsing with light', 'a digital landscape of flowing particles'] },
];

export function themeOf(item) {
  return THEMES.find((t) => item.topics?.includes(t.id))?.id ?? 'general';
}

/** The headline with real people's names and quotes removed. */
export function neutralHeadline(title) {
  let text = title;
  for (const re of PERSON_PATTERNS) text = text.replace(re, '');
  return text
    .replace(/['"‘’“”]/g, '')
    .replace(/\b(says|said|tells|told|warns|claims)\b.*$/i, '') // who said it isn't depictable
    .replace(/\s+([,:;])/g, '$1')
    .replace(/^[\s,:;–—-]+|[\s,:;–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function poolPrompt(themeId, variant) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES.at(-1);
  return `${theme.subjects[variant % theme.subjects.length]}. ${STYLE}`;
}

export function storyPrompt(item) {
  const theme = THEMES.find((t) => t.id === themeOf(item));
  const headline = neutralHeadline(item.title);
  const subject = theme.subjects[(item.id?.charCodeAt(0) ?? 0) % theme.subjects.length];
  return `A symbolic, conceptual illustration for the news story "${headline}", featuring ${subject}. ${STYLE}`;
}

/**
 * What to generate this build, within today's budget:
 *   [{ kind: 'pool', theme, variant, prompt } | { kind: 'story', id, prompt }]
 * `stories` are candidates (newest first) that need a cover of their own.
 */
export function planCovers({ pool, budget, stories, now = Date.now() }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const used = budget?.day === today ? budget : { day: today, neurons: 0, stories: 0 };
  let images = Math.min(BUDGET.imagesPerBuild, Math.floor((BUDGET.neuronsPerDay - used.neurons) / BUDGET.neuronsPerImage));
  let storyAllowance = BUDGET.storiesPerDay - used.stories;
  const plan = [];

  const fillPool = (upTo) => {
    for (let variant = 0; variant < upTo; variant++) {
      for (const theme of THEMES) {
        if (images <= 0) return;
        if ((pool[theme.id] ?? []).length > variant) continue;
        plan.push({ kind: 'pool', theme: theme.id, variant, prompt: poolPrompt(theme.id, variant) });
        images--;
      }
    }
  };

  fillPool(BUDGET.poolStart);
  for (const story of stories) {
    if (images <= 0 || storyAllowance <= 0) break;
    plan.push({ kind: 'story', id: story.id, prompt: storyPrompt(story) });
    images--;
    storyAllowance--;
  }
  fillPool(BUDGET.poolFull);
  return { plan, used };
}

/**
 * A pool illustration for a story with no cover of its own: the variant of its
 * theme that the fewest stories are using (`usage` maps path -> count), so
 * neighbouring stories rarely share a picture. Ties are broken by the story
 * id, so the same inputs always give the same pick.
 */
export function poolCover(pool, item, usage = new Map()) {
  const list = pool[themeOf(item)]?.length ? pool[themeOf(item)] : pool.general ?? [];
  if (!list.length) return null;
  let h = 0;
  for (const c of item.id ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = h % list.length;
  let best = null;
  for (let k = 0; k < list.length; k++) {
    const candidate = list[(start + k) % list.length];
    if (best === null || (usage.get(candidate) ?? 0) < (usage.get(best) ?? 0)) best = candidate;
  }
  return best;
}

/**
 * One image from Workers AI, as JPEG bytes plus the neurons it cost.
 * Throws with `quota: true` when the daily allocation is used up.
 */
export async function generateImage(prompt, { accountId, token, timeoutMs = 60000 }) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 4 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success || !body.result?.image) {
    const message = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    const quota = res.status === 429 || /allocation|quota|limit|neurons/i.test(message);
    throw Object.assign(new Error(message), { quota });
  }
  return { jpeg: Buffer.from(body.result.image, 'base64'), neurons: body.result.usage?.neurons ?? BUDGET.neuronsPerImage };
}
