/**
 * Keyword-based topic tags. Cheap and predictable: a story gets a tag when its
 * headline or summary mentions the topic. The page uses these as filter chips.
 *
 * Most patterns are case-insensitive. Short names like "Meta", "Apple" or "Grok"
 * are case-sensitive on purpose — they collide with ordinary words otherwise.
 */

export const TOPICS = [
  // Companies
  { id: 'openai', label: 'OpenAI', kind: 'company', re: /\b(openai|chatgpt|gpt-?\d[\w.-]*|sora|sam altman)\b/i },
  { id: 'anthropic', label: 'Anthropic', kind: 'company', re: /\b(anthropic|claude|dario amodei)\b/i },
  { id: 'google', label: 'Google', kind: 'company', re: /\b(google|deepmind|gemini|gemma|alphabet|veo)\b/i },
  { id: 'meta', label: 'Meta', kind: 'company', re: /\b(Meta|Llama|Zuckerberg)\b/ },
  { id: 'microsoft', label: 'Microsoft', kind: 'company', re: /\b(microsoft|copilot|azure|satya nadella)\b/i },
  { id: 'nvidia', label: 'NVIDIA', kind: 'company', re: /\b(nvidia|jensen huang|cuda)\b/i },
  { id: 'apple', label: 'Apple', kind: 'company', re: /\b(Apple|Siri|iPhone)\b/ },
  { id: 'xai', label: 'xAI', kind: 'company', re: /\b(xAI|Grok|Musk)\b/ },
  { id: 'mistral', label: 'Mistral', kind: 'company', re: /\bmistral\b/i },
  { id: 'deepseek', label: 'DeepSeek', kind: 'company', re: /\bdeepseek\b/i },
  { id: 'qwen', label: 'Alibaba / Qwen', kind: 'company', re: /\b(qwen|alibaba)\b/i },

  // Themes
  { id: 'agents', label: 'Agents', kind: 'theme', re: /\b(agents?|agentic)\b/i },
  { id: 'coding', label: 'Coding', kind: 'theme', re: /\b(coding|codex|developers?|programming|software engineer\w*)\b/i },
  { id: 'open-source', label: 'Open models', kind: 'theme', re: /\b(open[- ](source|weights?)|hugging ?face|open models?)\b/i },
  { id: 'research', label: 'Research', kind: 'theme', re: /\b(research(ers)?|paper|benchmarks?|arxiv|study)\b/i },
  { id: 'safety', label: 'Safety', kind: 'theme', re: /\b(safety|alignment|safeguards?|misuse|jailbreak\w*|red[- ]team\w*)\b/i },
  { id: 'policy', label: 'Policy & law', kind: 'theme', re: /\b(regulat\w+|legislat\w+|lawsuits?|court|congress|senate|eu ai act|copyright|government|white house|policy)\b/i },
  { id: 'chips', label: 'Chips & compute', kind: 'theme', re: /\b(chips?|gpus?|semiconductors?|data ?cent(er|re)s?|compute|tsmc|supercomputer)\b/i },
  { id: 'robotics', label: 'Robotics', kind: 'theme', re: /\b(robot\w*|humanoids?|self-driving|autonomous vehicles?|waymo)\b/i },
  { id: 'media', label: 'Image & video', kind: 'theme', re: /\b(image generat\w+|video generat\w+|text-to-(image|video)|midjourney|diffusion|sora|veo|deepfakes?)\b/i },
  { id: 'business', label: 'Money & deals', kind: 'theme', re: /\b(funding|raises?|raised|valuation|acquires?|acquired|acquisition|ipo|investors?|revenue)\b/i },
];

/**
 * Is this story about AI at all? Used for general news and tech feeds
 * (sources with `aiOnly`), which also cover elections, phones and earnings.
 * "AI" is matched case-sensitively so words like "Ai Weiwei" or "said" don't count.
 */
const AI_ACRONYM = /\bA\.?I\b/;
const AI_TERMS = /artificial intelligence|machine learning|deep learning|neural net|\bLLMs?\b|chatbots?|generative|\bagentic\b|\bGPT-?\d|OpenAI|ChatGPT|Anthropic|\bClaude\b|\bGemini\b|DeepMind|Copilot|\bNvidia\b|\bGrok\b|\bxAI\b|\bLlama\b|Mistral|DeepSeek|\bQwen\b|superintelligence|data cent(er|re)s?/i;

export function isAboutAI(text) {
  return AI_ACRONYM.test(text) || AI_TERMS.test(text);
}

export function tagTopics(text) {
  return TOPICS.filter((t) => t.re.test(text)).map((t) => t.id);
}
