import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * GitHub Pages lets browsers reuse cached files for 10 minutes, and the page's
 * scripts keep the same names between versions — so a reload could run a new
 * page with an old script (that's how a fixed animation bug kept showing up).
 * Every local script and stylesheet reference gets ?v=<content hash> instead,
 * so a changed file always has a new URL and an unchanged one stays cached.
 */
export async function fingerprintAssets(dir) {
  const hashOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);
  const js = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const read = async (f) => readFile(join(dir, f), 'utf8');

  // Modules with no local imports first, then the ones importing them (app.js).
  const localImports = /(from\s+['"])\.\/([\w.-]+\.js)(['"])/g;
  const sources = Object.fromEntries(await Promise.all(js.map(async (f) => [f, await read(f)])));
  const hashes = {};
  const hashFile = (f, seen = new Set()) => {
    if (hashes[f]) return hashes[f];
    if (seen.has(f)) throw new Error(`circular import through ${f}`);
    seen.add(f);
    const rewritten = sources[f].replace(localImports, (m, pre, dep, post) => (sources[dep] ? `${pre}./${dep}?v=${hashFile(dep, seen)}${post}` : m));
    sources[f] = rewritten;
    hashes[f] = hashOf(rewritten);
    return hashes[f];
  };
  for (const f of js) hashFile(f);
  for (const f of js) await writeFile(join(dir, f), sources[f]);

  const css = 'styles.css';
  const cssHash = hashOf(await read(css));
  let html = await read('index.html');
  html = html
    .replace(/(src=")(\w[\w.-]*\.js)(")/g, (m, pre, f, post) => (hashes[f] ? `${pre}${f}?v=${hashes[f]}${post}` : m))
    .replace(`href="${css}"`, `href="${css}?v=${cssHash}"`);
  await writeFile(join(dir, 'index.html'), html);
}
