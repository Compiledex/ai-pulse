import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnthropicIndex } from '../lib/anthropic.mjs';
import { parseFeed } from '../lib/feed.mjs';
import { fromGoogleNews, searchUrl, stripPublisher } from '../lib/googlenews.mjs';
import { mergeItems, normalizeEntries } from '../lib/pipeline.mjs';
import { isAboutAI } from '../lib/topics.mjs';
import { FOCUS } from '../focus.mjs';
import { CATEGORIES, SOURCES } from '../sources.mjs';

const NOW = Date.parse('2026-09-15T12:00:00Z');

/** Wraps a JS string the way Next.js streams it: self.__next_f.push([1,"<escaped>"]). */
const flightScript = (payload) => `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;

test('Anthropic: reads embedded posts and featured links outside /news/', () => {
  const payload = `6:["$","div",null,{"items":[`
    + `{"_key":"abc","_type":"featuredGridLink","date":"2026-09-10","subject":"Announcements","summary":"Case studies from disrupted operations.","title":"Detecting and countering misuse of AI: September 2026","url":"https://www.anthropic.com/threat-intelligence-report-september-2026"},`
    + `{"_key":"def","_type":"featuredGridLink","date":"2026-09-01","title":"Introducing Claude Fable 5.1","summary":"Our most advanced models \\"yet\\".","url":"/claude-fable-5-1"},`
    + `{"_type":"post","cardPhoto":{"url":"https://cdn.example/photo.png"},"publishedOn":"2026-08-31T15:00:00.000Z","slug":{"_type":"slug","current":"improving-alignment"},"summary":"On July 30, we reported {three} incidents.","title":"Improving our alignment"}`
    + `]}]`;
  // The same post also rendered as a link — must not appear twice.
  const html = `${flightScript(payload.slice(0, 120))}${flightScript(payload.slice(120))}
    <a href="/news/improving-alignment"><time>Aug 31, 2026</time><h4>Improving our alignment</h4></a>`;

  const entries = parseAnthropicIndex(html, 'https://www.anthropic.com/news');
  assert.deepEqual(entries.map((e) => e.url), [
    'https://www.anthropic.com/threat-intelligence-report-september-2026',
    'https://www.anthropic.com/claude-fable-5-1',
    'https://www.anthropic.com/news/improving-alignment',
  ]);
  assert.equal(entries[1].summary, 'Our most advanced models "yet".');
  assert.equal(entries[2].published.toISOString(), '2026-08-31T15:00:00.000Z');
  assert.equal(entries[2].summary, 'On July 30, we reported {three} incidents.', 'braces inside strings don\'t break parsing');
  assert.equal(entries[2].image, 'https://cdn.example/photo.png');
});

const GOOGLE_NEWS = `<rss><channel>
  <item>
    <title>US judge stays on OpenAI case - Reuters</title>
    <link>https://news.google.com/rss/articles/CBMiabc?oc=5</link>
    <pubDate>Mon, 14 Sep 2026 18:00:00 GMT</pubDate>
    <description>&lt;a href="https://news.google.com/rss/articles/CBMiabc"&gt;US judge stays on OpenAI case&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Reuters&lt;/font&gt;</description>
    <source url="https://www.reuters.com">Reuters</source>
  </item>
  <item>
    <title>Pay-per-view - AI - The Economist</title>
    <link>https://news.google.com/rss/articles/CBMidef?oc=5</link>
    <pubDate>Sun, 13 Sep 2026 08:00:00 GMT</pubDate>
    <source url="https://www.economist.com">The Economist</source>
  </item>
</channel></rss>`;

test('Google News: credits the outlet, strips its name from the headline, drops the echo teaser', () => {
  const [a, b] = fromGoogleNews(parseFeed(GOOGLE_NEWS, 'https://news.google.com/'));
  assert.equal(a.title, 'US judge stays on OpenAI case');
  assert.equal(a.publisher, 'Reuters');
  assert.equal(a.summary, '');
  assert.equal(a.image, null, 'looked up after the link is resolved');
  assert.equal(a.googleUrl, 'https://news.google.com/rss/articles/CBMiabc?oc=5');
  assert.equal(a.via, 'Google News');
  assert.equal(b.title, 'Pay-per-view - AI', 'only the trailing publisher is removed');

  const [own] = fromGoogleNews(parseFeed(GOOGLE_NEWS, 'https://news.google.com/'), { keepPublisher: false, limit: 1 });
  assert.equal(own.publisher, null);
  assert.equal(stripPublisher('No suffix here', 'Reuters'), 'No suffix here');
  assert.match(searchUrl('"Anthropic" OR "Claude AI"'), /q=%22Anthropic%22%20OR%20%22Claude%20AI%22%20when%3A7d/);
});

test('aiOnly sources keep only AI stories', () => {
  assert.ok(isAboutAI('Nvidia beats estimates'));
  assert.ok(isAboutAI('Why A.I. is eating the world'));
  assert.ok(isAboutAI('Senate weighs artificial intelligence bill'));
  assert.ok(!isAboutAI('Apple unveils a thinner iPhone'));
  assert.ok(!isAboutAI('Ai Weiwei opens exhibition in Berlin'), '"Ai" as a name is not AI');
  assert.ok(!isAboutAI('Fed said to hold rates'));

  const entry = (title) => ({ title, url: `https://n.example/${encodeURIComponent(title)}`, summary: '', image: null, published: new Date(NOW - 3600e3) });
  const items = normalizeEntries({ id: 'cnbc', aiOnly: true }, [entry('Apple unveils a thinner iPhone'), entry('OpenAI raises again')], NOW);
  assert.deepEqual(items.map((i) => i.title), ['OpenAI raises again']);
});

