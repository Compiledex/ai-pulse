/**
 * Builds the AI Pulse site.
 *
 *   node build.mjs    -> dist/ (static site) + dist/data/news.json (the snapshot)
 *
 * Runs every 30 minutes in GitHub Actions. Every source is fetched independently, so one
 * broken feed only removes (or freezes) that source — it never breaks the build.
 * The previous live snapshot is used as a cache: stories we already enriched
 * keep their images, and a source that is temporarily down keeps its last items.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { FOCUS } from './focus.mjs';
import { parseAnthropicIndex } from './lib/anthropic.mjs';
import { fingerprintAssets } from './lib/assets.mjs';
import { clusterStories } from './lib/clusters.mjs';
import {
  COVER_HEIGHT, COVER_WIDTH, BUDGET, generateImage, planCovers, poolCover,
} from './lib/covers.mjs';
import { extractDescription, extractShareImage, parseFeed } from './lib/feed.mjs';
import { fromGoogleNews, resolveGoogleNewsUrl, searchUrl } from './lib/googlenews.mjs';
import { fetchJson, fetchText, mapLimit } from './lib/http.mjs';
import { dailyPapers, trendingModels, trendingModelsBy } from './lib/huggingface.mjs';
import {
  carryOver, dropBoilerplateSummaries, LIMITS, mergeItems, normalizeEntries, reusePrevious,
} from './lib/pipeline.mjs';
import {
  isBrandedShareImage, MIN_WIDTH, PREFERRED_WIDTH, probeImageSize, sizeHint, upgradeImageUrl,
} from './lib/images.mjs';
import { fetchPortraits, findPerson, pickOverlay, PEOPLE } from './lib/people.mjs';
import { scheduleInfo } from './lib/schedule.mjs';
import { isAboutAI, tagTopics, TOPICS } from './lib/topics.mjs';
import { CATEGORIES, SOURCES } from './sources.mjs';

const OUT = 'dist';
const SITE_URL = 'https://compiledex.github.io/ai-pulse/';
const PREVIOUS_SNAPSHOT = process.env.PREVIOUS_SNAPSHOT ?? `${SITE_URL}data/news.json`;

/** Page lookups for share images per build; the rest wait for the next build. */
const IMAGE_LOOKUPS = 150;

/** Google News links resolved per build (two requests each); the rest wait. */
const LINK_RESOLVES = 80;

/** Pictures measured per build (first bytes only); the rest wait. */
const IMAGE_PROBES = 300;

/** Bumped when the AI filter gets stricter, so stories kept from earlier builds are checked again once. */
const FILTER_VERSION = 2;

/** Publishing fewer stories than this means something is badly wrong upstream. */
const MIN_ITEMS = 25;

const log = (...args) => console.log(...args);

async function loadPrevious() {
  if (process.env.PREVIOUS_SNAPSHOT === '') return null;
  try {
    const snap = await fetchJson(PREVIOUS_SNAPSHOT, { timeoutMs: 15000 });
    log(`previous snapshot: ${snap.items?.length ?? 0} items from ${snap.generatedAt}`);
    return snap;
  } catch (err) {
    log(`previous snapshot unavailable (${err.message}) — building from scratch`);
    return null;
  }
}

async function readFeed(source, url) {
  const body = await fetchText(url, { timeoutMs: 20000 });
  if (source.kind === 'anthropic') return parseAnthropicIndex(body, url);
  if (source.kind === 'googlenews') return fromGoogleNews(parseFeed(body, url), { keepPublisher: false });
  return parseFeed(body, url);
}

/**
 * The source's main feed plus its `more` section feeds (kept to AI stories).
 * A failing section feed is logged and skipped; only the main feed failing
 * counts as the source being down.
 */
async function readSource(source) {
  const [main, ...extra] = await Promise.allSettled([source.url, ...(source.more ?? [])].map((url) => readFeed(source, url)));
  if (main.status === 'rejected') throw main.reason;

  const entries = [...main.value];
  extra.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      entries.push(...result.value.filter((e) => isAboutAI(e.title)).map((e) => ({ ...e, fromSection: true })));
    }
    else log(`    ${source.name}: section feed ${source.more[i]} failed: ${result.reason.message}`);
  });
  if (entries.length === 0) throw new Error('no entries found (feed format changed?)');
  return entries;
}

/** Results per AI kept from each Google News search, in Google's relevance order. */
const SEARCH_RESULTS_PER_AI = 15;

