/**
 * The AIs you can focus the page on. Selecting one filters every story list
 * to that AI and shows a profile panel with its official links and models.
 *
 *   topic    topic id from lib/topics.mjs — stories mentioning the AI
 *   sources  source ids from sources.mjs — the maker's own blog, whose posts
 *            count even when the headline doesn't name the company
 *   hf       Hugging Face authors whose trending open models are shown
 *   search   Google News query for "Around the web" — roughly what you'd get by
 *            googling the AI. Quoted phrases keep "Claude" from matching people.
 *
 * Blurbs stay deliberately free of version numbers so they don't go stale;
 * the stories themselves say what's current.
 */

export const FOCUS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    maker: 'OpenAI',
    topic: 'openai',
    sources: ['openai'],
    color: '#10a37f',
    blurb: "OpenAI's assistant, and the GPT models, Sora and Codex behind it.",
    links: [
      { label: 'Open ChatGPT', url: 'https://chatgpt.com/' },
      { label: 'OpenAI news', url: 'https://openai.com/news/' },
      { label: 'API docs', url: 'https://developers.openai.com/api/docs' },
    ],
    hf: [],
    search: '"OpenAI" OR "ChatGPT"',
  },
  {
    id: 'claude',
    name: 'Claude',
    maker: 'Anthropic',
    topic: 'anthropic',
    sources: ['anthropic'],
    color: '#d97757',
    blurb: "Anthropic's family of models and assistant, known for coding, agents and a focus on safety research.",
    links: [
      { label: 'Open Claude', url: 'https://claude.ai/' },
      { label: 'Anthropic news', url: 'https://www.anthropic.com/news' },
      { label: 'API docs', url: 'https://platform.claude.com/docs/en/home' },
    ],
    hf: [],
    search: '"Anthropic" OR "Claude AI"',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    maker: 'Google',
    topic: 'google',
    sources: ['deepmind', 'google'],
    color: '#4f8df9',
    blurb: "Google's assistant and model family from Google DeepMind, plus the open Gemma models.",
    links: [
      { label: 'Open Gemini', url: 'https://gemini.google.com/' },
      { label: 'Google DeepMind', url: 'https://deepmind.google/' },
      { label: 'Developer docs', url: 'https://ai.google.dev/' },
    ],
    hf: ['google'],
    search: '"Google Gemini" OR "Google DeepMind"',
  },
  {
    id: 'meta',
    name: 'Meta AI',
    maker: 'Meta',
    topic: 'meta',
    sources: [],
    color: '#0a7cff',
    blurb: "Meta's assistant across its apps, and the open-weight Llama models.",
    links: [
      { label: 'Open Meta AI', url: 'https://www.meta.ai/' },
      { label: 'Meta AI blog', url: 'https://ai.meta.com/blog/' },
      { label: 'Llama', url: 'https://www.llama.com/' },
    ],
    hf: ['meta-llama'],
    search: '"Meta AI" OR "Meta Llama" OR "Meta Superintelligence"',
  },
  {
    id: 'grok',
    name: 'Grok',
    maker: 'xAI',
    topic: 'xai',
    sources: [],
    color: '#c4c9d4',
    blurb: "xAI's assistant, built into X and available as an API.",
    links: [
      { label: 'Open Grok', url: 'https://grok.com/' },
      { label: 'xAI news', url: 'https://x.ai/news' },
      { label: 'API docs', url: 'https://docs.x.ai/overview' },
    ],
    hf: [],
    search: '"xAI" OR "Grok"',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    maker: 'Microsoft',
    topic: 'microsoft',
    sources: [],
    color: '#2ea8f5',
    blurb: "Microsoft's assistant across Windows, Office and GitHub, and its AI work on Azure.",
    links: [
      { label: 'Open Copilot', url: 'https://copilot.microsoft.com/' },
      { label: 'Microsoft AI blog', url: 'https://microsoft.ai/blog/' },
    ],
    hf: [],
    search: '"Microsoft Copilot" OR "Microsoft AI"',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    maker: 'DeepSeek',
    topic: 'deepseek',
    sources: [],
    color: '#4d6bfe',
    blurb: 'Chinese lab behind open-weight reasoning and chat models that compete with the frontier at low cost.',
    links: [
      { label: 'Open DeepSeek', url: 'https://chat.deepseek.com/' },
      { label: 'API docs', url: 'https://api-docs.deepseek.com/' },
      { label: 'Models on Hugging Face', url: 'https://huggingface.co/deepseek-ai' },
    ],
    hf: ['deepseek-ai'],
    search: '"DeepSeek"',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    maker: 'Mistral AI',
    topic: 'mistral',
    sources: ['mistral'],
    color: '#ff7000',
    blurb: "Europe's leading AI lab: the Le Chat assistant plus open and commercial models.",
    links: [
      { label: 'Open Le Chat', url: 'https://chat.mistral.ai/' },
      { label: 'Mistral news', url: 'https://mistral.ai/news/' },
      { label: 'API docs', url: 'https://docs.mistral.ai/' },
    ],
    hf: ['mistralai'],
    search: '"Mistral AI"',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    maker: 'Alibaba',
    topic: 'qwen',
    sources: [],
    color: '#7c6cf2',
    blurb: "Alibaba's model family, among the most downloaded open-weight models in the world.",
    links: [
      { label: 'Open Qwen Chat', url: 'https://chat.qwen.ai/' },
      { label: 'Qwen blog', url: 'https://qwenlm.github.io/' },
      { label: 'Models on Hugging Face', url: 'https://huggingface.co/Qwen' },
    ],
    hf: ['Qwen'],
    search: '"Qwen" OR "Alibaba AI"',
  },
];
