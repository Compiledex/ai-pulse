import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FOCUS } from '../focus.mjs';
import {
  DEPLOY_LAG_MS, hourlyCronMinute, nextHourlyRun, nextUpdateAt,
} from '../lib/schedule.mjs';
import { TOPICS } from '../lib/topics.mjs';
import { SOURCES } from '../sources.mjs';

test('reads the minute from an hourly cron, rejects anything else', () => {
  assert.equal(hourlyCronMinute("  schedule:\n    - cron: '7 * * * *'"), 7);
  assert.equal(hourlyCronMinute('- cron: "45 * * * *"'), 45);
  assert.equal(hourlyCronMinute("- cron: '17 4 * * *'"), null, 'daily, not hourly');
  assert.equal(hourlyCronMinute("- cron: '*/15 * * * *'"), null);
  assert.equal(hourlyCronMinute('no schedule here'), null);
});

test('the real workflow has a schedule the countdown understands', () => {
  const yaml = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  assert.notEqual(hourlyCronMinute(yaml), null);
});

test('next run is strictly after now, rolling over the hour and the day', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(nextHourlyRun(at('2026-09-15T10:03:00Z'), 7), at('2026-09-15T10:07:00Z'));
  assert.equal(nextHourlyRun(at('2026-09-15T10:07:00Z'), 7), at('2026-09-15T11:07:00Z'), 'a build at :07 waits for the next hour');
  assert.equal(nextHourlyRun(at('2026-09-15T23:30:10Z'), 7), at('2026-09-16T00:07:00Z'));

  assert.equal(
    nextUpdateAt("cron: '7 * * * *'", at('2026-09-15T10:09:30Z')),
    new Date(at('2026-09-15T11:07:00Z') + DEPLOY_LAG_MS).toISOString(),
  );
  assert.equal(nextUpdateAt('', Date.now()), null);
});

test('every focus entry points at a real topic and real sources', () => {
  const topics = new Set(TOPICS.map((t) => t.id));
  const sources = new Set(SOURCES.map((s) => s.id));
  const ids = new Set();
  for (const f of FOCUS) {
    assert.ok(!ids.has(f.id), `duplicate focus id ${f.id}`);
    ids.add(f.id);
    assert.ok(topics.has(f.topic), `${f.id}: unknown topic ${f.topic}`);
    for (const s of f.sources) assert.ok(sources.has(s), `${f.id}: unknown source ${s}`);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    for (const link of f.links) assert.match(link.url, /^https:\/\//);
  }
});
