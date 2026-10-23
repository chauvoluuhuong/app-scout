// Google Play: no public API, so we read the public search, category and listing pages.
// Listing numbers come from the page's schema.org JSON-LD block and its "Downloads" label.
import { getText } from '../lib/http.mjs';
import { nowIso, parseCount, uniq, unescapeHtml } from '../lib/util.mjs';

const BASE = 'https://play.google.com/store';

const idsIn = (raw) => uniq([...raw.matchAll(/details\?id=([A-Za-z0-9._]+)/g)].map((m) => m[1]));

export async function search(q, { lang = 'en', country = 'us' } = {}) {
  return idsIn(await getText(`${BASE}/search`, { params: { q, c: 'apps', hl: lang, gl: country } }));
}

export async function category(cat, { lang = 'en', country = 'us' } = {}) {
  return idsIn(await getText(`${BASE}/apps/category/${cat.toUpperCase()}`, { params: { hl: lang, gl: country } }));
}

export async function details(id, { lang = 'en', country = 'us' } = {}) {
  const url = `${BASE}/apps/details?id=${encodeURIComponent(id)}`;
  const raw = await getText(url, { params: { hl: lang, gl: country } });
  const m = raw.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  let ld = {};
  try {
    ld = m ? JSON.parse(m[1]) : {};
  } catch {
    ld = {};
  }
  const dl = raw.match(/>([\d.,]+[KMB]?\+?)<\/div><div[^>]*>Downloads/);
  const installsLabel = dl ? dl[1] : null;
  const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
  const price = offer && offer.price != null ? Number(offer.price) : null;
  const iap = /In-app purchases/i.test(raw);
  const ads = /Contains ads/i.test(raw);
  return {
    store: 'play',
    storeId: id,
    name: unescapeHtml(ld.name || '').trim() || id,
    developer: ld.author?.name || null,
    url,
    summary: unescapeHtml(ld.description || '').slice(0, 300),
    category: ld.applicationCategory || null,
    rating: ld.aggregateRating?.ratingValue != null ? Number(ld.aggregateRating.ratingValue) : null,
    ratingsCount: ld.aggregateRating?.ratingCount != null ? Number(ld.aggregateRating.ratingCount) : null,
    users: parseCount(installsLabel),
    usersLabel: installsLabel ? `${installsLabel} installs` : null,
    usersKind: 'installs',
    price,
    priceLabel: price ? `$${price}` : 'Free',
    iap,
    ads,
    source: 'Google Play listing',
    sourceUrl: url,
    conf: 'H',
    fetchedAt: nowIso(),
  };
}
