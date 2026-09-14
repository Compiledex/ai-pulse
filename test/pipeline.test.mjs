import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dropBoilerplateSummaries, hackerNewsDetails, LIMITS, mergeItems, normalizeEntries, reusePrevious,
} from '../lib/pipeline.mjs';
import { tagTopics } from '../lib/topics.mjs';

const NOW = Date.parse('2026-09-15T12:00:00Z');
const HOUR = 3600 * 1000;

const entry = (title, hoursAgo, extra = {}) => ({
  title,
  url: `https://news.example/${encodeURIComponent(title)}`,
  summary: '',
  image: null,
  published: new Date(NOW - hoursAgo * HOUR),
  ...extra,
});

test('normalizeEntries drops old stories, caps per source, and clamps future dates', () => {
  const entries = [
    entry('Too old', (LIMITS.maxAgeDays + 1) * 24),
    entry('From the future', -5),
    ...Array.from({ length: LIMITS.perSource + 5 }, (_, i) => entry(`Story ${i}`, i + 1)),
  ];
  const items = normalizeEntries({ id: 'verge' }, entries, NOW);

  assert.equal(items.length, LIMITS.perSource);
  assert.equal(items[0].title, 'From the future');
  assert.equal(items[0].published, new Date(NOW).toISOString());
  assert.ok(!items.some((i) => i.title === 'Too old'));
  assert.match(items[0].id, /^[0-9a-f]{12}$/);
});

test('Hacker News teasers become points/comments with a discussion link', () => {
  const summary = 'Article URL: https://a.example Comments URL: https://news.ycombinator.com/item?id=42 Points: 312 # Comments: 140';
  assert.deepEqual(hackerNewsDetails(summary), {
    summary: '312 points · 140 comments on Hacker News',
    discussion: 'https://news.ycombinator.com/item?id=42',
  });

  const [item] = normalizeEntries({ id: 'hn' }, [entry('Show HN', 1, { summary })], NOW);
  assert.equal(item.discussion, 'https://news.ycombinator.com/item?id=42');
});

test('mergeItems de-duplicates by URL and by headline, first source wins', () => {
  const lab = normalizeEntries({ id: 'openai' }, [entry('Introducing GPT-7 today', 3)], NOW);
  const press = normalizeEntries({ id: 'verge' }, [
    { ...entry('Different headline', 2), url: `${lab[0].url}?utm_source=verge` },
    { ...entry('Introducing GPT-7 today!', 1), url: 'https://other.example/gpt7' },
    entry('Unique story', 0.5),
  ], NOW);

  const merged = mergeItems([lab, press]);
  assert.deepEqual(merged.map((i) => [i.source, i.title]), [
    ['verge', 'Unique story'],
    ['openai', 'Introducing GPT-7 today'],
  ]);
});

test('reusePrevious copies looked-up images and teasers, but never overrides feed data', () => {
  const [fresh, withImage] = normalizeEntries({ id: 'anthropic' }, [
    entry('Needs lookup', 2),
    entry('Has image', 3, { image: 'https://img.example/new.png' }),
  ], NOW);

  const previous = [
    { url: fresh.url, image: 'https://img.example/old.png', summary: 'Claude gets agents' },
    { url: withImage.url, image: 'https://img.example/stale.png', summary: '' },
  ];
  const [a, b] = reusePrevious([fresh, withImage], previous);

  assert.equal(a.image, 'https://img.example/old.png');
  assert.equal(a.summary, 'Claude gets agents');
  assert.deepEqual(a.topics, ['anthropic', 'agents'], 'topics are re-tagged with the reused teaser');
  assert.equal(b.image, 'https://img.example/new.png');

  // A previous "never looked up" (null) is not a result worth copying.
  const [c] = reusePrevious([fresh], [{ url: fresh.url, image: null, summary: 'x' }]);
  assert.equal(c.image, null);
});

test('dropBoilerplateSummaries blanks a teaser repeated within one source', () => {
  const tagline = 'Anthropic is an AI safety and research company.';
  const items = [
    { source: 'anthropic', title: 'A', summary: tagline, topics: ['anthropic', 'safety'] },
    { source: 'anthropic', title: 'B', summary: tagline, topics: ['anthropic', 'safety'] },
    { source: 'anthropic', title: 'C', summary: 'Real teaser', topics: [] },
    { source: 'verge', title: 'D', summary: tagline, topics: [] },
  ];
  const out = dropBoilerplateSummaries(items);
  assert.deepEqual(out.map((i) => i.summary), ['', '', 'Real teaser', tagline]);
  assert.deepEqual(out[0].topics, []);
});

test('topic tagging avoids common false positives', () => {
  assert.deepEqual(tagTopics('Meta releases Llama 5'), ['meta']);
  assert.deepEqual(tagTopics('metadata is the new oil'), []);
  assert.deepEqual(tagTopics('An apple a day'), []);
  assert.ok(tagTopics('Anthropic raises $30 billion').includes('business'));
  assert.ok(tagTopics('Claude Opus 5 is better at coding agents').includes('coding'));
});
