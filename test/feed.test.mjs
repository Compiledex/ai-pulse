import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnthropicIndex } from '../lib/anthropic.mjs';
import { extractDescription, extractShareImage, parseFeed } from '../lib/feed.mjs';
import { decodeEntities, htmlToText, truncate, urlKey } from '../lib/text.mjs';

const RSS = `<?xml version="1.0"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Example</title>
  <link>https://example.com</link>
  <item>
    <title><![CDATA[OpenAI &amp; friends ship <em>GPT-7</em>]]></title>
    <link>https://example.com/a?utm_source=rss</link>
    <pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate>
    <description>&lt;p&gt;It&amp;#8217;s here &amp;mdash; finally.&lt;/p&gt;</description>
    <media:content url="https://cdn.example.com/small.jpg" width="300" medium="image"/>
    <media:content url="https://cdn.example.com/large.jpg?a=1&amp;b=2" width="1200" medium="image"/>
  </item>
  <item>
    <title>Body image only</title>
    <link>https://example.com/b</link>
    <pubDate>Sun, 13 Sep 2026 08:30:00 +0000</pubDate>
    <content:encoded><![CDATA[<img src="https://feeds.feedburner.com/pixel.gif" width="1" height="1"><figure><img data-src="/img/hero.png"></figure><p>Text</p>]]></content:encoded>
  </item>
  <item>
    <title>No date — dropped</title>
    <link>https://example.com/c</link>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Blog</title>
  <link href="https://blog.example.org/" rel="alternate"/>
  <entry>
    <title type="html">Atom &amp;amp; entities</title>
    <link rel="replies" href="https://blog.example.org/post#comments"/>
    <link rel="alternate" type="text/html" href="https://blog.example.org/post"/>
    <published>2026-09-14T09:00:00-04:00</published>
    <updated>2026-09-14T12:00:00-04:00</updated>
    <summary type="html"><![CDATA[A summary with <b>markup</b> [&#8230;]]]></summary>
  </entry>
</feed>`;

test('RSS: CDATA titles, escaped HTML descriptions, largest media:content', () => {
  const [a, b, ...rest] = parseFeed(RSS, 'https://example.com/feed');
  assert.equal(rest.length, 0, 'entries without a date are dropped');

  assert.equal(a.title, 'OpenAI & friends ship GPT-7');
  assert.equal(a.summary, 'It’s here — finally.');
  assert.equal(a.image, 'https://cdn.example.com/large.jpg?a=1&b=2');
  assert.equal(a.published.toISOString(), '2026-09-14T10:00:00.000Z');

  assert.equal(b.image, 'https://example.com/img/hero.png', 'skips tracking pixels, resolves lazy relative src');
  assert.equal(b.summary, 'Text');
});

test('Atom: picks the alternate link, prefers published over updated', () => {
  const [entry] = parseFeed(ATOM, 'https://blog.example.org/feed');
  assert.equal(entry.url, 'https://blog.example.org/post');
  assert.equal(entry.title, 'Atom & entities');
  assert.equal(entry.summary, 'A summary with markup […]');
  assert.equal(entry.published.toISOString(), '2026-09-14T13:00:00.000Z');
  assert.equal(entry.image, null);
});

test('share image and description come from meta tags in any attribute order', () => {
  const html = `<head>
    <meta content="/og/cover.png" property="og:image">
    <meta name="twitter:image" content="https://x.example/t.png">
    <meta name='description' content='Plain &amp; simple'>
  </head>`;
  assert.equal(extractShareImage(html, 'https://site.example/news/1'), 'https://site.example/og/cover.png');
  assert.equal(extractDescription(html), 'Plain & simple');
  assert.equal(extractShareImage('<head></head>', 'https://site.example/'), null);
});

test('Anthropic index: heading-style and class-title-style cards', () => {
  const html = `
    <a href="/news/claude-opus-5" class="x"><div><span>Product</span><time class="d">Jul 24, 2026</time></div>
      <h4 class="t">Introducing Claude Opus 5</h4><p class="b">A step change.</p></a>
    <a href="/news/claude-opus-5" class="dup"><time>Jul 24, 2026</time><h4>Duplicate link</h4></a>
    <a href="/news/watermark"><time>Aug 14, 2026</time><span class="Card__title body-3">How Claude&#x27;s text watermark works</span></a>
    <a href="/news">All news</a>`;
  const entries = parseAnthropicIndex(html, 'https://www.anthropic.com/news');
  assert.deepEqual(entries.map((e) => e.title), ['Introducing Claude Opus 5', 'How Claude\'s text watermark works']);
  assert.equal(entries[0].url, 'https://www.anthropic.com/news/claude-opus-5');
  assert.equal(entries[0].summary, 'A step change.');
  assert.equal(entries[1].published.toISOString(), '2026-08-14T12:00:00.000Z');
});

test('text helpers', () => {
  assert.equal(decodeEntities('&#x1F916; &unknown; &amp;'), '🤖 &unknown; &');
  assert.equal(htmlToText('<p>a</p><p>b</p><script>x()</script>'), 'a b');
  assert.equal(truncate('one two three four five', 11), 'one two…', 'never cuts mid-word');
  assert.equal(truncate('short', 11), 'short');
  assert.equal(urlKey('https://www.Example.com/path/?utm_source=x&id=3#top'), 'example.com/path?id=3');
});