test('a duplicate found by a web search still puts the story in that AI tab', () => {
  const published = new Date(NOW - 3600e3);
  const own = normalizeEntries({ id: 'verge' }, [{ title: 'Anthropic and OpenAI call for a slowdown', url: 'https://verge.example/a', summary: '', image: null, published }], NOW);
  const web = normalizeEntries({ id: 'web' }, [
    { title: 'Anthropic and OpenAI call for a slowdown', url: 'https://news.google.com/rss/articles/x', summary: '', image: '', published, publisher: 'The Verge', via: 'Google News', focus: ['claude'] },
    { title: 'Anthropic and OpenAI call for a slowdown', url: 'https://news.google.com/rss/articles/y', summary: '', image: '', published, publisher: 'The Verge', via: 'Google News', focus: ['chatgpt'] },
  ], NOW);

  const merged = mergeItems([own, web]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'verge', 'the direct source wins');
  assert.deepEqual(merged[0].focus, ['claude', 'chatgpt']);
  assert.equal(own[0].focus, undefined, 'inputs are not mutated');
});

test('every source has a known category and every focus AI has a search', () => {
  for (const s of SOURCES) assert.ok(CATEGORIES[s.category], `${s.id}: unknown category ${s.category}`);
  for (const f of FOCUS) assert.ok(f.search, `${f.id} has no search`);
  const ids = SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'source ids are unique');
});

test('Google News link resolution: parsing each step', async () => {
  const { articleId, parseArticleParams, decodeRequestBody, parseDecodeResponse } = await import('../lib/googlenews.mjs');
  assert.equal(articleId('https://news.google.com/rss/articles/CBMiXYZ?oc=5'), 'CBMiXYZ');
  assert.equal(articleId('https://example.com/rss/articles/CBMiXYZ'), null);

  assert.deepEqual(parseArticleParams('<c-wiz data-n-a-sg="SIG123" data-n-a-ts="1757880000"></c-wiz>'), { signature: 'SIG123', timestamp: 1757880000 });
  assert.equal(parseArticleParams('<html>consent page</html>'), null);

  const body = new URLSearchParams(decodeRequestBody('CBMiXYZ', { signature: 'SIG123', timestamp: 1757880000 }));
  const [[[rpc, inner]]] = JSON.parse(body.get('f.req'));
  assert.equal(rpc, 'Fbv4je');
  assert.deepEqual(JSON.parse(inner).slice(-3), ['CBMiXYZ', 1757880000, 'SIG123']);

  const response = `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', 'https://www.cnbc.com/2026/09/14/story.html', 1])]])}`;
  assert.equal(parseDecodeResponse(response), 'https://www.cnbc.com/2026/09/14/story.html');
  assert.equal(parseDecodeResponse('garbage'), null);
});

test('reusePrevious keeps resolved Google links and ignores caches from before resolution', async () => {
  const { reusePrevious } = await import('../lib/pipeline.mjs');
  const fresh = { url: 'https://news.google.com/rss/articles/A', googleUrl: 'https://news.google.com/rss/articles/A', image: null, summary: '', title: 'T', topics: [] };

  const [resolved] = reusePrevious([fresh], [{ ...fresh, url: 'https://www.cnbc.com/a', image: 'https://img.example/a.jpg' }]);
  assert.equal(resolved.url, 'https://www.cnbc.com/a');
  assert.equal(resolved.image, 'https://img.example/a.jpg');

  const [stale] = reusePrevious([fresh], [{ url: 'https://news.google.com/rss/articles/A', image: '', summary: '' }]);
  assert.equal(stale.image, null, 'an old "no image" for the redirect page is not trusted');
  assert.equal(stale.url, fresh.url);
});

test('normalizeEntries keeps the Google News identity of a result', () => {
  const [item] = normalizeEntries({ id: 'web' }, fromGoogleNews(parseFeed(GOOGLE_NEWS, 'https://news.google.com/'), { limit: 1 }), Date.parse('2026-09-15T00:00:00Z'));
  assert.equal(item.googleUrl, 'https://news.google.com/rss/articles/CBMiabc?oc=5');
  assert.equal(item.image, null);
});
