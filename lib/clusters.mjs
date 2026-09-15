/**
 * Groups stories about the same event, so the page can tell a story ten
 * outlets are covering from one only a single outlet wrote.
 *
 * No model, just words: each story becomes a TF-IDF vector of its headline
 * (counted twice) and the start of its teaser. Words that appear everywhere
 * ("AI", "says", "OpenAI") weigh almost nothing; specific ones ("kill switch",
 * "Nasdaq", "Cloudera") weigh a lot. Two stories published within a couple of
 * days of each other join the same group when their vectors are similar
 * enough and they share at least two meaningful words. Groups are the
 * connected components of those links (union-find).
 */

const STOPWORDS = new Set(`
a about above after again against ago all almost also am amid among an and another any are around as at away back be because
been before being below between both but by can could did do does doing done down during each even ever every few first for
from further get gets getting go goes going got had has have having he her here hers him his how however i if in inside into
is it its itself just last later least less let like likely made make makes making many may me might more most much must my
near never new news next no nor not now of off on once one only onto or other our out over own per put rather really report
reports same say says said see seen set she should show shows since so some still such take takes than that the their them then
there these they this those though three through thus to today told too two under until up upon us use used very via want was
way we week well were what when where whether which while who whom why will with within without would year years yet you your
live latest update updates exclusive opinion analysis explained watch video podcast newsletter here's what's it's
`.trim().split(/\s+/));

/** Content words of a text: lowercased, accents and possessives dropped, light plural stemming. */
export function contentWords(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d{1,2}$/.test(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** Union-find that also tracks each group's earliest and latest story, to stop chains. */
function unionFind(times) {
  const parent = times.map((_, i) => i);
  const first = [...times];
  const last = [...times];
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const span = (a, b) => Math.max(last[find(a)], last[find(b)]) - Math.min(first[find(a)], first[find(b)]);
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[ra] = rb;
    first[rb] = Math.min(first[ra], first[rb]);
    last[rb] = Math.max(last[ra], last[rb]);
  };
  return { find, union, span };
}

export const CLUSTER_DEFAULTS = {
  windowHours: 48, // stories further apart are never the same event
  maxSpanHours: 72, // a group never stretches wider, so "A~B~C~D…" can't chain a whole week of related news into one
  threshold: 0.32, // cosine similarity needed to link two stories
  minSharedWords: 2, // …and at least this many meaningful words in common
  teaserWords: 30, // how much of the teaser counts, next to the headline
};

/**
 * Returns, for each item (same order), { cluster, coverage }:
 *   cluster   id shared by every story about the same event (the id of its earliest story)
 *   coverage  how many different outlets are covering it (`outletOf(item)` decides what an outlet is)
 */
export function clusterStories(items, outletOf = (i) => i.publisher ?? i.source, options = {}) {
  const { windowHours, maxSpanHours, threshold, minSharedWords, teaserWords } = { ...CLUSTER_DEFAULTS, ...options };
  const n = items.length;

  // Term counts per story: headline words twice, then the start of the teaser.
  const docs = items.map((item) => {
    const counts = new Map();
    const add = (w, k) => counts.set(w, (counts.get(w) ?? 0) + k);
    for (const w of contentWords(item.title)) add(w, 2);
    for (const w of contentWords((item.summary ?? '').split(/\s+/).slice(0, teaserWords).join(' '))) add(w, 1);
    return counts;
  });

  const df = new Map();
  for (const doc of docs) for (const w of doc.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w) => Math.log((n + 1) / ((df.get(w) ?? 0) + 1));
  // Words in more than ~8% of all stories say nothing about which event this is.
  const meaningful = (w) => (df.get(w) ?? 0) <= Math.max(2, n * 0.08);

  const vectors = docs.map((doc) => {
    const v = new Map();
    let norm = 0;
    for (const [w, tf] of doc) {
      const weight = tf * idf(w);
      v.set(w, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, weight] of v) v.set(w, weight / norm);
    return v;
  });

  const times = items.map((i) => Date.parse(i.published));
  const order = [...items.keys()].sort((a, b) => times[a] - times[b]);
  const { find, union, span } = unionFind(times);
  const windowMs = windowHours * 3600 * 1000;
  const maxSpanMs = maxSpanHours * 3600 * 1000;

  for (let x = 0; x < order.length; x++) {
    const a = order[x];
    for (let y = x + 1; y < order.length; y++) {
      const b = order[y];
      if (times[b] - times[a] > windowMs) break;
      const [small, large] = vectors[a].size <= vectors[b].size ? [vectors[a], vectors[b]] : [vectors[b], vectors[a]];
      let dot = 0;
      let shared = 0;
      for (const [w, weight] of small) {
        const other = large.get(w);
        if (other === undefined) continue;
        dot += weight * other;
        if (meaningful(w)) shared++;
      }
      if (dot >= threshold && shared >= minSharedWords && span(a, b) <= maxSpanMs) union(a, b);
    }
  }

  const groups = new Map();
  for (const i of order) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { cluster: items[i].id, outlets: new Set() });
    groups.get(root).outlets.add(outletOf(items[i]));
  }
  return items.map((_, i) => {
    const g = groups.get(find(i));
    return { cluster: g.cluster, coverage: g.outlets.size };
  });
}
