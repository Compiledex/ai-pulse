import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fingerprintAssets } from '../lib/assets.mjs';

async function site(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ai-pulse-assets-'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

test('script and stylesheet URLs carry a content hash, imports included', async () => {
  const files = {
    'index.html': '<link rel="stylesheet" href="styles.css"><script type="module" src="app.js"></script>',
    'styles.css': 'body { color: red }',
    'app.js': "import { a } from './neural.js';\nimport { b } from './art.js';\nconsole.log(a, b);",
    'neural.js': 'export const a = 1;',
    'art.js': 'export const b = 2;',
  };
  const dir = await site(files);
  try {
    await fingerprintAssets(dir);
    const html = await readFile(join(dir, 'index.html'), 'utf8');
    const app = await readFile(join(dir, 'app.js'), 'utf8');
    assert.match(html, /href="styles\.css\?v=[0-9a-f]{10}"/);
    assert.match(html, /src="app\.js\?v=[0-9a-f]{10}"/);
    assert.match(app, /from '\.\/neural\.js\?v=[0-9a-f]{10}'/);
    assert.match(app, /from '\.\/art\.js\?v=[0-9a-f]{10}'/);
    const firstAppUrl = html.match(/app\.js\?v=(\w+)/)[1];

    // Changing only neural.js must also change app.js's URL, or the page would keep a cached app.js importing the old module.
    const dir2 = await site({ ...files, 'neural.js': 'export const a = 42;' });
    await fingerprintAssets(dir2);
    const html2 = await readFile(join(dir2, 'index.html'), 'utf8');
    assert.notEqual(html2.match(/app\.js\?v=(\w+)/)[1], firstAppUrl);
    assert.equal(html2.match(/styles\.css\?v=(\w+)/)[1], html.match(/styles\.css\?v=(\w+)/)[1], 'unchanged files keep their URL');
    await rm(dir2, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
