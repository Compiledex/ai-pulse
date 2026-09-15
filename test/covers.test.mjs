import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUDGET, neutralHeadline, planCovers, poolCover, storyPrompt, themeOf, THEMES,
} from '../lib/covers.mjs';
import { findPerson, pickOverlay, PEOPLE } from '../lib/people.mjs';
import { TOPICS } from '../lib/topics.mjs';
import { FOCUS } from '../focus.mjs';

const NOW = Date.parse('2026-09-15T12:00:00Z');
const companies = FOCUS.map((f) => ({ id: f.id, re: TOPICS.find((t) => t.id === f.topic).re }));

test('people: first mention wins, ambiguous surnames need the full name', () => {
  assert.equal(findPerson('Obama Calls For AI Safety Measures, Rebuking Trump Approach'), 'barack-obama');
  assert.equal(findPerson('Nvidia CEO Jensen Huang puts Trump on the phone'), 'jensen-huang');
  assert.equal(findPerson('Daniela Amodei on Anthropic growth'), 'daniela-amodei');
  assert.equal(findPerson('Goldman Sachs raises its AI target'), null, 'Sachs is not Sacks');
  assert.equal(findPerson('Tim Cook and the iPhone', ''), 'tim-cook');
  assert.equal(findPerson('Harvard study on cooking robots'), null);
  assert.equal(findPerson('Labs agree to pause', 'Anthropic CEO Dario Amodei called for a slowdown'), 'dario-amodei', 'falls back to the teaser');
  const ids = PEOPLE.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const p of PEOPLE) if (p.org) assert.ok(FOCUS.some((f) => f.id === p.org), `${p.id}: unknown org ${p.org}`);
});

test('overlay: portrait when we have one, the company logo otherwise or when the company leads the headline', () => {
  const portraits = { 'donald-trump': { image: 'https://img/trump.jpg' }, 'sam-altman': { image: 'https://img/altman.jpg' } };
  assert.deepEqual(pickOverlay({ title: 'Trump Opposes AI Guardrails Amid Chip Selloff' }, portraits, companies), { person: 'donald-trump' });
  assert.deepEqual(pickOverlay({ title: "OpenAI's Altman won't do an IPO this year" }, portraits, companies), { logo: 'chatgpt' }, 'company named first');
  assert.deepEqual(pickOverlay({ title: 'Jack Clark on why a kill switch may be needed' }, portraits, companies), { logo: 'claude' }, 'no portrait: the org logo');
  assert.deepEqual(pickOverlay({ title: 'Markets slide on AI worries' }, portraits, companies), {});
});

test('prompts never name real people', () => {
  assert.equal(neutralHeadline("Trump Opposes AI Guardrails Amid Chip Selloff"), 'Opposes AI Guardrails Amid Chip Selloff');
  assert.equal(neutralHeadline("AI 'kill switch' may need to be mandatory, Anthropic co-founder tells BBC"), 'AI kill switch may need to be mandatory, Anthropic co-founder');
  const prompt = storyPrompt({ id: 'abc', title: 'Sam Altman and Elon Musk back a slowdown', topics: ['safety'] });
  assert.doesNotMatch(prompt, /Altman|Musk/);
  assert.match(prompt, /no human faces/);
});

test('themes follow the most specific topic', () => {
  assert.equal(themeOf({ topics: ['business', 'chips'] }), 'chips');
  assert.equal(themeOf({ topics: [] }), 'general');
  for (const t of THEMES) assert.ok(t.subjects.length >= BUDGET.poolFull, `${t.id} needs ${BUDGET.poolFull} variants`);
});

test('the plan fills a starter pool first, then new stories, then grows the pool — within the budget', () => {
  const stories = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, title: `Story ${i}`, topics: [] }));
  const empty = planCovers({ pool: {}, budget: null, stories, now: NOW });
  assert.equal(empty.plan.length, BUDGET.imagesPerBuild);
  assert.ok(empty.plan.slice(0, THEMES.length).every((t) => t.kind === 'pool' && t.variant === 0));

  const starter = Object.fromEntries(THEMES.map((t) => [t.id, ['a', 'b']]));
  const withPool = planCovers({ pool: starter, budget: null, stories, now: NOW });
  assert.ok(withPool.plan.every((t) => t.kind === 'story'));

  const almostSpent = planCovers({ pool: starter, budget: { day: '2026-09-15', neurons: BUDGET.neuronsPerDay - 400, stories: 0 }, stories, now: NOW });
  assert.equal(almostSpent.plan.length, 2, 'only what the remaining neurons allow');

  const newDay = planCovers({ pool: starter, budget: { day: '2026-09-14', neurons: BUDGET.neuronsPerDay, stories: 99 }, stories, now: NOW });
  assert.equal(newDay.plan.length, BUDGET.imagesPerBuild, 'the budget resets each UTC day');

  const storiesDone = planCovers({ pool: starter, budget: { day: '2026-09-15', neurons: 0, stories: BUDGET.storiesPerDay }, stories, now: NOW });
  assert.ok(storiesDone.plan.length > 0 && storiesDone.plan.every((t) => t.kind === 'pool' && t.variant >= 2), 'then the pool grows');
});

test('a story keeps the same pool cover between builds', () => {
  const pool = { chips: ['c0', 'c1', 'c2'], general: ['g0'] };
  const item = { id: 'a1b2c3', topics: ['chips'] };
  assert.equal(poolCover(pool, item), poolCover(pool, { ...item }));
  assert.ok(pool.chips.includes(poolCover(pool, item)));
  assert.equal(poolCover(pool, { id: 'x', topics: ['robotics'] }), 'g0', 'falls back to the general pool');
  assert.equal(poolCover({}, item), null);
});
