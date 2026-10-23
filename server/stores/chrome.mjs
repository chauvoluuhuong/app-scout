// Chrome Web Store: public search, category and listing pages (English labels).
import { getText } from '../lib/http.mjs';
import { afterLine, nowIso, pageText, parseCount, uniq, unescapeHtml } from '../lib/util.mjs';

const CWS = 'https://chromewebstore.google.com';
const refsIn = (raw) => uniq([...raw.matchAll(/\.\/detail\/([a-z0-9-]+\/[a-p]{32})/g)].map((m) => m[1]));

export async function search(q) {
  return refsIn(await getText(`${CWS}/search/${encodeURIComponent(q)}`, { params: { hl: 'en' } }));
}

export async function category(cat) {
  return refsIn(await getText(`${CWS}/category/extensions/${cat}`, { params: { hl: 'en' } }));
}

export async function details(ref) {
  const url = ref.startsWith('http') ? ref : `${CWS}/detail/${ref}`;
  const raw = await getText(url, { params: { hl: 'en' } });
  const t = pageText(raw);
  const title = raw.match(/<meta property="og:title" content="([^"]+)"/);
  const name = unescapeHtml(title ? title[1] : '').replace(' - Chrome Web Store', '').trim();
  const usersLine = t.find((l) => /^[\d,.]+[KM]?\+? users?$/.test(l)) || null;
  const rating = t.find((l) => /^[\d.]+ out of 5$/.test(l));
  const ratings = t.find((l) => /^[\d.,]+[KM]? ratings?$/.test(l));
  const id = (url.match(/\/([a-p]{32})/) || [])[1] || url;
  const dev = afterLine(t, 'Developer');
  const desc = raw.match(/<meta name="description" content="([^"]*)"/);
  return {
    store: 'chrome',
    storeId: id,
    name,
    developer: dev && !['Website', 'Email'].includes(dev) ? dev : null,
    url: url.split('?')[0],
    summary: desc ? unescapeHtml(desc[1]).slice(0, 300) : '',
    category: 'Extension',
    rating: rating ? parseFloat(rating) : null,
    ratingsCount: parseCount(ratings),
    users: parseCount(usersLine),
    usersLabel: usersLine,
    usersKind: 'users',
    price: null,
    priceLabel: 'Free',
    updated: afterLine(t, 'Updated'),
    source: 'Chrome Web Store listing',
    sourceUrl: url.split('?')[0],
    conf: 'H',
    fetchedAt: nowIso(),
  };
}
