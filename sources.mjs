/**
 * Every place AI Pulse reads from. Adding a source is one entry here.
 *
 *   kind      'rss' (RSS or Atom) or 'anthropic' (scraped news index — no feed exists)
 *   category  'labs'     — announcements straight from the people building AI
 *             'press'    — tech journalism
 *             'analysis' — newsletters, independent writers, community
 *   weight    how strongly the source counts when picking "Top stories"
 *             (first-party lab news > general press > high-volume corporate blogs)
 *   color     accent used for the source badge and generated cover art
 *
 * Order matters for de-duplication: when two sources link the same story, the
 * one listed first wins. Aggregators (Hacker News) therefore go last.
 */

export const SOURCES = [
  // Labs
  { id: 'openai', name: 'OpenAI', category: 'labs', weight: 1.8, color: '#10a37f', home: 'https://openai.com/news', kind: 'rss', url: 'https://openai.com/news/rss.xml' },
  { id: 'anthropic', name: 'Anthropic', category: 'labs', weight: 1.8, color: '#d97757', home: 'https://www.anthropic.com/news', kind: 'anthropic', url: 'https://www.anthropic.com/news' },
  { id: 'deepmind', name: 'Google DeepMind', category: 'labs', weight: 1.6, color: '#4f8df9', home: 'https://deepmind.google/discover/blog/', kind: 'rss', url: 'https://deepmind.google/blog/rss.xml' },
  { id: 'google', name: 'Google AI', category: 'labs', weight: 1.3, color: '#34a853', home: 'https://blog.google/technology/ai/', kind: 'rss', url: 'https://blog.google/technology/ai/rss/' },
  { id: 'mistral', name: 'Mistral AI', category: 'labs', weight: 1.5, color: '#ff7000', home: 'https://mistral.ai/news', kind: 'rss', url: 'https://mistral.ai/rss.xml' },
  { id: 'nvidia', name: 'NVIDIA', category: 'labs', weight: 0.9, color: '#76b900', home: 'https://blogs.nvidia.com/', kind: 'rss', url: 'https://blogs.nvidia.com/feed/' },
  { id: 'huggingface', name: 'Hugging Face', category: 'labs', weight: 1.1, color: '#ffb000', home: 'https://huggingface.co/blog', kind: 'rss', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'aws', name: 'AWS Machine Learning', category: 'labs', weight: 0.6, color: '#ff9900', home: 'https://aws.amazon.com/blogs/machine-learning/', kind: 'rss', url: 'https://aws.amazon.com/blogs/machine-learning/feed/' },

  // Press
  { id: 'verge', name: 'The Verge', category: 'press', weight: 1.25, color: '#e1306c', home: 'https://www.theverge.com/ai-artificial-intelligence', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { id: 'techcrunch', name: 'TechCrunch', category: 'press', weight: 1.2, color: '#0bd35a', home: 'https://techcrunch.com/category/artificial-intelligence/', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { id: 'wired', name: 'WIRED', category: 'press', weight: 1.2, color: '#e8e8e8', home: 'https://www.wired.com/tag/ai/', kind: 'rss', url: 'https://www.wired.com/feed/tag/ai/latest/rss' },
  { id: 'mittr', name: 'MIT Technology Review', category: 'press', weight: 1.25, color: '#ff4d4d', home: 'https://www.technologyreview.com/topic/artificial-intelligence/', kind: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { id: 'ars', name: 'Ars Technica', category: 'press', weight: 1.15, color: '#ff4e00', home: 'https://arstechnica.com/ai/', kind: 'rss', url: 'https://arstechnica.com/ai/feed/' },
  { id: 'guardian', name: 'The Guardian', category: 'press', weight: 1.0, color: '#6fa8ff', home: 'https://www.theguardian.com/technology/artificialintelligenceai', kind: 'rss', url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss' },
  { id: 'decoder', name: 'The Decoder', category: 'press', weight: 1.0, color: '#a78bfa', home: 'https://the-decoder.com/', kind: 'rss', url: 'https://the-decoder.com/feed/' },

  // Analysis & community
  { id: 'simonw', name: 'Simon Willison', category: 'analysis', weight: 1.1, color: '#38bdf8', home: 'https://simonwillison.net/', kind: 'rss', url: 'https://simonwillison.net/atom/everything/' },
  { id: 'latent', name: 'Latent Space', category: 'analysis', weight: 1.0, color: '#f472b6', home: 'https://www.latent.space/', kind: 'rss', url: 'https://www.latent.space/feed' },
  // importai.substack.com returns 403 to GitHub Actions runners; the same issues are mirrored here.
  { id: 'importai', name: 'Import AI', category: 'analysis', weight: 1.2, color: '#facc15', home: 'https://jack-clark.net/', kind: 'rss', url: 'https://jack-clark.net/feed/' },
  { id: 'hn', name: 'Hacker News', category: 'analysis', weight: 1.0, color: '#ff6600', home: 'https://news.ycombinator.com/', kind: 'rss', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic+OR+Gemini&points=100' },
];

export const CATEGORIES = {
  labs: 'AI labs',
  press: 'Tech press',
  analysis: 'Analysis & community',
};
