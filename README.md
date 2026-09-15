# AI Pulse

A self-updating hub for everything happening in AI — lab announcements, tech journalism, research papers and trending open models, collected from 31 sources every 30 minutes.

**Live site:** https://compiledex.github.io/ai-pulse/

## What's on the page

- **AI focus** — one tab per AI (ChatGPT, Claude, Gemini, Meta AI, Grok, Copilot, DeepSeek, Mistral, Qwen). Picking one turns the whole page into a hub for that AI: the headline, top stories, ticker and feed only show stories about it, and a profile panel adds official links, the maker's latest announcement, coverage stats, what the coverage is about and its trending open models. Every view has its own link, e.g. [`?ai=claude`](https://compiledex.github.io/ai-pulse/?ai=claude).
- **Top stories** — ranked mainly by how many different outlets are covering the same event (stories are grouped by headline and teaser similarity, see [`lib/clusters.mjs`](lib/clusters.mjs)), then by source weight and how recently the event was last reported. At most one story per event and per source; widely covered events are labelled "N outlets".
- **Latest stories** — the last 30 days, grouped by day, filterable by source type and by topic (Agents, Policy, Coding…), with instant search (press `/`).
- **Around the web** — each AI tab also includes a Google News search for that AI, so the coverage is close to what you'd find by googling it, credited to the original outlet.
- **Fresh stories while you read** — the page knows the collection schedule, checks for the new snapshot right when it's due, and offers to show new stories as soon as they land.
- **NEW badges** — stories published since your previous visit are marked.
- **Trending models** and **papers everyone's reading**, from the Hugging Face API.
- **Source status** — every source's health at the last collection, so a broken feed is visible rather than silently missing.

## How it works

There is no server and no database. A GitHub Actions workflow runs every half hour, at :00 and :30 (see [A reliable schedule](#a-reliable-schedule)):

1. `build.mjs` fetches every source in [`sources.mjs`](sources.mjs) in parallel:
   - **AI labs** — OpenAI, Anthropic, Google DeepMind, Google AI, Mistral, NVIDIA, Hugging Face, AWS. Anthropic has no feed, so its news page is read instead, from the post data the page embeds (which also catches featured posts outside `/news/`).
   - **Tech press** — The Verge, TechCrunch, WIRED, MIT Technology Review, Ars Technica, The Guardian, The Decoder.
   - **Business & world** — Reuters, Axios, Bloomberg, Financial Times, The New York Times, CNBC, BBC News, CBS News, NPR, Politico, Business Insider. These feeds cover everything, so only stories with AI in the headline are kept — a passing mention in the teaser isn't enough. Reuters has no public feed and is read through a Google News site search.

   Many outlets file AI stories under Business, Politics or Markets rather than Technology, so a source can list extra section feeds (`more`), filtered to AI stories — BBC's interview on an AI "kill switch" only ever appeared in its Business feed. Roundups, live blogs, newsletters and event promotions ("…, Trump's AI Defense, More", "– as it happened") are dropped from every source.
   - **Analysis** — Simon Willison, Latent Space, Import AI, Hacker News (100+ points).
   - **Around the web** — one Google News search per AI in [`focus.mjs`](focus.mjs), 15 results each. Google News links are redirects, so the build resolves each one to the real article (cached, so once per story) — giving a direct link and letting the share-image lookup find a picture.
2. Feeds only hold their latest 10–100 entries, so each build also keeps what the previous snapshot had for a source: a story stays for 30 days even after it scrolls out of the feed.
3. Entries are normalised, de-duplicated (by URL and headline — a story from a direct source beats the same story found by search), tagged with topics, and trimmed to recent stories.
4. Stories without an image get one from their article's `og:image`. The previous live snapshot acts as a cache, so each article is only looked up once rather than on every build.
5. The schedule is read from the cron line in the workflow file itself, so the page's countdown can't drift from the real schedule.
6. Everything is written to `dist/data/news.json` next to the static page in `site/`, and deployed to GitHub Pages. Script and stylesheet URLs get a content hash (`app.js?v=…`), because Pages lets browsers reuse cached files for 10 minutes — without it a reload could pair a new page with an old script.

The page (`site/`) is plain HTML, CSS and JavaScript modules — no framework, no build step. It reads the JSON and renders everything client-side.

### Pictures for stories that have none

Some publishers (Reuters, Bloomberg, the FT, OpenAI) block automated requests, so their share images can't be fetched. Those stories get a composed cover instead:

- **An AI illustration**, generated with FLUX.1 schnell on [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) in one consistent style that matches the page, and labelled "AI illustration". The free tier allows about 55 images a day, so [`lib/covers.mjs`](lib/covers.mjs) spends it on a pool of illustrations per theme (so every story gets one straight away), then on illustrations of their own for the newest stories. Prompts never name real people and ask for no faces, text or logos.
- **On top, the person or company it's about.** For well-known people ([`lib/people.mjs`](lib/people.mjs)) that's their real, unaltered portrait from Wikipedia — freely licensed only, credited on the image. Faces are never generated or edited: an invented image of a real person on a news page would read as a photo of something that didn't happen. With no free portrait, or when the headline leads with the company, it's the neon logo of the AI instead.

Generated images are stored outside git: the Actions cache keeps them between builds, and anything the cache loses is downloaded back from the live site. Without Cloudflare credentials the build still runs and uses the illustrations it already has.

### A reliable schedule

GitHub runs scheduled workflows on a best-effort basis, and in practice dropped most of this repo's (two of ~28 in the first 14 hours). So the real clock is an external job on [cron-job.org](https://cron-job.org) that, at :00 and :30, sends

```
POST https://api.github.com/repos/Compiledex/ai-pulse/actions/workflows/build.yml/dispatches
Authorization: Bearer <fine-grained token: this repo only, Actions read & write>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

{"ref":"main"}
```

GitHub answers `204 No Content` when the build is queued. The workflow's own `schedule` stays on the same minutes as a backup; the page reads it to know when to look for new stories, so a test pins it to :00 and :30. (A Cloudflare Worker Cron Trigger was tried first, but never fired on the account.)

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
lib/covers.mjs       AI illustrations: themes, prompts, daily budget, Workers AI calls
lib/people.mjs       well-known people, Wikipedia portraits, portrait-or-logo choice
lib/text.mjs         entity decoding, HTML → text, URL keys
lib/assets.mjs       content-hash URLs for the page's scripts and stylesheet
lib/clusters.mjs     groups stories about the same event (TF-IDF similarity) and counts outlets
site/                the static front end (index.html, styles.css, app.js, neural.js, art.js, logos.js)
test/                unit tests (node:test), no network required
```

Node 22+. One dependency: [`sharp`](https://sharp.pixelplumbing.com/), to shrink generated illustrations to 768×432 WebP.

## Development

```sh
npm ci           # install sharp
npm test         # unit tests
npm run dev      # collect news once, then serve at http://localhost:4173
npm run serve    # serve without re-collecting
```

`serve.mjs` serves `site/` straight from source, so front-end edits show on refresh without rebuilding. Set `PREVIOUS_SNAPSHOT=''` to build without reusing the live snapshot.

---

Headlines, summaries and images belong to their respective publishers; every story links to the original.

AI logos come from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT) and are trademarks of their owners, used only to identify each product.
