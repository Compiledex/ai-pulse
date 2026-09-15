/**
 * Well-known people in AI news, and their portraits from Wikipedia.
 *
 * When a story has no picture of its own but is about one of these people,
 * the page shows their portrait — the real, unaltered photo, freely licensed,
 * with credit — framed over the story's illustration. We never generate or
 * edit faces: a made-up image of a real person on a news site reads as a
 * real photo of something that didn't happen.
 *
 *   match  tested against the headline first, then the teaser. Surnames are
 *          enough where they're unambiguous in AI news; otherwise the full name.
 *   wiki   English Wikipedia article; its lead image is the portrait.
 *   org    the AI (id in focus.mjs) they're known for. When there's no free
 *          portrait — or the story is really about the company — the page
 *          shows that AI's logo instead.
 */

const USER_AGENT = 'AI-Pulse/1.0 (https://github.com/Compiledex/ai-pulse; portraits for a news page)';

export const PEOPLE = [
  // Politics
  { id: 'donald-trump', name: 'Donald Trump', wiki: 'Donald_Trump', match: /\bTrump\b/ },
  { id: 'barack-obama', name: 'Barack Obama', wiki: 'Barack_Obama', match: /\bObama\b/ },
  { id: 'joe-biden', name: 'Joe Biden', wiki: 'Joe_Biden', match: /\bBiden\b/ },
  { id: 'jd-vance', name: 'JD Vance', wiki: 'JD_Vance', match: /\bVance\b/ },
  { id: 'kamala-harris', name: 'Kamala Harris', wiki: 'Kamala_Harris', match: /\bKamala Harris\b|\bHarris backs\b|\bHarris says\b/ },
  { id: 'bernie-sanders', name: 'Bernie Sanders', wiki: 'Bernie_Sanders', match: /\bSanders\b/ },
  { id: 'steve-bannon', name: 'Steve Bannon', wiki: 'Steve_Bannon', match: /\bBannon\b/ },
  { id: 'chuck-schumer', name: 'Chuck Schumer', wiki: 'Chuck_Schumer', match: /\bSchumer\b/ },
  { id: 'ted-cruz', name: 'Ted Cruz', wiki: 'Ted_Cruz', match: /\bTed Cruz\b|\bSen\. Cruz\b/ },
  { id: 'josh-hawley', name: 'Josh Hawley', wiki: 'Josh_Hawley', match: /\bHawley\b/ },
  { id: 'john-thune', name: 'John Thune', wiki: 'John_Thune', match: /\bThune\b/ },
  { id: 'gavin-newsom', name: 'Gavin Newsom', wiki: 'Gavin_Newsom', match: /\bNewsom\b/ },
  { id: 'keir-starmer', name: 'Keir Starmer', wiki: 'Keir_Starmer', match: /\bStarmer\b/ },
  { id: 'emmanuel-macron', name: 'Emmanuel Macron', wiki: 'Emmanuel_Macron', match: /\bMacron\b/ },
  { id: 'ursula-von-der-leyen', name: 'Ursula von der Leyen', wiki: 'Ursula_von_der_Leyen', match: /\bvon der Leyen\b/i },
  { id: 'xi-jinping', name: 'Xi Jinping', wiki: 'Xi_Jinping', match: /\bXi Jinping\b|\bXi\b/ },
  { id: 'david-sacks', name: 'David Sacks', wiki: 'David_O._Sacks', match: /\bSacks\b/ },

  // AI and tech
  { id: 'jack-clark', name: 'Jack Clark', wiki: 'Jack_Clark_(AI_policy_expert)', match: /\bJack Clark\b/, org: 'claude' },
  { id: 'liang-wenfeng', name: 'Liang Wenfeng', wiki: 'Liang_Wenfeng', match: /\bLiang Wenfeng\b/, org: 'deepseek' },
  { id: 'daniela-amodei', name: 'Daniela Amodei', wiki: 'Daniela_Amodei', match: /\bDaniela Amodei\b/, org: 'claude' },
  { id: 'dario-amodei', name: 'Dario Amodei', wiki: 'Dario_Amodei', match: /\bDario\b|(?<!Daniela )\bAmodei\b/, org: 'claude' },
  { id: 'sam-altman', name: 'Sam Altman', wiki: 'Sam_Altman', match: /\bAltman\b/, org: 'chatgpt' },
  { id: 'elon-musk', name: 'Elon Musk', wiki: 'Elon_Musk', match: /\bMusk\b/, org: 'grok' },
  { id: 'jensen-huang', name: 'Jensen Huang', wiki: 'Jensen_Huang', match: /\bJensen\b/ },
  { id: 'demis-hassabis', name: 'Demis Hassabis', wiki: 'Demis_Hassabis', match: /\bHassabis\b/, org: 'gemini' },
  { id: 'sundar-pichai', name: 'Sundar Pichai', wiki: 'Sundar_Pichai', match: /\bPichai\b/, org: 'gemini' },
  { id: 'satya-nadella', name: 'Satya Nadella', wiki: 'Satya_Nadella', match: /\bNadella\b/, org: 'copilot' },
  { id: 'mustafa-suleyman', name: 'Mustafa Suleyman', wiki: 'Mustafa_Suleyman', match: /\bSuleyman\b/, org: 'copilot' },
  { id: 'mark-zuckerberg', name: 'Mark Zuckerberg', wiki: 'Mark_Zuckerberg', match: /\bZuckerberg\b/, org: 'meta' },
  { id: 'tim-cook', name: 'Tim Cook', wiki: 'Tim_Cook', match: /\bTim Cook\b/ },
  { id: 'jeff-bezos', name: 'Jeff Bezos', wiki: 'Jeff_Bezos', match: /\bBezos\b/ },
  { id: 'andy-jassy', name: 'Andy Jassy', wiki: 'Andy_Jassy', match: /\bJassy\b/ },
  { id: 'lisa-su', name: 'Lisa Su', wiki: 'Lisa_Su', match: /\bLisa Su\b/ },
  { id: 'masayoshi-son', name: 'Masayoshi Son', wiki: 'Masayoshi_Son', match: /\bMasayoshi Son\b/ },
  { id: 'larry-ellison', name: 'Larry Ellison', wiki: 'Larry_Ellison', match: /\bEllison\b/ },
  { id: 'arthur-mensch', name: 'Arthur Mensch', wiki: 'Arthur_Mensch', match: /\bMensch\b/, org: 'mistral' },
  { id: 'ilya-sutskever', name: 'Ilya Sutskever', wiki: 'Ilya_Sutskever', match: /\bSutskever\b/ },
  { id: 'mira-murati', name: 'Mira Murati', wiki: 'Mira_Murati', match: /\bMurati\b/ },
  { id: 'greg-brockman', name: 'Greg Brockman', wiki: 'Greg_Brockman', match: /\bBrockman\b/, org: 'chatgpt' },
  { id: 'geoffrey-hinton', name: 'Geoffrey Hinton', wiki: 'Geoffrey_Hinton', match: /\bHinton\b/ },
  { id: 'yann-lecun', name: 'Yann LeCun', wiki: 'Yann_LeCun', match: /\bLeCun\b/ },
  { id: 'yoshua-bengio', name: 'Yoshua Bengio', wiki: 'Yoshua_Bengio', match: /\bBengio\b/ },
  { id: 'fei-fei-li', name: 'Fei-Fei Li', wiki: 'Fei-Fei_Li', match: /\bFei-Fei Li\b/ },
  { id: 'andrej-karpathy', name: 'Andrej Karpathy', wiki: 'Andrej_Karpathy', match: /\bKarpathy\b/ },
  { id: 'marc-andreessen', name: 'Marc Andreessen', wiki: 'Marc_Andreessen', match: /\bMarc Andreessen\b/ },
  { id: 'peter-thiel', name: 'Peter Thiel', wiki: 'Peter_Thiel', match: /\bThiel\b/ },
  { id: 'alexandr-wang', name: 'Alexandr Wang', wiki: 'Alexandr_Wang', match: /\bAlexandr Wang\b/, org: 'meta' },
  { id: 'michael-burry', name: 'Michael Burry', wiki: 'Michael_Burry', match: /\bBurry\b/ },
  { id: 'reid-hoffman', name: 'Reid Hoffman', wiki: 'Reid_Hoffman', match: /\bReid Hoffman\b/ },
  { id: 'aravind-srinivas', name: 'Aravind Srinivas', wiki: 'Aravind_Srinivas', match: /\bAravind Srinivas\b/ },
  { id: 'brad-smith', name: 'Brad Smith', wiki: 'Brad_Smith_(American_lawyer)', match: /\bBrad Smith\b/, org: 'copilot' },
  { id: 'hock-tan', name: 'Hock Tan', wiki: 'Hock_Tan', match: /\bHock Tan\b/ },
];

