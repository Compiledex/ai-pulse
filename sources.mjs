/**
 * Every place AI Pulse reads from. Adding a source is one entry here.
 *
 *   kind      'rss'        RSS or Atom feed
 *             'anthropic'  scraped news index — Anthropic publishes no feed
 *             'googlenews' a Google News search feed, for outlets without their own
 *             'websearch'  one Google News search per AI in focus.mjs (see lib/googlenews.mjs)
 *   category  'labs'       announcements straight from the people building AI
 *             'press'      tech journalism
 *             'mainstream' business and general news desks
 *             'analysis'   newsletters, independent writers, community
 *             'web'        search results from across the web
 *   aiOnly    the feed covers everything (or all of tech), so only keep stories
 *             that are clearly about AI
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

  // Business & world — general news desks, filtered down to their AI stories
  { id: 'reuters', name: 'Reuters', category: 'mainstream', weight: 1.3, color: '#ff8000', home: 'https://www.reuters.com/technology/artificial-intelligence/', kind: 'googlenews', aiOnly: true, url: 'https://news.google.com/rss/search?q=site:reuters.com+(AI+OR+%22artificial+intelligence%22)+when:14d&hl=en-US&gl=US&ceid=US:en' },
  { id: 'axios', name: 'Axios', category: 'mainstream', weight: 1.2, color: '#5b9dff', home: 'https://www.axios.com/technology/automation-and-ai', kind: 'rss', aiOnly: true, url: 'https://api.axios.com/feed/' },
  { id: 'bloomberg', name: 'Bloomberg', category: 'mainstream', weight: 1.2, color: '#b48cff', home: 'https://www.bloomberg.com/ai', kind: 'rss', aiOnly: true, url: 'https://feeds.bloomberg.com/technology/news.rss' },
  { id: 'ft', name: 'Financial Times', category: 'mainstream', weight: 1.2, color: '#f9c5a4', home: 'https://www.ft.com/artificial-intelligence', kind: 'rss', aiOnly: true, url: 'https://www.ft.com/artificial-intelligence?format=rss' },
  { id: 'nyt', name: 'The New York Times', category: 'mainstream', weight: 1.25, color: '#d4d4d8', home: 'https://www.nytimes.com/spotlight/artificial-intelligence', kind: 'rss', aiOnly: true, url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml' },
  { id: 'cnbc', name: 'CNBC', category: 'mainstream', weight: 1.1, color: '#2fb5ff', home: 'https://www.cnbc.com/ai-artificial-intelligence/', kind: 'rss', aiOnly: true, url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
  { id: 'bbc', name: 'BBC News', category: 'mainstream', weight: 1.15, color: '#ff5a5f', home: 'https://www.bbc.com/news/topics/ce1qrvleleqt', kind: 'rss', aiOnly: true, url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'cbs', name: 'CBS News', category: 'mainstream', weight: 1.0, color: '#8fb8ff', home: 'https://www.cbsnews.com/technology/', kind: 'rss', aiOnly: true, url: 'https://www.cbsnews.com/latest/rss/technology' },
  { id: 'npr', name: 'NPR', category: 'mainstream', weight: 1.0, color: '#ff6b81', home: 'https://www.npr.org/sections/technology/', kind: 'rss', aiOnly: true, url: 'https://feeds.npr.org/1019/rss.xml' },
  { id: 'politico', name: 'Politico', category: 'mainstream', weight: 1.05, color: '#ff4d4d', home: 'https://www.politico.com/technology', kind: 'rss', aiOnly: true, url: 'https://rss.politico.com/technology.xml' },
  { id: 'businessinsider', name: 'Business Insider', category: 'mainstream', weight: 1.0, color: '#3dd6c6', home: 'https://www.businessinsider.com/tech', kind: 'rss', aiOnly: true, url: 'https://feeds.businessinsider.com/custom/all' },

  // Analysis & community
  { id: 'simonw', name: 'Simon Willison', category: 'analysis', weight: 1.1, color: '#38bdf8', home: 'https://simonwillison.net/', kind: 'rss', url: 'https://simonwillison.net/atom/everything/' },
  { id: 'latent', name: 'Latent Space', category: 'analysis', weight: 1.0, color: '#f472b6', home: 'https://www.latent.space/', kind: 'rss', url: 'https://www.latent.space/feed' },
  // importai.substack.com returns 403 to GitHub Actions runners; the same issues are mirrored here.
  { id: 'importai', name: 'Import AI', category: 'analysis', weight: 1.2, color: '#facc15', home: 'https://jack-clark.net/', kind: 'rss', url: 'https://jack-clark.net/feed/' },
  { id: 'hn', name: 'Hacker News', category: 'analysis', weight: 1.0, color: '#ff6600', home: 'https://news.ycombinator.com/', kind: 'rss', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic+OR+Gemini&points=100' },

  // Around the web — one Google News search per AI (queries live in focus.mjs).
  // Last on purpose: when a search result duplicates a story above, the story above wins.
  { id: 'web', name: 'Google News', category: 'web', weight: 0.9, color: '#9aa7bd', home: 'https://news.google.com/', kind: 'websearch' },
];

export const CATEGORIES = {
  labs: 'AI labs',
  press: 'Tech press',
  mainstream: 'Business & world',
  analysis: 'Analysis',
  web: 'Around the web',
};