/**
 * "Around the web": one Google News search per AI. Each result remembers which
 * AI it was found for (`focus`), so it lands in that AI's tab even when its
 * headline doesn't literally name it.
 */
async function readWebSearch() {
  const searches = FOCUS.filter((f) => f.search);
  let failures = 0;
  const results = await mapLimit(searches, 3, async (f) => {
    try {
      const body = await fetchText(searchUrl(f.search), { timeoutMs: 20000 });
      return fromGoogleNews(parseFeed(body, 'https://news.google.com/'), { limit: SEARCH_RESULTS_PER_AI })
        .map((e) => ({ ...e, focus: [f.id] }));
    } catch (err) {
      failures++;
      log(`    search for ${f.name} failed: ${err.message}`);
      return [];
    }
  });
  if (failures === searches.length) throw new Error('every search failed');
  return results.flat();
}

async function collectNews(previous, now) {
  const statuses = {};

  const lists = await Promise.all(SOURCES.map(async (source) => {
    const web = source.kind === 'websearch';
    const limit = web ? LIMITS.keepWebSearch : LIMITS.keepPerSource;
    try {
      const entries = web ? await readWebSearch() : await readSource(source);
      const fresh = normalizeEntries(source, entries, now, web ? { perSource: Infinity } : {});
      // Stories that have since scrolled out of the feed stay for 30 days.
      const recheckSections = previous?.filterVersion !== FILTER_VERSION;
      const items = carryOver(source, fresh, previous?.items, now, limit, { recheckSections });
      statuses[source.id] = { ok: true, count: items.length };
      log(`  ✓ ${source.name.padEnd(24)} ${String(items.length).padStart(3)} (${fresh.length} in feed now)`);
      return items;
    } catch (err) {
      const kept = carryOver(source, [], previous?.items, now, limit, { recheckSections: previous?.filterVersion !== FILTER_VERSION });
      statuses[source.id] = { ok: false, count: kept.length, error: err.message, stale: kept.length > 0 };
      log(`  ✗ ${source.name.padEnd(24)} ${err.message}${kept.length ? ` (keeping ${kept.length} previous)` : ''}`);
      return kept;
    }
  }));

  return { items: reusePrevious(mergeItems(lists), previous?.items), statuses };
}

const unresolved = (i) => i.googleUrl && i.url === i.googleUrl;

/** Swaps Google News redirect links for the real article URLs. */
async function resolveGoogleLinks(items) {
  const pending = items.filter((i) => unresolved(i) && i.image === null).slice(0, LINK_RESOLVES);
  let resolved = 0;
  await mapLimit(pending, 4, async (item) => {
    try {
      item.url = await resolveGoogleNewsUrl(item.googleUrl);
      resolved++;
    } catch (err) {
      if (err.permanent) item.image = ''; // keeps the Google link; don't try again
    }
  });
  log(`google news links: resolved ${resolved} of ${pending.length}`);
}

/**
 * Small feed pictures: ask the CDN for a larger rendition where the URL allows,
 * and queue the rest for a share-image lookup (the original stays in `feedImage`).
 */
function prepareImages(items) {
  let upgraded = 0;
  let queued = 0;
  for (const item of items) {
    // An earlier build picked a logo-stamped share image: go back to the feed's own picture.
    if (item.feedImage && isBrandedShareImage(item.image)) {
      item.image = item.feedImage;
      delete item.feedImage;
      delete item.imageWidth;
      item.keepFeedImage = true;
    }
    if (!item.image?.startsWith('http') || item.imageWidth) continue;
    const better = upgradeImageUrl(item.image);
    if (better !== item.image) {
      item.feedImage ??= item.image;
      item.image = better;
      upgraded++;
    }
    const hint = sizeHint(item.image);
    if (hint !== null && hint < PREFERRED_WIDTH && !item.googleUrl && !item.keepFeedImage) {
      item.feedImage ??= item.image;
      item.image = null;
      queued++;
    }
  }
  log(`pictures: ${upgraded} upgraded to a larger rendition, ${queued} small ones queued for a share image`);
}

