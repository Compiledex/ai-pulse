import { coverArt, marksHtml } from './art.js';
import { logo } from './logos.js';
import { startNeural } from './neural.js';

const DATA_URL = 'data/news.json';
const PAGE_SIZE = 24;
const POLL_MS = 10 * 60 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MODEL_ACCENTS = ['#a78bfa', '#22d3ee', '#f472b6', '#bef264', '#fbbf24', '#60a5fa'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  data: null,
  sources: new Map(),
  topics: new Map(),
  category: 'all',
  topic: null,
  query: '',
  shown: PAGE_SIZE,
  lastVisit: null,
  focus: null, // the AI in focus (an entry of data.focus), or null for everything
  meta: null, // { generatedAt, nextUpdateAt, schedule } of the newest snapshot seen, even if not shown yet
};

let neural = null;

/* ---------- Formatting ---------------------------------------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Only ever put http(s) URLs into href/src. */
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#';
  } catch {
    return '#';
  }
}

function timeAgo(iso, now = Date.now()) {
  const diff = Math.max(0, now - Date.parse(iso));
  if (diff < 60 * 1000) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return 'yesterday';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function compact(n) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(dayStart, now = Date.now()) {
  const today = startOfDay(now);
  const days = Math.round((today - dayStart) / DAY);
  const date = new Date(dayStart);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

const LICENSES = { mit: 'MIT', 'apache-2.0': 'Apache 2.0', other: 'Custom license', openrail: 'OpenRAIL', 'cc-by-4.0': 'CC BY 4.0', 'cc-by-nc-4.0': 'CC BY-NC 4.0', gemma: 'Gemma license' };
const licenseLabel = (id) => (id ? LICENSES[id] ?? `${id.replace(/-/g, ' ')} license` : null);

const humanTask = (task) => (task ? task.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Model');

/* ---------- Shared pieces ------------------------------------------- */

function sourceOf(item) {
  return state.sources.get(item.source) ?? { name: item.source, color: '#a78bfa', category: 'press' };
}

/* ---------- AI focus ------------------------------------------------ */

const focusById = (id) => state.data?.focus?.find((f) => f.id === id) ?? null;

/** A story is about an AI if it mentions it, or comes from the maker's own blog. */
function inFocus(item, focus = state.focus) {
  if (!focus) return true;
  return item.topics.includes(focus.topic)
    || focus.sources.includes(item.source)
    || (item.focus ?? []).includes(focus.id); // found by that AI's web search
}

/** Every story in the current focus, newest first. */
const pool = () => state.data.items.filter((i) => inFocus(i));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "r,g,b" of `hex` mixed toward white by `amount` (0–1). */
function tint(hex, amount = 0) {
  return hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount)).join(',');
}

function isNew(item) {
  return state.lastVisit !== null && Date.parse(item.published) > state.lastVisit;
}

/**
 * The AIs a story is about, most relevant first, for its cover when it has no
 * picture: the AI tab a search found it for, the maker whose blog it's from,
 * then AIs named in the headline or teaser.
 */
function coverMarkIds(item) {
  const list = state.data?.focus ?? [];
  const ids = new Set([item.logo, ...(item.focus ?? [])].filter(Boolean));
  for (const f of list) if (f.sources.includes(item.source)) ids.add(f.id);
  for (const f of list) if (item.topics?.includes(f.topic)) ids.add(f.id);
  return [...ids].filter((id) => focusById(id)).slice(0, 3);
}

const marksFor = (ids) => ids
  .map((id) => ({ svg: logo(id, 'art-logo'), color: focusById(id)?.color }))
  .filter((m) => m.svg && m.color);

/**
 * The picture for a story without one of its own: an AI illustration (its own
 * or from the theme pool) with, on top, the real portrait of the person it's
 * about or the neon logo of the AI it's about. Photo credit and an "AI
 * illustration" label are part of the image.
 */
function composite(item, label, color, seed) {
  const person = item.person ? state.data.people?.[item.person] : null;
  const portrait = person?.image ? person : null;
  const marks = portrait ? [] : marksFor(coverMarkIds(item));

  if (!item.cover && !portrait) return coverArt(seed, color, label, marks);

  const backdrop = item.cover
    ? `<img class="composite-bg loading" src="${esc(item.cover)}" alt="" loading="lazy" decoding="async" data-seed="${esc(seed)}" data-color="${esc(color)}" data-label="${esc(label)}">`
    : coverArt(seed, color, label, [], { bare: true });
  const overlay = portrait
    ? `<figure class="portrait"><img src="${esc(safeUrl(portrait.image))}" alt="${esc(portrait.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>
       <span class="photo-credit">Photo: ${esc(portrait.credit)}</span>`
    : marks.length ? marksHtml(marks) : '';
  const badge = item.cover ? '<span class="ai-badge">AI illustration</span>' : '';

  return `<div class="composite" style="--c:${esc(color)}">${backdrop}${overlay}${badge}</div>`;
}

/** A story's picture: its own image (falling back to a composite if it fails to load), or a composite. */
function media(item, label, color, seed = item.id) {
  const url = item.image || item.thumbnail;
  if (!url) return composite(item, label, color, seed);
  return `<img src="${esc(safeUrl(url))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
    class="loading" data-seed="${esc(seed)}" data-color="${esc(color)}" data-label="${esc(label)}" data-marks="${esc(coverMarkIds(item).join(','))}">`;
}

/** The outlet to credit: the original publisher for stories found through Google News. */
const outletOf = (item) => item.publisher || sourceOf(item).name;

function sourceBadge(item) {
  const src = sourceOf(item);
  const via = item.via ? `<span class="via">via ${esc(item.via)}</span>` : '';
  return `<span class="src" style="--accent:${esc(src.color)}">${esc(outletOf(item))}</span>${via}`;
}

/* ---------- Top stories --------------------------------------------- */

/** Measured pictures must be at least `width` wide; unmeasured ones (not checked yet) get the benefit of the doubt. */
const sharpEnough = (item, width) => !item.imageWidth || item.imageWidth >= width;

function score(item, now) {
  const src = sourceOf(item);
  const ageHours = (now - Date.parse(item.published)) / HOUR;
  let s = (src.weight ?? 1) / (1 + ageHours / 10);
  if (item.image) s *= 1.35;
  const points = /(\d+) points/.exec(item.summary);
  if (points) s *= 1 + Math.min(Number(points[1]), 800) / 400;
  s *= 1 + Math.min(item.topics.length, 3) * 0.06;
  return s;
}

function pickTopStories(items, now) {
  const recent = items.filter((i) => now - Date.parse(i.published) < 3 * DAY);
  const pool = (recent.length >= 5 ? recent : items).slice().sort((a, b) => score(b, now) - score(a, now));

  // One story per source, so the top of the page isn't five TechCrunch links.
  const picked = [];
  const usedSources = new Set();
  // The big slot needs a big picture: a small one would be stretched into visible pixels.
  const featured = pool.find((i) => i.image && sharpEnough(i, 1000)) ?? pool.find((i) => i.image) ?? pool[0];
  if (featured) { picked.push(featured); usedSources.add(featured.source); }
  for (const item of pool) {
    if (picked.length >= 5) break;
    if (usedSources.has(item.source)) continue;
    picked.push(item);
    usedSources.add(item.source);
  }
  return picked;
}

function renderTop() {
  const now = Date.now();
  const [featured, ...rest] = pickTopStories(pool(), now);
  if (!featured) {
    $('#top-stories').innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>No ${esc(state.focus?.name ?? '')} stories in the last 30 days.</strong>Check back after the next update, or pick another AI.</div>`;
    return;
  }
  const fsrc = sourceOf(featured);

  $('#top-stories').innerHTML = `
    <article class="featured enter" style="--i:0">
      <div class="media">${media(featured, outletOf(featured), fsrc.color)}</div>
      <div class="body">
        <span class="label"><span class="spark"></span>Top story</span>
        <h3><a class="stretch" href="${esc(safeUrl(featured.url))}" target="_blank" rel="noopener">${esc(featured.title)}</a></h3>
        ${featured.summary ? `<p>${esc(featured.summary)}</p>` : ''}
        <div class="meta" style="margin-top:16px">${sourceBadge(featured)}<time datetime="${esc(featured.published)}">${timeAgo(featured.published, now)}</time></div>
      </div>
    </article>
    <ol class="top-list">
      ${rest.map((item, i) => {
        const src = sourceOf(item);
        return `
        <li class="top-item enter" style="--i:${i + 1}">
          <div class="thumb">${media(item, outletOf(item), src.color)}</div>
          <div>
            <div class="meta">${sourceBadge(item)}<time datetime="${esc(item.published)}">${timeAgo(item.published, now)}</time></div>
            <h3><a class="stretch" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">${esc(item.title)}</a></h3>
          </div>
        </li>`;
      }).join('')}
    </ol>`;
}

/* ---------- Ticker -------------------------------------------------- */

function renderTicker() {
  const items = pool().slice(0, 24);
  $('.ticker').hidden = !items.length;
  const html = items.map((item) => {
    const src = sourceOf(item);
    return `<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener" style="--accent:${esc(src.color)}"><b>${esc(src.name)}</b>${esc(item.title)}</a>`;
  }).join('');
  const track = $('#ticker');
  // Two copies side by side; the animation scrolls exactly one copy's width.
  track.innerHTML = html + html.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
  requestAnimationFrame(() => {
    track.style.setProperty('--duration', `${Math.round(track.scrollWidth / 2 / 55)}s`);
  });
}

