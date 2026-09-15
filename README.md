# AI Pulse

A self-updating hub for everything happening in AI — lab announcements, tech journalism, research papers and trending open models, collected from 31 sources every 30 minutes.

**Live site:** https://compiledex.github.io/ai-pulse/

## What's on the page

- **AI focus** — one tab per AI (ChatGPT, Claude, Gemini, Meta AI, Grok, Copilot, DeepSeek, Mistral, Qwen). Picking one turns the whole page into a hub for that AI: the headline, top stories, ticker and feed only show stories about it, and a profile panel adds official links, the maker's latest announcement, coverage stats, what the coverage is about and its trending open models. Every view has its own link, e.g. [`?ai=claude`](https://compiledex.github.io/ai-pulse/?ai=claude).
- **Top stories** — ranked by recency, source weight and (for Hacker News) community votes, with at most one story per source.
- **Latest stories** — the last 30 days, grouped by day, filterable by source type and by topic (Agents, Policy, Coding…), with instant search (press `/`).
- **Around the web** — each AI tab also includes a Google News search for that AI, so the coverage is close to what you'd find by googling it, credited to the original outlet.
- **Live update clock** — the header shows when the news was collected and counts down to the next collection. The page checks for the new snapshot right when it's due, and offers to show fresh stories as soon as they land. If GitHub skips a scheduled run, the countdown moves on to the next slot rather than waiting forever.
- **NEW badges** — stories published since your previous visit are marked.
- **Trending models** and **papers everyone's reading**, from the Hugging Face API.
- **Source status** — every source's health at the last collection, so a broken feed is visible rather than silently missing.

## How it works

There is no server and no database. A GitHub Actions workflow runs twice an hour (at :17 and :47 — GitHub's scheduler is best-effort and drops some runs under load, so two slots away from the top of the hour keep gaps short):

1. `build.mjs` fetches every source in [`sources.mjs`](sources.mjs) in parallel:
   - **AI labs** — OpenAI, Anthropic, Google DeepMind, Google AI, Mistral, NVIDIA, Hugging Face, AWS. Anthropic has no feed, so its news page is read instead, from the post data the page embeds (which also catches featured posts outside `/news/`).
   - **Tech press** — The Verge, TechCrunch, WIRED, MIT Technology Review, Ars Technica, The Guardian, The Decoder.
   - **Business & world** — Reuters, Axios, Bloomberg, Financial Times, The New York Times, CNBC, BBC News, CBS News, NPR, Politico, Business Insider. These feeds cover everything, so only stories about AI are kept. Reuters has no public feed and is read through a Google News site search.
   - **Analysis** — Simon Willison, Latent Space, Import AI, Hacker News (100+ points).
   - **Around the web** — one Google News search per AI in [`focus.mjs`](focus.mjs), 15 results each. Google News links are redirects, so the build resolves each one to the real article (cached, so once per story) — giving a direct link and letting the share-image lookup find a picture.
2. Entries are normalised, de-duplicated (by URL and headline — a story from a direct source beats the same story found by search), tagged with topics, and trimmed to recent stories.
3. Stories without an image get one from their article's `og:image`. The previous live snapshot acts as a cache, so each article is only looked up once rather than on every build.
4. The schedule is read from the cron line in the workflow file itself, so the page's countdown can't drift from the real schedule.
5. Everything is written to `dist/data/news.json` next to the static page in `site/`, and deployed to GitHub Pages.

The page (`site/`) is plain HTML, CSS and JavaScript modules — no framework, no build step. It reads the JSON and renders everything client-side. Some publishers (Reuters, Bloomberg, the FT, OpenAI) block automated requests, so their share images can't be fetched; those stories get generated cover art instead — the neon logo of each AI the story is about, or the outlet's name as a masthead.

### Failure handling

- One broken feed never breaks the build: that source's last known stories are kept and it shows as *offline* in the source list.
- If fewer than 25 stories can be collected in total, the build fails on purpose and the deploy is skipped, leaving the current site live instead of publishing an empty page.
- GitHub disables scheduled workflows after 60 days without commits; a small `keepalive` job makes an empty commit when the repo has been quiet for 50 days.

## Project layout

```
build.mjs            orchestrates a build (network I/O lives here)
sources.mjs          the list of sources — adding one is a single entry
focus.mjs            the AIs you can focus on: topic, maker's blog, links, Hugging Face orgs
lib/feed.mjs         forgiving RSS/Atom parser + og:image extraction
lib/anthropic.mjs    reader for anthropic.com/news (embedded post data, links as fallback)
lib/googlenews.mjs   Google News search feeds: outlet credit, headline cleanup
lib/huggingface.mjs  trending models and daily papers
lib/pipeline.mjs     pure transforms: normalise, merge, de-duplicate, cache reuse
lib/topics.mjs       keyword topic tagging
lib/schedule.mjs     collection schedule read from the workflow's cron
lib/text.mjs         entity decoding, HTML → text, URL keys
site/                the static front end (index.html, styles.css, app.js, neural.js, art.js, logos.js)
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

AI logos come from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT) and are trademarks of their owners, used only to identify each product.
