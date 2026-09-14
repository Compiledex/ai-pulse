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

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { FOCUS } from './focus.mjs';
import { parseAnthropicIndex } from './lib/anthropic.mjs';
import { extractDescription, extractShareImage, parseFeed } from './lib/feed.mjs';
import { fetchJson, fetchText, mapLimit } from './lib/http.mjs';
import { dailyPapers, trendingModels, trendingModelsBy } from './lib/huggingface.mjs';
import {
  dropBoilerplateSummaries, mergeItems, normalizeEntries, reusePrevious,
} from './lib/pipeline.mjs';
import { scheduleInfo } from './lib/schedule.mjs';
import { tagTopics, TOPICS } from './lib/topics.mjs';
import { CATEGORIES, SOURCES } from './sources.mjs';

const OUT = 'dist';
const SITE_URL = 'https://compiledex.github.io/ai-pulse/';
const PREVIOUS_SNAPSHOT = process.env.PREVIOUS_SNAPSHOT ?? `${SITE_URL}data/news.json`;

/** Page lookups for share images per build; the rest wait for the next hour. */
const IMAGE_LOOKUPS = 150;

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

async function readSource(source) {
  const body = await fetchText(source.url, { timeoutMs: 20000 });
  const entries = source.kind === 'anthropic'
    ? parseAnthropicIndex(body, source.url)
    : parseFeed(body, source.url);
  if (entries.length === 0) throw new Error('no entries found (feed format changed?)');
  return entries;
}

async function collectNews(previous, now) {
  const statuses = {};

  const lists = await Promise.all(SOURCES.map(async (source) => {
    try {
      const items = normalizeEntries(source, await readSource(source), now);
      statuses[source.id] = { ok: true, count: items.length };
      log(`  ✓ ${source.name.padEnd(24)} ${items.length}`);
      return items;
    } catch (err) {
      const kept = (previous?.items ?? []).filter((i) => i.source === source.id);
      statuses[source.id] = { ok: false, count: kept.length, error: err.message, stale: kept.length > 0 };
      log(`  ✗ ${source.name.padEnd(24)} ${err.message}${kept.length ? ` (keeping ${kept.length} previous)` : ''}`);
      return kept;
    }
  }));

  return { items: reusePrevious(mergeItems(lists), previous?.items), statuses };
}

/** Fills in share images (and missing teasers) by reading each article's <head>. */
async function enrich(items) {
  const pending = items.filter((i) => i.image === null).slice(0, IMAGE_LOOKUPS);
  let found = 0;

  await mapLimit(pending, 10, async (item) => {
    try {
      const html = await fetchText(item.url, { timeoutMs: 8000, maxBytes: 400_000, retries: 0 });
      item.image = extractShareImage(html, item.url) ?? '';
      if (!item.summary) {
        item.summary = extractDescription(html);
        item.topics = tagTopics(`${item.title} ${item.summary}`);
      }
      if (item.image) found++;
    } catch (err) {
      // A 4xx (e.g. bot protection) won't change next hour; a timeout might.
      if (err.status) item.image = '';
    }
  });

  log(`share images: looked up ${pending.length}, found ${found}`);
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
  return Promise.all(FOCUS.map(async ({ hf, ...focus }) => {
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
  await enrich(collected.items);
  const items = dropBoilerplateSummaries(collected.items);

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
    items,
    models,
    papers,
  };

  await rm(OUT, { recursive: true, force: true });
  await cp('site', OUT, { recursive: true });
  await mkdir(`${OUT}/data`, { recursive: true });
  await writeFile(`${OUT}/data/news.json`, JSON.stringify(snapshot));

  const failed = Object.values(statuses).filter((s) => !s.ok).length;
  log(`\nwrote ${OUT}/ — ${items.length} stories, ${SOURCES.length - failed}/${SOURCES.length} sources live`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
