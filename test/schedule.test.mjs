import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FOCUS } from '../focus.mjs';
import {
  cronMinutes, DEPLOY_LAG_MS, nextRun, scheduleInfo,
} from '../lib/schedule.mjs';
import { TOPICS } from '../lib/topics.mjs';
import { SOURCES } from '../sources.mjs';

const at = (iso) => Date.parse(iso);

test('reads the minutes from an every-hour cron, rejects anything else', () => {
  assert.deepEqual(cronMinutes("  schedule:\n    - cron: '7 * * * *'"), [7]);
  assert.deepEqual(cronMinutes('- cron: "47,17 * * * *"'), [17, 47], 'sorted');
  assert.equal(cronMinutes("- cron: '17 4 * * *'"), null, 'daily, not hourly');
  assert.equal(cronMinutes("- cron: '*/15 * * * *'"), null);
  assert.equal(cronMinutes("- cron: '17,75 * * * *'"), null, 'minute out of range');
  assert.equal(cronMinutes('no schedule here'), null);
});

test('the real workflow has a schedule the countdown understands', () => {
  const yaml = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  assert.ok(cronMinutes(yaml)?.length);
});

test('the Cloudflare scheduler fires at the same minutes the countdown shows', () => {
  const yaml = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  const toml = readFileSync(new URL('../scheduler/wrangler.toml', import.meta.url), 'utf8');
  const workerCron = toml.match(/crons\s*=\s*\[\s*"([^"]+)"/)?.[1];
  assert.deepEqual(cronMinutes(`cron: '${workerCron}'`), cronMinutes(yaml));
});

test('next run is strictly after now, across slots, hours and days', () => {
  const both = [17, 47];
  assert.equal(nextRun(at('2026-09-15T10:03:00Z'), both), at('2026-09-15T10:17:00Z'));
  assert.equal(nextRun(at('2026-09-15T10:17:00Z'), both), at('2026-09-15T10:47:00Z'), 'a build exactly on a slot waits for the next');
  assert.equal(nextRun(at('2026-09-15T10:50:00Z'), both), at('2026-09-15T11:17:00Z'));
  assert.equal(nextRun(at('2026-09-15T23:59:10Z'), both), at('2026-09-16T00:17:00Z'));
  assert.equal(nextRun(at('2026-09-15T10:07:00Z'), [7]), at('2026-09-15T11:07:00Z'));
});

test('schedule info carries every slot and the next expected snapshot', () => {
  assert.deepEqual(scheduleInfo("cron: '17,47 * * * *'", at('2026-09-15T10:20:00Z')), {
    minutes: [17, 47],
    deployLagMinutes: DEPLOY_LAG_MS / 60000,
    nextUpdateAt: new Date(at('2026-09-15T10:47:00Z') + DEPLOY_LAG_MS).toISOString(),
  });
  assert.equal(scheduleInfo('', Date.now()), null);
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
