/**
 * Tiny static server for local development.
 *
 *   npm run dev    -> builds once, then serves dist/ at http://localhost:4173
 *   npm run serve  -> serves the existing dist/ without rebuilding
 *
 * Files under site/ are served straight from source, so CSS/JS edits show up
 * on refresh without another build; only the news snapshot comes from dist/.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const rel = clean.endsWith('/') ? join(clean, 'index.html') : clean;
  for (const root of ['site', 'dist']) {
    const file = join(root, rel);
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      // try the next root
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolve(pathname);
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`AI Pulse → http://localhost:${PORT}`));