/** Fills in share images (and missing teasers) by reading each article's <head>. */
async function enrich(items) {
  // Unresolved Google links would only return Google's page; they wait for the next build.
  const pending = items.filter((i) => i.image === null && !unresolved(i)).slice(0, IMAGE_LOOKUPS);
  let found = 0;

  await mapLimit(pending, 10, async (item) => {
    try {
      const html = await fetchText(item.url, { timeoutMs: 8000, maxBytes: 400_000, retries: 0 });
      const found = extractShareImage(html, item.url);
      const share = isBrandedShareImage(found) && item.feedImage ? null : found;
      item.image = share ?? item.feedImage ?? '';
      if (!item.summary) {
        item.summary = extractDescription(html);
        item.topics = tagTopics(`${item.title} ${item.summary}`);
      }
      if (share) found++;
    } catch (err) {
      // A 4xx (e.g. bot protection) won't change next hour; a timeout might.
      if (err.status) item.image = item.feedImage ?? '';
    }
  });

  // Not looked up this time (or timed out): show the feed's picture meanwhile and try again next build.
  for (const item of items) {
    if (item.image === null && item.feedImage) {
      item.image = item.feedImage;
      delete item.feedImage;
    }
  }
  log(`share images: looked up ${pending.length}, found ${found}`);
}

/** Measures pictures once; ones too small to look good are dropped so the story gets an illustration. */
async function measureImages(items) {
  const pending = items.filter((i) => i.image?.startsWith('http') && !i.imageWidth).slice(0, IMAGE_PROBES);
  let dropped = 0;
  await mapLimit(pending, 12, async (item) => {
    try {
      const size = await probeImageSize(item.image);
      if (!size) return;
      item.imageWidth = size.width;
      if (size.width < MIN_WIDTH) {
        item.feedImage ??= item.image;
        item.image = '';
        dropped++;
      }
    } catch (err) {
      if (err.status === 404 || err.status === 410) {
        item.feedImage ??= item.image;
        item.image = '';
        item.imageWidth = 1;
      }
      // Anything else (e.g. hotlink protection for servers) may still load in a browser; leave it.
    }
  });
  log(`pictures: measured ${pending.length}, dropped ${dropped} under ${MIN_WIDTH}px`);
}

/* ---------- Pictures for picture-less stories ------------------------ */

const COVERS_DIR = '.covers'; // kept between builds by the Actions cache
const PORTRAIT_REFRESH_MS = 7 * 24 * 3600 * 1000;

/**
 * Portraits for the known people these stories mention, reusing the previous
 * snapshot's lookups for a week. Sets `person` or `logo` on stories without a
 * picture. Returns the portraits the page needs.
 */
async function collectPortraits(items, previous, now) {
  const known = { ...(previous?.people ?? {}) };
  const companies = FOCUS.map((f) => ({ id: f.id, re: TOPICS.find((t) => t.id === f.topic).re }));

  // Only people mentioned in stories without a picture need a portrait.
  const mentioned = new Set(items
    .filter((i) => !i.image)
    .map((i) => findPerson(i.title, i.summary))
    .filter(Boolean));

  const stale = [...mentioned].filter((id) => !known[id] || now - (known[id].fetchedAt ?? 0) > PORTRAIT_REFRESH_MS);
  for (let i = 0; i < stale.length; i += 40) {
    const batch = stale.slice(i, i + 40);
    try {
      const found = await fetchPortraits(batch);
      for (const id of batch) known[id] = { ...(found[id] ?? { name: PEOPLE.find((p) => p.id === id).name }), fetchedAt: now };
    } catch (err) {
      log(`portraits: ${err.message} — keeping previous`);
    }
  }

  let shown = 0;
  for (const item of items) {
    delete item.person;
    delete item.logo;
    if (item.image) continue;
    const overlay = pickOverlay(item, known, companies);
    if (overlay.person) {
      item.person = overlay.person;
      shown++;
    }
    if (overlay.logo) item.logo = overlay.logo;
  }
  log(`portraits: ${shown} stories show a portrait · ${mentioned.size} people mentioned, ${stale.length} looked up`);

  // Every mentioned person's lookup is kept, portrait or not, so it isn't repeated for a week.
  return Object.fromEntries([...mentioned].filter((id) => known[id]).map((id) => [id, known[id]]));
}

