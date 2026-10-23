// Google Workspace Marketplace: public search, category and listing pages (English labels).
import { getText } from '../lib/http.mjs';
import { afterLine, nowIso, pageText, parseCount, uniq, unescapeHtml } from '../lib/util.mjs';

const WSM = 'https://workspace.google.com/marketplace';
const refsIn = (raw) => uniq([...raw.matchAll(/marketplace\/app\/([a-z0-9_]+\/\d+)/g)].map((m) => m[1]));

export async function search(q) {
  return refsIn(await getText(`${WSM}/search/${encodeURIComponent(q)}`, { params: { hl: 'en' } }));
}

export async function category(cat) {
  return refsIn(await getText(`${WSM}/category/${cat}`, { params: { hl: 'en' } }));
}

export async function details(ref) {
  const url = ref.startsWith('http') ? ref : `${WSM}/app/${ref}`;
  const raw = await getText(url, { params: { hl: 'en' } });
  const t = pageText(raw);
  const title = raw.match(/<title>([^<]+)<\/title>/);
  const name = unescapeHtml(title ? title[1] : '').split(' - Google Workspace Marketplace')[0].trim();
  let rating = null, reviews = null, installs = null;
  for (let i = 0; i < t.length; i++) {
    const m = t[i].match(/^Average rating: ([\d.]+) stars?$/);
    if (m) {
      rating = parseFloat(m[1]);
      const nums = t.slice(i + 1, i + 6).filter((x) => /^[\d,.]+[KMB]?\+?$/.test(x));
      if (nums[0]) reviews = parseCount(nums[0]);
      if (nums[1]) installs = nums[1];
      break;
    }
  }
  const desc = raw.match(/<meta name="description" content="([^"]*)"/);
  const pricing = afterLine(t, 'Pricing');
  return {
    store: 'workspace',
    storeId: url.replace(/\/$/, '').split('/').pop(),
    name,
    developer: afterLine(t, 'By:'),
    url: url.split('?')[0],
    summary: desc ? unescapeHtml(desc[1]).slice(0, 300) : '',
    category: 'Workspace add-on',
    rating,
    ratingsCount: reviews,
    users: parseCount(installs),
    usersLabel: installs ? `${installs} installs` : null,
    usersKind: 'installs',
    price: null,
    priceLabel: pricing || 'Unknown',
    updated: afterLine(t, 'Listing updated:'),
    source: 'Workspace Marketplace listing',
    sourceUrl: url.split('?')[0],
    conf: 'H',
    fetchedAt: nowIso(),
  };
}
