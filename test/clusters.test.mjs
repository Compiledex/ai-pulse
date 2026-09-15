import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clusterStories, contentWords } from '../lib/clusters.mjs';

const NOW = Date.parse('2026-09-15T12:00:00Z');
let n = 0;
const story = (title, source, hoursAgo = 1, summary = '') => ({ id: `s${n++}`, title, source, summary, published: new Date(NOW - hoursAgo * 3600e3).toISOString() });

// Background stories so that everyday words ("AI", "OpenAI") are common, as on the real site.
const background = Array.from({ length: 60 }, (_, i) => story(`OpenAI AI update number ${i} for developers ${['robots', 'chips', 'health', 'music', 'finance', 'games'][i % 6]} ${i * 7}`, 'bg', i % 40));

test('contentWords drops filler and folds plurals and possessives', () => {
  assert.deepEqual(contentWords("Mistral's investors say the AI rounds are over"), ['mistral', 'investor', 'round']);
});

test('the same event across outlets is one group, counted by distinct outlets', () => {
  const items = [
    ...background,
    story('Mistral raises €3 billion in Samsung-led funding round', 'techcrunch', 2),
    story('Mistral AI closes €3B Series D round led by Samsung', 'reuters', 3),
    story('Samsung leads Mistral funding round valuing it above €21 billion', 'ft', 5),
    story('Mistral raises record €3bn in Samsung round', 'techcrunch', 6), // same outlet again
    story('Nvidia unveils a new data center chip', 'verge', 2),
  ];
  const result = clusterStories(items);
  const mistral = items.map((it, i) => [it, result[i]]).filter(([it]) => it.title.includes('Mistral'));
  assert.equal(new Set(mistral.map(([, r]) => r.cluster)).size, 1, 'all Mistral stories in one group');
  assert.equal(mistral[0][1].coverage, 3, 'four stories, three outlets');
  const nvidia = result[items.length - 1];
  assert.equal(nvidia.coverage, 1);
  assert.notEqual(nvidia.cluster, mistral[0][1].cluster);
});

test('stories that only share common words stay apart', () => {
  const items = [
    ...background,
    story('OpenAI launches a new AI model for developers', 'openai', 1),
    story('OpenAI signs an AI deal with a hospital group', 'verge', 2),
  ];
  const result = clusterStories(items);
  assert.notEqual(result.at(-1).cluster, result.at(-2).cluster);
});

test('similar headlines days apart are not the same event, and groups do not chain across a week', () => {
  const far = [...background, story('Anthropic researcher quits with safety warning', 'wired', 1), story('Anthropic researcher quits with safety warning', 'axios', 80)];
  const r1 = clusterStories(far);
  assert.notEqual(r1.at(-1).cluster, r1.at(-2).cluster, 'outside the 48h window');

  // A daily chain: each story is similar to the next, but the first and last are 4 days apart.
  const chain = [...background, ...[0, 24, 48, 72, 96].map((h, i) => story(`Supreme court mail ballot ruling day ${i}`, `outlet${i}`, h))];
  const r2 = clusterStories(chain);
  const groups = new Set(r2.slice(-5).map((r) => r.cluster));
  assert.ok(groups.size >= 2, 'the 72h span cap splits the chain');
});
