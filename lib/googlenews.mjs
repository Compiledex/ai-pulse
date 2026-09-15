/**
 * Google News search feeds.
 *
 * Used twice: for outlets that publish no feed of their own (Reuters, via a
 * site: search), and for "Around the web" — one search per AI, which is the
 * closest thing to what you'd see by googling it.
 *
 * Trade-offs worth knowing: links are news.google.com redirects to the
 * article, and the feed has no teaser or image (its <description> just repeats
 * the headline), so these stories get generated cover art.
 */

export function searchUrl(query, { days = 7 } = {}) {
  const q = encodeURIComponent(`${query} when:${days}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/** Headlines arrive as "Title - Publisher"; drop the suffix when it names the publisher. */
export function stripPublisher(title, publisher) {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

/**
 * Parsed Google News entries -> entries ready for normalizeEntries.
 * `keepPublisher` stores the original outlet so the page can show "Reuters
 * via Google News" instead of just "Google News".
 */
export function fromGoogleNews(entries, { keepPublisher = true, limit = Infinity } = {}) {
  return entries.slice(0, limit).map((e) => ({
    ...e,
    title: stripPublisher(e.title, e.publisher),
    summary: '', // only repeats the headline and outlet
    image: '', // "looked up, none": the redirect pages have no share image to find
    publisher: keepPublisher ? e.publisher : null,
    via: 'Google News',
  }));
}
