/**
 * Pure data transforms between "raw entries per source" and the snapshot the
 * page reads. No network access here, so all of it is unit-tested.
 */

import { createHash } from 'node:crypto';
import { isAboutAI, tagTopics } from './topics.mjs';
import { titleKey, urlKey } from './text.mjs';

const DAY = 24 * 3600 * 1000;

export const LIMITS = {
  maxAgeDays: 30,
  perSource: 20,
  totalItems: 600,
};

function idFor(url) {
  return createHash('sha1').update(urlKey(url)).digest('hex').slice(0, 12);
}

/**
 * hnrss descriptions look like
 *   "Article URL: … Comments URL: https://news.ycombinator.com/item?id=1 Points: 312 # Comments: 140"
 * which is noise as a teaser. Turn it into a one-liner and keep the thread link.
 */
export function hackerNewsDetails(summary) {
  const points = summary.match(/Points:\s*(\d+)/i)?.[1];
  const comments = summary.match(/#\s*Comments:\s*(\d+)/i)?.[1];
  const discussion = summary.match(/Comments URL:\s*(https:\/\/news\.ycombinator\.com\/item\?id=\d+)/i)?.[1] ?? null;
  const parts = [points && `${points} points`, comments && `${comments} comments`].filter(Boolean);
  return {
    summary: parts.length ? `${parts.join(' · ')} on Hacker News` : '',
    discussion,
  };
}

/**
 * Raw parsed entries for one source -> page items (recent, capped, tagged).
 * Sources marked `aiOnly` keep only stories that are about AI. Optional entry
 * fields pass through: `publisher`, `via` and `googleUrl` (stories found through
 * Google News) and `focus` (ids of the AIs a search result was found for).
 */
export function normalizeEntries(source, entries, now = Date.now(), { perSource = LIMITS.perSource } = {}) {
  const cutoff = now - LIMITS.maxAgeDays * DAY;

  return entries
    .filter((e) => e.published.getTime() >= cutoff)
    .filter((e) => !source.aiOnly || isAboutAI(`${e.title} ${e.summary}`))
    .sort((a, b) => b.published - a.published)
    .slice(0, perSource)
    .map((e) => {
      let { summary } = e;
      let discussion = null;
      if (source.id === 'hn') ({ summary, discussion } = hackerNewsDetails(summary));

      // Some feeds post-date entries; never show a story as "in 3 hours".
      const published = new Date(Math.min(e.published.getTime(), now)).toISOString();

      return {
        id: idFor(e.url),
        title: e.title,
        url: e.url,
        source: source.id,
        summary,
        image: e.image ?? null,
        published,
        topics: tagTopics(`${e.title} ${summary}`),
        ...(discussion ? { discussion } : {}),
        ...(e.publisher ? { publisher: e.publisher } : {}),
        ...(e.via ? { via: e.via } : {}),
        ...(e.googleUrl ? { googleUrl: e.googleUrl } : {}),
        ...(e.focus?.length ? { focus: [...e.focus] } : {}),
      };
    });
}

/**
 * Merges per-source item lists (in source priority order), drops duplicates by
 * URL and by headline, and returns the newest `LIMITS.totalItems`.
 * When a dropped duplicate was found for particular AIs (`focus`), the story
 * that stays inherits them, so it still shows up in those AI tabs.
 */
export function mergeItems(lists) {
  const byUrl = new Map();
  const byTitle = new Map();
  const merged = [];

  for (const list of lists) {
    for (const item of list) {
      const u = urlKey(item.url);
      const t = titleKey(item.title);
      const kept = byUrl.get(u) ?? (t.length > 12 ? byTitle.get(t) : undefined);
      if (kept) {
        if (item.focus?.length) kept.focus = [...new Set([...(kept.focus ?? []), ...item.focus])];
        continue;
      }
      const copy = { ...item };
      byUrl.set(u, copy);
      if (t.length > 12) byTitle.set(t, copy);
      merged.push(copy);
    }
  }

  return merged
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, LIMITS.totalItems);
}

/**
 * A teaser shared by several stories from the same source is site boilerplate
 * ("Anthropic is an AI safety and research company…") from a page whose own
 * description was missing. It says nothing about the story, so blank it.
 */
export function dropBoilerplateSummaries(items) {
  const counts = new Map();
  const key = (i) => `${i.source}\n${i.summary}`;
  for (const i of items) if (i.summary) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return items.map((i) => (i.summary && counts.get(key(i)) > 1
    ? { ...i, summary: '', topics: tagTopics(i.title) }
    : i));
}

/**
 * Copies what an earlier build already learned about a story — its share image,
 * teaser and, for Google News results, the resolved article link — so we don't
 * re-scrape every article on every build.
 * `image === null` means "never looked up"; `''` means "looked, found nothing".
 * Google News results are matched on `googleUrl`, which never changes.
 */
export function reusePrevious(items, previousItems = []) {
  const keyOf = (x) => urlKey(x.googleUrl ?? x.url);
  const byKey = new Map(previousItems.map((p) => [keyOf(p), p]));

  return items.map((item) => {
    const prev = byKey.get(keyOf(item));
    if (!prev) return item;
    // Cached before Google links were resolved: its "no image" verdict was about
    // the redirect page, not the article, so start fresh.
    if (item.googleUrl && !prev.googleUrl) return item;

    const next = { ...item };
    if (item.googleUrl && prev.url && prev.url !== prev.googleUrl) next.url = prev.url;
    if (item.image === null && typeof prev.image === 'string') {
      next.image = prev.image;
      next.summary = item.summary || prev.summary || '';
      if (next.summary !== item.summary) next.topics = tagTopics(`${item.title} ${next.summary}`);
    }
    return next;
  });
}
