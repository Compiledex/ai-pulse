/**
 * Trending models and daily papers from the public Hugging Face API.
 * No token needed for these endpoints.
 */

import { fetchJson, mapLimit } from './http.mjs';
import { truncate } from './text.mjs';

const HF = 'https://huggingface.co';

export async function trendingModels(limit = 12) {
  const models = await fetchJson(`${HF}/api/models?sort=trendingScore&direction=-1&limit=${limit}`);

  // Avatars live on a separate endpoint, and the owner may be a user or an org.
  const owners = [...new Set(models.map((m) => m.id.split('/')[0]))];
  const avatars = new Map();
  await mapLimit(owners, 6, async (owner) => {
    for (const kind of ['organizations', 'users']) {
      try {
        const { avatarUrl } = await fetchJson(`${HF}/api/${kind}/${encodeURIComponent(owner)}/avatar`, { timeoutMs: 8000, retries: 0 });
        if (avatarUrl) {
          avatars.set(owner, avatarUrl.startsWith('http') ? avatarUrl : `${HF}${avatarUrl}`);
          return;
        }
      } catch {
        // Try the other kind; a missing avatar just falls back to initials.
      }
    }
  });

  return models.map((m) => {
    const [owner, name = m.id] = m.id.split('/');
    return {
      id: m.id,
      owner,
      name,
      url: `${HF}/${m.id}`,
      avatar: avatars.get(owner) ?? null,
      task: m.pipeline_tag ?? null,
      license: m.tags?.find((t) => t.startsWith('license:'))?.slice('license:'.length) ?? null,
      likes: m.likes ?? 0,
      downloads: m.downloads ?? 0,
      createdAt: m.createdAt ?? null,
    };
  });
}

/** The most upvoted papers submitted to HF Daily Papers in the last few days. */
export async function dailyPapers(limit = 9, { days = 3, now = Date.now() } = {}) {
  const papers = await fetchJson(`${HF}/api/daily_papers?limit=100`);
  const cutoff = now - days * 24 * 3600 * 1000;

  const recent = papers.filter((p) => new Date(p.paper?.submittedOnDailyAt ?? p.publishedAt).getTime() >= cutoff);
  // Over quiet stretches (holidays) the window can be nearly empty — widen it.
  const pool = recent.length >= limit ? recent : papers;

  return pool
    .filter((p) => p.paper?.id)
    .sort((a, b) => (b.paper?.upvotes ?? 0) - (a.paper?.upvotes ?? 0))
    .slice(0, limit)
    .map((p) => ({
      id: p.paper.id,
      title: p.title ?? p.paper.title,
      summary: truncate((p.paper.ai_summary || p.summary || '').replace(/\s+/g, ' ').trim(), 240),
      url: `${HF}/papers/${p.paper.id}`,
      thumbnail: p.thumbnail ?? null,
      upvotes: p.paper.upvotes ?? 0,
      comments: p.numComments ?? 0,
      authors: (p.paper.authors ?? []).length,
      organization: p.paper.organization?.fullname ?? p.organization?.fullname ?? null,
      github: p.paper.githubRepo ?? null,
      publishedAt: p.paper.submittedOnDailyAt ?? p.publishedAt,
    }));
}