/* ---------- Filters ------------------------------------------------- */

function matches(item, { category = state.category, topic = state.topic, query = state.query } = {}) {
  if (!inFocus(item)) return false;
  if (category !== 'all' && sourceOf(item).category !== category) return false;
  if (topic && !item.topics.includes(topic)) return false;
  if (query) {
    const hay = `${item.title} ${item.summary} ${sourceOf(item).name} ${item.publisher ?? ''}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
  }
  return true;
}

function renderTabs() {
  const tabs = $('#tabs');
  const entries = [['all', 'All'], ...Object.entries(state.data.categories)];
  $$('.tab', tabs).forEach((t) => t.remove());
  tabs.insertAdjacentHTML('beforeend', entries.map(([id, label]) => {
    const count = state.data.items.filter((i) => matches(i, { category: id, topic: null, query: '' })).length;
    return `<button class="tab" role="tab" data-category="${esc(id)}" aria-selected="${id === state.category}">${esc(label)}<small>${count}</small></button>`;
  }).join(''));
  moveIndicator();
}

function moveIndicator() {
  const active = $('.tab[aria-selected="true"]');
  const indicator = $('.tab-indicator');
  if (!active || !indicator) return;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

/**
 * Topic chips narrow the feed by theme (Agents, Policy…). Companies are left
 * out on purpose: picking an AI is done in one place only, the focus tabs,
 * which change the whole page — a second, feed-only company filter fought it.
 */
function renderChips() {
  const counts = new Map();
  for (const item of state.data.items) {
    if (!matches(item, { topic: null, query: '' })) continue;
    for (const t of item.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const chip = (t) => `<button class="chip" data-topic="${esc(t.id)}" aria-pressed="${state.topic === t.id}">${esc(t.label)}<small>${counts.get(t.id) ?? 0}</small></button>`;
  $('#topics').innerHTML = state.data.topics
    .filter((t) => t.kind === 'theme' && (counts.get(t.id) || state.topic === t.id))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .map(chip)
    .join('');
}

const focusCount = (f) => (f ? state.data.items.filter((i) => inFocus(i, f)).length : state.data.items.length);
const focusMark = (f) => (f && logo(f.id, 'tab-logo')) || '<span class="swatch" aria-hidden="true"></span>';

const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>';

/**
 * The AI switcher in the feed controls. It is not a separate filter: it reads
 * and sets the same page-wide focus as the tabs at the top, so the two always agree.
 */
function renderAiSwitch() {
  const list = state.data.focus ?? [];
  $('#ai-switch').hidden = !list.length;
  const f = state.focus;

  const btn = $('#ai-switch-btn');
  btn.classList.toggle('all', !f);
  if (f) btn.style.setProperty('--c', f.color);
  else btn.style.removeProperty('--c');
  btn.innerHTML = `${focusMark(f)}<span>${esc(f?.name ?? 'All AI')}</span>${CHEVRON}`;

  $('#ai-menu').innerHTML = [null, ...list].map((x) => `
    <button class="ai-menu-item${x ? '' : ' all'}" role="menuitemradio" tabindex="-1"
      aria-checked="${(f?.id ?? null) === (x?.id ?? null)}" data-focus="${esc(x?.id ?? '')}" ${x ? `style="--c:${esc(x.color)}"` : ''}>
      ${focusMark(x)}<span>${esc(x?.name ?? 'All AI')}</span><small>${focusCount(x)}</small>${CHECK}
    </button>`).join('');

  $('#feed-intro').textContent = f
    ? `Every ${f.name} story from the last 30 days, newest first. Narrow it down by source type or topic.`
    : "Everything from the last 30 days, newest first. Filter by where it came from or what it's about.";
}

function openAiMenu() {
  const menu = $('#ai-menu');
  menu.hidden = false;
  $('#ai-switch-btn').setAttribute('aria-expanded', 'true');
  ($('[aria-checked="true"]', menu) ?? $('.ai-menu-item', menu))?.focus();
}

function closeAiMenu({ restoreFocus = false } = {}) {
  const menu = $('#ai-menu');
  if (menu.hidden) return;
  menu.hidden = true;
  $('#ai-switch-btn').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#ai-switch-btn').focus();
}

/**
 * Puts the filter bar just under the nav, so a changed filter starts you at
 * the first matching story instead of somewhere in the middle of the old list.
 * With `onlyIfPast`, the page is left alone when the feed start is already on
 * screen below you — nothing is hidden then, so moving would only be a jolt.
 */
function scrollToFeedStart({ onlyIfPast = false } = {}) {
  const top = $('#controls-anchor').getBoundingClientRect().top + scrollY - $('#nav').offsetHeight;
  if (onlyIfPast && scrollY <= top + 2) return;
  if (Math.abs(scrollY - top) > 2) scrollTo({ top, behavior: 'instant' });
}

/** Picking from the feed: same as the top tabs, then land at the start of the new feed. */
function chooseFromFeed(id) {
  closeAiMenu();
  setFocus(id);
  // Always: the panel and top stories above change height, which moves the feed.
  scrollToFeedStart();
  $('#ai-switch-btn').focus({ preventScroll: true });
}

/** On phones the source-type tabs live below the sticky bar instead of inside it. */
const phone = matchMedia('(max-width: 640px)');
function placeSourceTabs() {
  const tabs = $('#tabs');
  if (phone.matches && tabs.parentElement.id !== 'mobile-filters') $('#mobile-filters').append(tabs);
  if (!phone.matches && tabs.parentElement.id !== 'controls') $('#controls').insertBefore(tabs, $('.search', $('#controls')));
  moveIndicator();
}

/* ---------- Feed ---------------------------------------------------- */

function card(item, { wide = false } = {}) {
  const src = sourceOf(item);
  const topics = item.topics.slice(0, 3).map((id) => `<span class="tag">${esc(state.topics.get(id)?.label ?? id)}</span>`).join('');
  return `
    <article class="card reveal${wide ? ' wide' : ''}" style="--accent:${esc(src.color)}" data-id="${esc(item.id)}">
      <div class="card-media">
        ${media(item, outletOf(item), src.color)}
        ${isNew(item) ? '<span class="badge-new">NEW</span>' : ''}
      </div>
      <div class="card-body">
        <div class="meta">${sourceBadge(item)}<time datetime="${esc(item.published)}">${timeAgo(item.published)}</time></div>
        <h3><a class="stretch" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">${esc(item.title)}</a></h3>
        ${item.summary ? `<p>${esc(item.summary)}</p>` : ''}
        ${item.discussion ? `<a class="discuss above" href="${esc(safeUrl(item.discussion))}" target="_blank" rel="noopener">Join the discussion →</a>` : ''}
        ${topics ? `<div class="tags">${topics}</div>` : ''}
      </div>
    </article>`;
}

function renderFeed() {
  const filtered = state.data.items.filter((i) => matches(i));
  const visible = filtered.slice(0, state.shown);

  if (!filtered.length) {
    $('#feed').innerHTML = `<div class="empty"><strong>Nothing matches that.</strong>Try another topic, or clear the search.</div>`;
    $('#more').hidden = true;
    return;
  }

  const groups = new Map();
  for (const item of visible) {
    const key = startOfDay(Date.parse(item.published));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  $('#feed').innerHTML = [...groups].map(([dayStart, items]) => {
    const leadIndex = items.length >= 4 ? items.findIndex((i) => i.image && sharpEnough(i, 900)) : -1;
    return `
    <section class="day">
      <h3 class="day-head">${dayLabel(dayStart)}<small>${items.length} ${items.length === 1 ? 'story' : 'stories'}</small></h3>
      <div class="grid">${items.map((item, i) => card(item, { wide: i === leadIndex })).join('')}</div>
    </section>`;
  }).join('');

  const remaining = filtered.length - visible.length;
  $('#more').hidden = remaining <= 0;
  $('#more').textContent = `Show more stories (${remaining} left)`;
  observeReveals();
}

function applyFilters({ resetPaging = true } = {}) {
  if (resetPaging) state.shown = PAGE_SIZE;
  renderTabs();
  renderChips();
  renderFeed();
}

/* ---------- Models, papers, sources --------------------------------- */

function renderModels() {
  const list = state.data.models ?? [];
  $('#models').hidden = !list.length;
  const now = Date.now();
  $('#model-list').innerHTML = list.map((m, i) => {
    const accent = MODEL_ACCENTS[i % MODEL_ACCENTS.length];
    const fresh = m.createdAt && now - Date.parse(m.createdAt) < 7 * DAY;
    const avatar = m.avatar
      ? `<img class="avatar" src="${esc(safeUrl(m.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initial="${esc(m.owner[0]?.toUpperCase())}">`
      : `<span class="avatar">${esc(m.owner[0]?.toUpperCase())}</span>`;
    return `
    <article class="model reveal" style="--accent:${accent}">
      <span class="rank" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <div class="owner">${avatar}<span>${esc(m.owner)}</span></div>
      <h3><a class="stretch" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.name)}</a></h3>
      <span class="pill">${esc(humanTask(m.task))}${fresh ? ' · new' : ''}</span>
      <p class="model-meta">${esc([m.createdAt && `Released ${timeAgo(m.createdAt, now)}`, licenseLabel(m.license)].filter(Boolean).join(' · '))}</p>
      <div class="numbers">
        <span title="Likes"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.5 2.3 4.5 6 4.5c2.2 0 3.6 1.2 4.4 2.4h3.2c.8-1.2 2.2-2.4 4.4-2.4 3.7 0 5.6 4 4 7.2C19.5 16.4 12 21 12 21Z"/></svg>${compact(m.likes)}</span>
        <span title="Downloads"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>${compact(m.downloads)}</span>
      </div>
    </article>`;
  }).join('');
}