/** Makes sure every cover the snapshot refers to exists locally, downloading from the live site if the cache lost it. */
async function restoreCovers(paths) {
  const missing = [...new Set(paths)].filter((p) => p && !existsSync(join(COVERS_DIR, p.replace(/^covers\//, ''))));
  let restored = 0;
  await mapLimit(missing, 8, async (rel) => {
    try {
      const res = await fetch(`${SITE_URL}${rel}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const file = join(COVERS_DIR, rel.replace(/^covers\//, ''));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      restored++;
    } catch {
      // Gone for good; the story just gets a pool cover instead.
    }
  });
  if (missing.length) log(`covers: restored ${restored} of ${missing.length} missing files from the live site`);
}

const ownCover = (i) => i.cover?.startsWith('covers/story/');

/** Bumped when the way pool pictures are handed out changes, so existing picks are redone once. */
const COVER_ASSIGNMENT_VERSION = 2;
const coverExists = (rel) => rel && existsSync(join(COVERS_DIR, rel.replace(/^covers\//, '')));

/**
 * AI illustrations: generates what today's budget allows (see lib/covers.mjs),
 * then gives every picture-less story either its own cover or one from the
 * theme pool. Returns the pool and budget for the next build.
 */
async function makeCovers(items, previous, now) {
  const pool = {};
  for (const [theme, list] of Object.entries(previous?.coverPool ?? {})) pool[theme] = [...list];
  await restoreCovers([...Object.values(pool).flat(), ...items.filter(ownCover).map((i) => i.cover)]);
  for (const theme of Object.keys(pool)) pool[theme] = pool[theme].filter(coverExists);
  for (const item of items) if (ownCover(item) && !coverExists(item.cover)) delete item.cover;

  let budget = previous?.coverBudget ?? null;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (token && accountId) {
    const recent = (i) => now - Date.parse(i.published) < 24 * 3600 * 1000;
    const stories = items.filter((i) => i.image === '' && !ownCover(i) && recent(i));
    const { plan, used } = planCovers({ pool, budget, stories, now });
    budget = { ...used };
    let made = 0;

    for (const task of plan) {
      try {
        const { jpeg, neurons } = await generateImage(task.prompt, { accountId, token });
        const webp = await sharp(jpeg).resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' }).webp({ quality: 74 }).toBuffer();
        const rel = task.kind === 'pool' ? `pool/${task.theme}-${task.variant}.webp` : `story/${task.id}.webp`;
        await mkdir(dirname(join(COVERS_DIR, rel)), { recursive: true });
        await writeFile(join(COVERS_DIR, rel), webp);
        budget.neurons += neurons;
        if (task.kind === 'pool') pool[task.theme] = [...new Set([...(pool[task.theme] ?? []), `covers/${rel}`])];
        else {
          budget.stories++;
          const item = items.find((i) => i.id === task.id);
          if (item) item.cover = `covers/${rel}`;
        }
        made++;
      } catch (err) {
        log(`covers: generation failed (${err.message})`);
        if (err.quota) {
          budget.neurons = BUDGET.neuronsPerDay; // done for today
          break;
        }
      }
    }
    log(`covers: generated ${made} of ${plan.length} planned · today ${Math.round(budget.neurons)} neurons, ${budget.stories} story covers`);
  } else {
    log('covers: no Cloudflare credentials — reusing existing covers only');
  }

  // Stories keep the pool picture they were given (carried over by reusePrevious);
  // new ones take the least-used variant of their theme, oldest story first.
  const poolPaths = new Set(Object.values(pool).flat());
  const reassign = previous?.coverAssignment !== COVER_ASSIGNMENT_VERSION;
  const usage = new Map();
  for (const item of items) {
    if (reassign && item.cover && !ownCover(item)) delete item.cover;
    if (item.image) delete item.cover;
    else if (item.cover && !ownCover(item) && !poolPaths.has(item.cover)) delete item.cover;
    if (item.cover) usage.set(item.cover, (usage.get(item.cover) ?? 0) + 1);
  }
  for (const item of [...items].reverse()) {
    if (item.image || item.cover) continue;
    const cover = poolCover(pool, item, usage);
    if (!cover) continue;
    item.cover = cover;
    usage.set(cover, (usage.get(cover) ?? 0) + 1);
  }
  return { pool, budget };
}

/** Copies the covers the snapshot uses into the site, and forgets story covers nothing uses any more. */
async function publishCovers(items, pool) {
  const used = new Set([...Object.values(pool).flat(), ...items.map((i) => i.cover).filter(Boolean)]);
  for (const rel of used) {
    const from = join(COVERS_DIR, rel.replace(/^covers\//, ''));
    if (!existsSync(from)) continue;
    await mkdir(dirname(join(OUT, rel)), { recursive: true });
    await cp(from, join(OUT, rel));
  }
  if (existsSync(join(COVERS_DIR, 'story'))) {
    for (const name of await readdir(join(COVERS_DIR, 'story'))) {
      if (!used.has(`covers/story/${name}`)) await rm(join(COVERS_DIR, 'story', name), { force: true });
    }
  }
}

async function withFallback(label, fn, fallback) {
  try {
    const value = await fn();
    log(`${label}: ${value.length}`);
    return value;
  } catch (err) {
    log(`${label}: failed (${err.message}) — keeping ${fallback?.length ?? 0} previous`);
    return fallback ?? [];
  }
}

/** Each focusable AI, with trending open models from its Hugging Face org(s). */
async function collectFocus(previous) {
  const previousModels = new Map((previous?.focus ?? []).map((f) => [f.id, f.models]));
  return Promise.all(FOCUS.map(async ({ hf, search, ...focus }) => {
    const models = hf.length
      ? await withFallback(`models by ${hf.join(', ')}`, () => trendingModelsBy(hf, 4), previousModels.get(focus.id))
      : [];
    return { ...focus, models };
  }));
}

async function main() {
  const now = Date.now();
  const previous = await loadPrevious();

  log('sources:');
  const collected = await collectNews(previous, now);
  const { statuses } = collected;
  await resolveGoogleLinks(collected.items);
  prepareImages(collected.items);
  await enrich(collected.items);
  await measureImages(collected.items);
  // Resolved links can reveal a search result as a story a direct source already has.
  const items = dropBoilerplateSummaries(mergeItems([collected.items]));
  // Which companies a headline itself names — a story *about* an AI, not one mentioning it in passing.
  for (const item of items) {
    const named = tagTopics(item.title).filter((t) => TOPICS.find((x) => x.id === t)?.kind === 'company');
    if (named.length) item.headlineTopics = named;
    else delete item.headlineTopics;
  }

  // Stories about the same event, and how many outlets cover it (the page ranks on it).
  const sourceName = Object.fromEntries(SOURCES.map((s) => [s.id, s.name]));
  const clusters = clusterStories(items, (i) => i.publisher ?? sourceName[i.source]);
  items.forEach((item, i) => {
    delete item.cluster;
    delete item.coverage;
    if (clusters[i].coverage > 1) Object.assign(item, clusters[i]);
  });
  log(`events: ${new Set(clusters.map((c) => c.cluster)).size} for ${items.length} stories, ${clusters.filter((c) => c.coverage >= 3).length} stories on events covered by 3+ outlets`);

  const people = await collectPortraits(items, previous, now);
  const { pool: coverPool, budget: coverBudget } = await makeCovers(items, previous, now);

  const [models, papers, focus] = await Promise.all([
    withFallback('trending models', () => trendingModels(12), previous?.models),
    withFallback('daily papers', () => dailyPapers(9, { now }), previous?.papers),
    collectFocus(previous),
  ]);

  if (items.length < MIN_ITEMS) {
    throw new Error(`only ${items.length} stories collected (minimum ${MIN_ITEMS}) — refusing to publish`);
  }

  const workflow = await readFile('.github/workflows/build.yml', 'utf8').catch(() => '');

  const schedule = scheduleInfo(workflow, now);

  const snapshot = {
    generatedAt: new Date(now).toISOString(),
    // `schedule` lets the page skip past runs GitHub never started; `nextUpdateAt`
    // stays for pages still running the previous version of app.js.
    nextUpdateAt: schedule?.nextUpdateAt ?? null,
    schedule: schedule && { minutes: schedule.minutes, deployLagMinutes: schedule.deployLagMinutes },
    categories: CATEGORIES,
    topics: TOPICS.map(({ id, label, kind }) => ({ id, label, kind })),
    sources: SOURCES.map(({ id, name, category, weight, color, home }) => ({
      id, name, category, weight, color, home, status: statuses[id],
    })),
    focus,
    people,
    coverPool,
    coverBudget,
    coverAssignment: COVER_ASSIGNMENT_VERSION,
    filterVersion: FILTER_VERSION,
    items,
    models,
    papers,
  };

  await rm(OUT, { recursive: true, force: true });
  await cp('site', OUT, { recursive: true });
  await fingerprintAssets(OUT);
  await mkdir(`${OUT}/data`, { recursive: true });
  await publishCovers(items, coverPool);
  await writeFile(`${OUT}/data/news.json`, JSON.stringify(snapshot));

  const failed = Object.values(statuses).filter((s) => !s.ok).length;
  log(`\nwrote ${OUT}/ — ${items.length} stories, ${SOURCES.length - failed}/${SOURCES.length} sources live`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