export const personById = (id) => PEOPLE.find((p) => p.id === id) ?? null;

/** Where the first known person is mentioned in `text`: { id, index } or null. */
export function firstPerson(text) {
  let best = null;
  for (const person of PEOPLE) {
    const m = person.match.exec(text ?? '');
    if (m && (best === null || m.index < best.index)) best = { id: person.id, index: m.index };
  }
  return best;
}

/** The first-mentioned known person in the headline, else in the teaser. */
export function findPerson(title, summary = '') {
  return firstPerson(title)?.id ?? firstPerson(summary)?.id ?? null;
}

/** Every known person's name, for scrubbing them out of image-generation prompts. */
export const PERSON_PATTERNS = PEOPLE.map((p) => new RegExp(`${p.match.source}|\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'));

const FREE_LICENSE = /^(CC0|CC BY(-SA)? \d|Public domain|PD\b)/i;
const stripHtml = (s) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Portraits for the given people ids: { id: { name, image, credit, page } }.
 * Only freely licensed Commons images whose Wikipedia article really is the
 * person (redirects to a company page are rejected) are returned.
 */
export async function fetchPortraits(ids) {
  const people = PEOPLE.filter((p) => ids.includes(p.id));
  if (!people.length) return {};

  const q = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: '640',
    titles: people.map((p) => p.wiki).join('|'),
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const pages = (await res.json()).query?.pages ?? [];

  const byTitle = new Map(pages.map((p) => [p.title, p]));
  const candidates = people
    .map((person) => ({ person, page: byTitle.get(person.name) ?? byTitle.get(person.wiki.replace(/_/g, ' ')) }))
    .filter(({ page }) => page?.thumbnail && page.pageimage);
  if (!candidates.length) return {};

  const q2 = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    prop: 'imageinfo', iiprop: 'extmetadata|url',
    titles: candidates.map(({ page }) => `File:${page.pageimage}`).join('|'),
  });
  const res2 = await fetch(`https://commons.wikimedia.org/w/api.php?${q2}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res2.ok) throw new Error(`Commons HTTP ${res2.status}`);
  const files = new Map(((await res2.json()).query?.pages ?? []).map((f) => [f.title.replace(/ /g, '_'), f]));

  const portraits = {};
  for (const { person, page } of candidates) {
    const file = files.get(`File:${page.pageimage}`.replace(/ /g, '_'));
    const meta = file?.imageinfo?.[0]?.extmetadata;
    const license = stripHtml(meta?.LicenseShortName?.value);
    if (!FREE_LICENSE.test(license)) continue; // non-free or not on Commons
    const artist = stripHtml(meta?.Artist?.value).slice(0, 60);
    portraits[person.id] = {
      name: person.name,
      image: page.thumbnail.source,
      credit: `${artist ? `${artist} · ` : ''}${license}`,
      page: file.imageinfo[0].descriptionurl,
    };
  }
  return portraits;
}

/**
 * What to put over a picture-less story's illustration:
 *   { person: id } — their portrait, or
 *   { logo: focusId } — the AI they're known for, when there's no free
 *     portrait or the headline names the company before the person.
 * `companies` are [{ id, re }] for the AIs in focus.mjs; `portraits` maps
 * person id -> portrait (or a record without `image` when none was found).
 */
export function pickOverlay(item, portraits, companies) {
  const hit = firstPerson(item.title) ?? firstPerson(item.summary);
  if (!hit) return {};
  const person = personById(hit.id);
  const inTitle = person.match.test(item.title);
  const companyIndex = Math.min(...companies
    .map((c) => c.re.exec(item.title)?.index ?? Infinity));
  const companyFirst = inTitle && companyIndex < hit.index;

  if (portraits[hit.id]?.image && !companyFirst) return { person: hit.id };
  return person.org ? { logo: person.org } : {};
}