function renderPapers() {
  const list = state.data.papers ?? [];
  $('#papers').hidden = !list.length;
  $('#paper-list').innerHTML = list.map((p) => {
    const by = [p.organization, p.authors ? `${p.authors} author${p.authors === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
    return `
    <article class="card paper reveal">
      <div class="card-media">
        ${media(p, 'Paper', '#fbbf24', p.id)}
        <span class="votes" title="Upvotes on Hugging Face">▲ ${p.upvotes}</span>
      </div>
      <div class="card-body">
        <div class="meta"><span class="src" style="--accent:#fbbf24">arXiv ${esc(p.id)}</span>${by ? `<span>${esc(by)}</span>` : ''}</div>
        <h3><a class="stretch" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">${esc(p.title)}</a></h3>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
        ${p.github ? `<a class="discuss above" href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">Code on GitHub →</a>` : ''}
      </div>
    </article>`;
  }).join('');
}

function renderSources() {
  const groups = Object.entries(state.data.categories).map(([id, label]) => {
    const rows = state.data.sources.filter((s) => s.category === id).map((s) => {
      const st = s.status ?? { ok: false, count: 0 };
      const cls = st.ok ? '' : st.stale ? 'stale' : 'down';
      const text = st.ok
        ? `${st.count} ${st.count === 1 ? 'story' : 'stories'}`
        : st.stale ? `offline · ${st.count} cached` : 'offline';
      return `
        <li><a class="source" href="${esc(safeUrl(s.home))}" target="_blank" rel="noopener" title="${esc(st.error ?? 'Fetched successfully')}">
          <span class="status ${cls}" aria-hidden="true"></span>
          <span class="name">${esc(s.name)}</span>
          <span class="count">${text}</span>
        </a></li>`;
    }).join('');
    return `<div class="reveal"><h3>${esc(label)}</h3><ul class="source-list">${rows}</ul></div>`;
  });
  $('#source-list').innerHTML = groups.join('');
}

/* ---------- AI focus views ------------------------------------------ */

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

function renderFocusTabs() {
  const list = state.data.focus ?? [];
  $('#focus').hidden = !list.length;
  const tab = (f) => {
    const count = focusCount(f);
    const selected = (state.focus?.id ?? null) === (f?.id ?? null);
    return `<button class="focus-tab${f ? '' : ' all'}" role="tab" aria-selected="${selected}" data-focus="${esc(f?.id ?? '')}" ${f ? `style="--c:${esc(f.color)}"` : ''}>
      ${focusMark(f)}${esc(f?.name ?? 'All AI')}<small>${count}</small></button>`;
  };
  const row = $('#focus-tabs');
  row.innerHTML = [tab(null), ...list.map(tab)].join('');

  // On phones the row scrolls sideways; keep the selected AI in view.
  // (Set scrollLeft directly — scrollIntoView would also scroll the page.)
  const selected = $('.focus-tab[aria-selected="true"]', row);
  if (selected && row.scrollWidth > row.clientWidth) {
    row.scrollLeft = selected.offsetLeft - (row.clientWidth - selected.offsetWidth) / 2;
  }
}

function renderFocusPanel() {
  const panel = $('#focus-panel');
  const f = state.focus;
  if (!f) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const now = Date.now();
  const items = pool();
  const within = (ms) => items.filter((i) => now - Date.parse(i.published) < ms).length;

  // Counted per outlet, so web-search results credit Reuters or CNBC rather than "Google News".
  const byOutlet = new Map();
  for (const i of items) {
    const name = outletOf(i);
    const entry = byOutlet.get(name) ?? { n: 0, color: sourceOf(i).color };
    entry.n++;
    byOutlet.set(name, entry);
  }
  const coverage = [...byOutlet].sort((a, b) => b[1].n - a[1].n).slice(0, 4)
    .map(([name, { n, color }]) => `<span class="src" style="--accent:${esc(color)}">${esc(name)}<small>${n}</small></span>`)
    .join('');

  const official = items.find((i) => f.sources.includes(i.source));
  const lead = official ?? items[0];
  const leadHtml = lead
    ? (() => {
      const src = sourceOf(lead);
      return `
      <article class="focus-block">
        <h3>${official ? `Latest from ${esc(f.maker)}` : 'Latest headline'}</h3>
        <div class="official">
          <div class="thumb">${media(lead, outletOf(lead), src.color)}</div>
          <div>
            <div class="meta">${sourceBadge(lead)}<time datetime="${esc(lead.published)}">${timeAgo(lead.published, now)}</time></div>
            <h4><a class="stretch" href="${esc(safeUrl(lead.url))}" target="_blank" rel="noopener">${esc(lead.title)}</a></h4>
            ${lead.summary ? `<p>${esc(lead.summary)}</p>` : ''}
          </div>
        </div>
      </article>`;
    })()
    : `<div class="focus-block"><h3>Latest headline</h3><p class="blurb" style="margin:0;color:var(--muted)">Nothing about ${esc(f.name)} in the last 30 days.</p></div>`;

  const models = (f.models ?? []).map((m) => {
    const initial = esc(m.owner[0]?.toUpperCase());
    const avatar = m.avatar
      ? `<img class="avatar" src="${esc(safeUrl(m.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initial="${initial}">`
      : `<span class="avatar">${initial}</span>`;
    return `
      <li class="model-row">
        ${avatar}
        <div><b><a class="stretch" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.name)}</a></b><span>${esc(humanTask(m.task))}</span></div>
        <div class="numbers">
          <span title="Likes">♥ ${compact(m.likes)}</span>
          <span title="Downloads">↓ ${compact(m.downloads)}</span>
        </div>
      </li>`;
  }).join('');

  const topicCounts = new Map();
  for (const i of items) {
    for (const t of i.topics) if (state.topics.get(t)?.kind === 'theme') topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const topics = [...topicCounts].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, n]) => `<button class="chip" data-focus-topic="${esc(id)}">${esc(state.topics.get(id)?.label ?? id)}<small>${n}</small></button>`)
    .join('');

  panel.style.setProperty('--c', f.color);
  panel.hidden = false;
  panel.innerHTML = `
    <div class="profile">
      <div class="profile-head">
        ${logo(f.id)
    ? `<span class="monogram neon" aria-hidden="true">${logo(f.id)}</span>`
    : `<span class="monogram" aria-hidden="true">${esc(f.name[0])}</span>`}
        <div>
          <p class="maker">by ${esc(f.maker)}</p>
          <h2>${esc(f.name)}</h2>
        </div>
      </div>
      <p class="blurb">${esc(f.blurb)}</p>
      <div class="focus-links">
        ${f.links.map((l) => `<a class="focus-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)}${ARROW}</a>`).join('')}
      </div>
      ${coverage ? `<div class="coverage">Most coverage from ${coverage}</div>` : ''}
      <div class="mini-stats">
        <div><strong>${within(DAY)}</strong><span>24 hours</span></div>
        <div><strong>${within(7 * DAY)}</strong><span>7 days</span></div>
        <div><strong>${items.length}</strong><span>30 days</span></div>
      </div>
    </div>
    <div class="focus-side">
      ${leadHtml}
      ${models ? `<div class="focus-block"><h3>Trending open models</h3><ul class="model-rows">${models}</ul></div>` : ''}
      ${topics ? `<div class="focus-block"><h3>What the coverage is about</h3><div class="topic-cloud">${topics}</div></div>` : ''}
    </div>`;
}

/** Hero headline, lede, canvas colours and page title follow the focus. */
function renderHero() {
  const f = state.focus;
  const subject = $('#hero-subject');
  const text = f ? f.name : 'artificial intelligence';
  if (subject.textContent !== text) {
    subject.textContent = text;
    subject.classList.remove('swap');
    void subject.offsetWidth; // restart the swap-in animation
    subject.classList.add('swap');
  }
  subject.style.setProperty('--subject-gradient', f
    ? `linear-gradient(100deg, ${f.color} 0%, rgb(${tint(f.color, 0.55)}) 35%, ${f.color} 70%, rgb(${tint(f.color, 0.55)}) 100%)`
    : null);

  const sources = state.data.sources.length;
  $('#lede').textContent = f
    ? `Every story about ${f.name} across ${sources} sources${f.sources.length ? `, including ${f.maker}'s own announcements` : ''} — collected every 30 minutes, so you never miss a beat.`
    : `Lab announcements, tech journalism, research papers and trending open models from ${sources} sources — collected every 30 minutes, so you never miss a beat.`;

  neural?.setPalette(f ? [tint(f.color), tint(f.color, 0.35), tint(f.color, 0.65)] : null);
  document.title = f ? `${f.name} · AI Pulse` : 'AI Pulse';
  $('#feed-heading').innerHTML = f ? `Latest on <em>${esc(f.name)}</em>` : 'Latest <em>stories</em>';
  renderAiSwitch();
}

function setFocus(id, { push = true } = {}) {
  const f = focusById(id);
  if ((f?.id ?? null) === (state.focus?.id ?? null) && push) return;
  state.focus = f;
  state.shown = PAGE_SIZE;

  if (push) {
    const url = new URL(location.href);
    if (f) url.searchParams.set('ai', f.id);
    else url.searchParams.delete('ai');
    url.hash = '';
    history.pushState(null, '', url);
  }

  renderHero();
  renderFocusTabs();
  renderFocusPanel();
  renderStats();
  renderTop();
  renderTicker();
  applyFilters();
}

/* ---------- Header & stats ------------------------------------------ */

function metaOf(data) {
  return { generatedAt: data.generatedAt, nextUpdateAt: data.nextUpdateAt ?? null, schedule: data.schedule ?? null };
}

/** GitHub usually starts a scheduled run within this long of its slot, when it starts it at all. */
const RUN_GRACE_MS = 15 * 60 * 1000;

/**
 * Where we are relative to the collection schedule:
 *   { waiting, next, prev }  (ms timestamps of when snapshots should be live)
 * `waiting` is true for a little while after a slot passes without a newer
 * snapshot. Once that grace period is over the slot is treated as skipped and
 * the countdown moves on to the following one, instead of reporting a delay forever.
 * Returns null when the snapshot carries no schedule.
 */
function updateTiming(meta, now = Date.now()) {
  if (meta.schedule?.minutes?.length) {
    const lag = (meta.schedule.deployLagMinutes ?? 3) * 60 * 1000;
    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    const times = [];
    for (let h = -1; h <= 1; h++) {
      for (const m of meta.schedule.minutes) times.push(hour.getTime() + h * HOUR + m * 60 * 1000 + lag);
    }
    const prev = Math.max(...times.filter((t) => t <= now));
    const next = Math.min(...times.filter((t) => t > now));
    const collected = Date.parse(meta.generatedAt);
    // The run for `prev` started at prev - lag; a snapshot from before that means it hasn't landed.
    const waiting = collected < prev - lag && now - prev < RUN_GRACE_MS;
    return { waiting, next, prev };
  }
  if (meta.nextUpdateAt) {
    // Older snapshots: a single expected time.
    const next = Date.parse(meta.nextUpdateAt);
    return { waiting: next <= now, next, prev: Date.parse(meta.generatedAt) };
  }
  return null;
}

function countUp(el, target) {
  const duration = 1400;
  const start = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - p) ** 4;
    el.textContent = Math.round(target * eased).toLocaleString('en');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats() {
  const now = Date.now();
  const { sources, papers } = state.data;
  const items = pool();
  const live = sources.filter((s) => s.status?.ok).length;
  const newCount = items.filter(isNew).length;

  const values = {
    'stories-24h': items.filter((i) => now - Date.parse(i.published) < DAY).length,
    'stories-week': items.filter((i) => now - Date.parse(i.published) < 7 * DAY).length,
    papers: papers?.length ?? 0,
    new: state.lastVisit === null ? live : newCount,
  };
  $('#new-label').textContent = state.lastVisit === null ? 'sources live right now' : 'new since your last visit';

  for (const el of $$('[data-count]')) countUp(el, values[el.dataset.count] ?? 0);
}

/* ---------- Motion helpers ------------------------------------------ */

const revealObserver = new IntersectionObserver((entries) => {
  const incoming = entries.filter((e) => e.isIntersecting);
  incoming.forEach((entry, i) => {
    entry.target.style.setProperty('--delay', `${Math.min(i, 8) * 70}ms`);
    entry.target.classList.add('in');
    revealObserver.unobserve(entry.target);
  });
}, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 });

function observeReveals() {
  $$('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
}

let shownProgress = -1;

function onScroll() {
  const root = document.scrollingElement ?? document.documentElement;
  const max = root.scrollHeight - root.clientHeight;
  // Clamp to 0–1. Elastic overscroll (macOS rubber-banding when you keep
  // pushing past the bottom or top) reports positions beyond the page, which
  // made the ring open a gap and the top bar misbehave until you let go.
  const progress = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
  const rounded = Math.round(progress * 1000) / 1000;
  if (rounded !== shownProgress) {
    shownProgress = rounded;
    // Written straight onto the two elements: a custom property on <html>
    // re-styled the whole document on every scroll frame.
    $('.progress').style.transform = `scaleX(${rounded})`;
    $('#to-top .bar').style.strokeDashoffset = String(100 - rounded * 100);
  }

  $('#nav').classList.toggle('scrolled', scrollY > 20);
  $('#to-top').classList.toggle('show', scrollY > innerHeight * 0.9);
  const controls = $('#controls');
  const style = getComputedStyle(controls);
  controls.classList.toggle('stuck', style.position === 'sticky'
    && controls.getBoundingClientRect().top <= parseFloat(style.top) + 1);
}

const smoothBehavior = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/**
 * The logo: back to the plain home page — all AI, no filters or search, at the
 * top, with a clean URL. Done in place so it's instant, but the link's real
 * href ("./") still works for new tabs and when the data failed to load.
 */
function goHome() {
  closeAiMenu();
  $('#toast').hidden = true;
  state.category = 'all';
  state.topic = null;
  state.query = '';
  $('#search').value = '';

  if (state.focus) {
    setFocus(null); // also cleans ?ai= from the URL and re-renders everything
  } else {
    if (location.search || location.hash) history.pushState(null, '', location.pathname);
    applyFilters();
  }
  scrollTo({ top: 0, behavior: smoothBehavior() });
}

/* ---------- Data ---------------------------------------------------- */

function setData(data) {
  state.data = data;
  state.sources = new Map(data.sources.map((s) => [s.id, s]));
  state.topics = new Map(data.topics.map((t) => [t.id, t]));
}

async function loadData() {
  const res = await fetch(`${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function readLastVisit() {
  // The baseline is fixed for the whole browser session, so reloading the
  // page doesn't wipe the NEW badges you haven't looked at yet.
  try {
    let baseline = sessionStorage.getItem('ai-pulse:baseline');
    if (baseline === null) {
      baseline = localStorage.getItem('ai-pulse:last-visit') ?? '';
      sessionStorage.setItem('ai-pulse:baseline', baseline);
    }
    localStorage.setItem('ai-pulse:last-visit', String(Date.now()));
    return baseline ? Number(baseline) : null;
  } catch {
    return null;
  }
}

function renderAll() {
  renderHero();
  renderFocusTabs();
  renderFocusPanel();
  renderStats();
  renderTop();
  renderTicker();
  applyFilters({ resetPaging: false });
  renderModels();
  renderPapers();
  renderSources();
  observeReveals();
}

async function poll() {
  try {
    const fresh = await loadData();
    if (fresh.generatedAt === state.meta.generatedAt) return;
    state.meta = metaOf(fresh);

    const known = new Set(state.data.items.map((i) => i.id));
    const added = fresh.items.filter((i) => !known.has(i.id) && inFocus(i)).length;
    if (!added) {
      setData(fresh);
      return;
    }
    const toast = $('#toast');
    toast.innerHTML = `<span><b>${added}</b> new ${state.focus ? `${esc(state.focus.name)} ` : ''}${added === 1 ? 'story' : 'stories'} just came in</span><button class="btn">Show</button>`;
    toast.hidden = false;
    $('button', toast).onclick = () => {
      toast.hidden = true;
      setData(fresh);
      renderAll();
      $('#latest').scrollIntoView();
    };
  } catch {
    // Offline or mid-deploy; try again next round.
  }
}

let pollTimer;

/**
 * Check for a new snapshot right after the next one should be live; while a
 * run is running late, check every minute until it lands or counts as skipped.
 */
function schedulePoll() {
  clearTimeout(pollTimer);
  const now = Date.now();
  const timing = state.meta ? updateTiming(state.meta, now) : null;
  let delay = POLL_MS;
  if (timing?.waiting) delay = 60 * 1000;
  else if (timing) delay = Math.min(timing.next - now + 15 * 1000, POLL_MS);
  pollTimer = setTimeout(async () => {
    await poll();
    schedulePoll();
  }, Math.max(delay, 5 * 1000));
}

/* ---------- Events -------------------------------------------------- */

function bindEvents() {
  // Broken images -> generated art (or initials for avatars).
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('avatar')) {
      img.outerHTML = `<span class="avatar">${esc(img.dataset.initial ?? '?')}</span>`;
    } else if (img.closest('.portrait')) {
      // Portrait unavailable: keep the illustration, drop the frame and credit.
      const box = img.closest('.composite');
      box.querySelector('.photo-credit')?.remove();
      img.closest('.portrait').remove();
    } else if (img.classList.contains('composite-bg')) {
      img.outerHTML = coverArt(img.dataset.seed, img.dataset.color, img.dataset.label, [], { bare: true });
    } else if (img.dataset.seed) {
      const markIds = (img.dataset.marks ?? '').split(',').filter(Boolean);
      img.outerHTML = coverArt(img.dataset.seed, img.dataset.color, img.dataset.label, marksFor(markIds));
    }
  }, true);

  document.addEventListener('load', (e) => {
    if (e.target instanceof HTMLImageElement) e.target.classList.remove('loading');
  }, true);

  $('#focus-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.focus-tab');
    if (tab) setFocus(tab.dataset.focus || null);
  });

  $('#focus-panel').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-focus-topic]');
    if (!chip) return;
    state.topic = chip.dataset.focusTopic;
    applyFilters();
    scrollToFeedStart();
  });

  addEventListener('popstate', () => setFocus(new URLSearchParams(location.search).get('ai'), { push: false }));

  // Coming back to a tab that slept through an update: check right away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !state.meta) return;
    const timing = updateTiming(state.meta);
    // Slept through a slot (or one is overdue): check right away.
    if (timing && (timing.waiting || Date.parse(state.meta.generatedAt) < timing.prev)) poll().then(schedulePoll);
  });

  $('.brand').addEventListener('click', (e) => {
    // Let cmd/ctrl/shift-click open a new tab or window as usual.
    if (!state.data || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    goHome();
  });

  $('#to-top').addEventListener('click', () => {
    scrollTo({ top: 0, behavior: smoothBehavior() });
    $('.brand').focus({ preventScroll: true });
  });

  $('#ai-switch-btn').addEventListener('click', () => {
    if ($('#ai-menu').hidden) openAiMenu();
    else closeAiMenu();
  });

  $('#ai-switch-btn').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openAiMenu();
    }
  });

  $('#ai-menu').addEventListener('click', (e) => {
    const item = e.target.closest('.ai-menu-item');
    if (item) chooseFromFeed(item.dataset.focus || null);
  });

  $('#ai-menu').addEventListener('keydown', (e) => {
    const items = $$('.ai-menu-item', $('#ai-menu'));
    const i = items.indexOf(document.activeElement);
    const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      items[(move + items.length) % items.length].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAiMenu({ restoreFocus: true });
    } else if (e.key === 'Tab') {
      closeAiMenu();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#ai-switch')) closeAiMenu();
  });

  phone.addEventListener('change', placeSourceTabs);

  $('#tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.category = tab.dataset.category;
    state.topic = null;
    applyFilters();
    scrollToFeedStart({ onlyIfPast: true });
    // The tabs were re-rendered; keep keyboard focus on the one just chosen.
    $(`.tab[data-category="${state.category}"]`)?.focus({ preventScroll: true });
  });

  $('#topics').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const id = chip.dataset.topic;
    state.topic = state.topic === id ? null : id;
    applyFilters();
    scrollToFeedStart({ onlyIfPast: true });
    $(`#topics .chip[data-topic="${id}"]`)?.focus({ preventScroll: true });
  });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value.trim();
      applyFilters();
      scrollToFeedStart({ onlyIfPast: true });
    }, 140);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      $('#search').focus();
    }
    if (e.key === 'Escape' && document.activeElement === $('#search')) {
      $('#search').value = '';
      state.query = '';
      applyFilters();
      scrollToFeedStart({ onlyIfPast: true });
    }
  });

  $('#more').addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    renderFeed();
  });

  for (const btn of $$('[data-scroll]')) {
    btn.addEventListener('click', () => {
      const list = $('#model-list');
      list.scrollBy({ left: Number(btn.dataset.scroll) * list.clientWidth * 0.8, behavior: 'smooth' });
    });
  }

  // Spotlight follows the pointer across cards.
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.card');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, { passive: true });

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });

  addEventListener('resize', moveIndicator);
  // The page grows and shrinks without scrolling ("Show more", filters, images
  // loading); keep the progress bar and ring honest when it does.
  new ResizeObserver(() => onScroll()).observe(document.body);
  document.fonts?.ready.then(moveIndicator);
}

/* ---------- Boot ---------------------------------------------------- */

async function main() {
  neural = startNeural($('#neural'));
  bindEvents();
  placeSourceTabs();
  onScroll();
  state.lastVisit = readLastVisit();

  try {
    setData(await loadData());
  } catch (err) {
    $('#top-stories').innerHTML = '';
    $('#feed').innerHTML = `<div class="empty"><strong>Couldn't load the news right now.</strong>${esc(err.message)} — try refreshing in a minute.</div>`;
    return;
  }

  state.meta = metaOf(state.data);
  state.focus = focusById(new URLSearchParams(location.search).get('ai'));
  renderAll();
  schedulePoll();
}

main();
