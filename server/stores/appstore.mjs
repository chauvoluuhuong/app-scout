// Apple App Store: the official iTunes Search/Lookup API, RSS charts, the public listing page
// (for in-app purchase prices) and the customer-reviews RSS feed.
import { getJson, getText } from '../lib/http.mjs';
import { nowIso, pageText, unescapeHtml } from '../lib/util.mjs';

export const GENRES = {
  business: 6000, weather: 6001, utilities: 6002, travel: 6003, sports: 6004, social: 6005,
  reference: 6006, productivity: 6007, photo: 6008, news: 6009, navigation: 6010, music: 6011,
  lifestyle: 6012, health: 6013, games: 6014, finance: 6015, entertainment: 6016, education: 6017,
  books: 6018, medical: 6020, food: 6023, shopping: 6024, developer: 6026, graphics: 6027,
};
const CHARTS = { topfree: 'topfreeapplications', topgrossing: 'topgrossingapplications', toppaid: 'toppaidapplications' };

function toRow(d) {
  const url = (d.trackViewUrl || '').split('?')[0];
  return {
    store: 'appstore',
    storeId: String(d.trackId),
    name: unescapeHtml(d.trackName || '').trim(),
    developer: d.sellerName || d.artistName || null,
    url,
    summary: (d.description || '').slice(0, 300),
    category: d.primaryGenreName || null,
    rating: d.averageUserRating ?? null,
    ratingsCount: d.userRatingCount ?? null,
    users: d.userRatingCount ?? null,
    usersLabel: d.userRatingCount != null ? `${d.userRatingCount.toLocaleString('en-US')} ratings` : null,
    usersKind: 'ratings',
    price: d.price ?? null,
    priceLabel: d.formattedPrice || (d.price ? `$${d.price}` : 'Free'),
    released: (d.releaseDate || '').slice(0, 10) || null,
    updated: (d.currentVersionReleaseDate || '').slice(0, 10) || null,
    website: d.sellerUrl || null,
    source: 'App Store (iTunes API)',
    sourceUrl: url,
    conf: 'H',
    fetchedAt: nowIso(),
  };
}

async function lookup(ids, country) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const res = await getJson('https://itunes.apple.com/lookup', { params: { id: ids.slice(i, i + 150).join(','), country } });
    for (const d of res.results || []) out.set(String(d.trackId), d);
  }
  return out;
}

/** Chart (topfree | topgrossing | toppaid), optionally for one genre. Returns ranked rows. */
export async function chart(name, { genre, country = 'us', limit = 100 } = {}) {
  const g = genre ? GENRES[String(genre).toLowerCase()] ?? genre : null;
  let url = `https://itunes.apple.com/${country}/rss/${CHARTS[name]}/limit=${Math.min(limit, 200)}`;
  if (g) url += `/genre=${g}`;
  const feed = (await getJson(url + '/json')).feed || {};
  const ids = (feed.entry || []).map((e) => e.id.attributes['im:id']);
  const byId = await lookup(ids, country);
  return ids.filter((id) => byId.has(id)).map((id, i) => ({
    ...toRow(byId.get(id)), rank: i + 1, chart: `${name}${genre ? ' ' + genre : ''}`, source: `App Store ${name} chart`,
  }));
}

/** Only the ranked ids of a chart, without lookups: cheap, for marking "in top grossing". */
export async function chartIds(name, { genre, country = 'us', limit = 200 } = {}) {
  const g = genre ? GENRES[String(genre).toLowerCase()] ?? genre : null;
  let url = `https://itunes.apple.com/${country}/rss/${CHARTS[name]}/limit=${Math.min(limit, 200)}`;
  if (g) url += `/genre=${g}`;
  const feed = (await getJson(url + '/json')).feed || {};
  return (feed.entry || []).map((e) => e.id.attributes['im:id']);
}

export async function search(term, { country = 'us', limit = 30 } = {}) {
  const res = await getJson('https://itunes.apple.com/search', { params: { term, entity: 'software', country, limit: Math.min(limit, 200) } });
  return (res.results || []).map((d, i) => ({ ...toRow(d), rank: i + 1, query: term }));
}

/** In-app purchases listed on the public page: [{ name, price }]. */
export async function inAppPurchases(url) {
  const t = pageText(await getText(url));
  const i = t.indexOf('In-App Purchases');
  if (i < 0) return [];
  const items = [];
  let j = i + 1;
  if (t[j] === 'Yes' || t[j] === 'No') j++;
  while (j + 1 < t.length && !['Learn More', 'Copyright'].includes(t[j]) && items.length < 15) {
    const name = t[j], price = t[j + 1];
    if (/\d/.test(price) && price.length < 20) {
      if (!items.some((x) => x.name === name && x.price === price)) items.push({ name, price });
      j += 2;
    } else break;
  }
  return items;
}

/** Most recent customer reviews from Apple's RSS feed: { count, low: [{ stars, title, text }] }. */
export async function reviews(id, { country = 'us' } = {}) {
  const res = await getJson(`https://itunes.apple.com/${country}/rss/customerreviews/id=${id}/sortBy=mostRecent/json`);
  const entries = (res.feed?.entry || []).filter((e) => e['im:rating']);
  const low = entries
    .filter((e) => Number(e['im:rating'].label) <= 2)
    .slice(0, 5)
    .map((e) => ({ stars: Number(e['im:rating'].label), title: e.title?.label || '', text: (e.content?.label || '').slice(0, 280) }));
  return { count: entries.length, low };
}
