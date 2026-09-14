# AI Pulse

A self-updating hub for everything happening in AI — lab announcements, tech journalism, research papers and trending open models, collected from 19 sources every hour.

**Live site:** https://compiledex.github.io/ai-pulse/

## What's on the page

- **Top stories** — ranked by recency, source weight and (for Hacker News) community votes, with at most one story per source.
- **Latest stories** — the last 30 days, grouped by day, filterable by source type (AI labs / tech press / analysis) and by topic (OpenAI, Anthropic, Agents, Policy…), with instant search (press `/`).
- **NEW badges** — stories published since your previous visit are marked, and the page checks for fresh stories every 10 minutes while it's open.
- **Trending models** and **papers everyone's reading**, from the Hugging Face API.
- **Source status** — every source's health at the last collection, so a broken feed is visible rather than silently missing.

## How it works

There is no server and no database. A GitHub Actions workflow runs every hour:

1. `build.mjs` fetches every source in [`sources.mjs`](sources.mjs) in parallel — RSS/Atom feeds, plus Anthropic's news page, which has no feed and is scraped.
2. Entries are normalised, de-duplicated (by URL and headline), tagged with topics, and trimmed to recent stories.
3. Stories without an image get one from their article's `og:image`. The previous live snapshot acts as a cache, so each article is only looked up once rather than every hour.
4. Everything is written to `dist/data/news.json` next to the static page in `site/`, and deployed to GitHub Pages.

The page (`site/`) is plain HTML, CSS and JavaScript modules — no framework, no build step. It reads the JSON and renders everything client-side. Stories with no usable image get deterministic generated cover art tinted with their source's colour.

### Failure handling

- One broken feed never breaks the build: that source's last known stories are kept and it shows as *offline* in the source list.
- If fewer than 25 stories can be collected in total, the build fails on purpose and the deploy is skipped, leaving the current site live instead of publishing an empty page.
- GitHub disables scheduled workflows after 60 days without commits; a small `keepalive` job makes an empty commit when the repo has been quiet for 50 days.

## Project layout

```
build.mjs            orchestrates a build (network I/O lives here)
sources.mjs          the list of sources — adding one is a single entry
lib/feed.mjs         forgiving RSS/Atom parser + og:image extraction
lib/anthropic.mjs    scraper for anthropic.com/news
lib/huggingface.mjs  trending models and daily papers
lib/pipeline.mjs     pure transforms: normalise, merge, de-duplicate, cache reuse
lib/topics.mjs       keyword topic tagging
lib/text.mjs         entity decoding, HTML → text, URL keys
site/                the static front end (index.html, styles.css, app.js, neural.js, art.js)
test/                unit tests (node:test), no network required
```

No npm dependencies — Node 22+ only.

## Development

```sh
npm test         # unit tests
npm run dev      # collect news once, then serve at http://localhost:4173
npm run serve    # serve without re-collecting
```

`serve.mjs` serves `site/` straight from source, so front-end edits show on refresh without rebuilding. Set `PREVIOUS_SNAPSHOT=''` to build without reusing the live snapshot.

---

Headlines, summaries and images belong to their respective publishers; every story links to the original.
