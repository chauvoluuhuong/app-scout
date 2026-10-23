// GitHub: the public REST API (no token; 10 searches a minute, 60 calls an hour).
import { getJson } from '../lib/http.mjs';
import { nowIso } from '../lib/util.mjs';

function toRow(d, rank, query) {
  return {
    store: 'github',
    storeId: d.full_name,
    name: d.name,
    developer: d.owner?.login || null,
    url: d.html_url,
    summary: (d.description || '').slice(0, 300),
    category: d.language || 'Repository',
    rating: null,
    ratingsCount: null,
    users: d.stargazers_count ?? null,
    usersLabel: d.stargazers_count != null ? `${d.stargazers_count.toLocaleString('en-US')} stars` : null,
    usersKind: 'stars',
    price: null,
    priceLabel: 'Open source',
    released: (d.created_at || '').slice(0, 10) || null,
    updated: (d.pushed_at || '').slice(0, 10) || null,
    website: d.homepage || null,
    license: d.license?.spdx_id || null,
    rank,
    query,
    source: 'GitHub API',
    sourceUrl: d.html_url,
    conf: 'H',
    fetchedAt: nowIso(),
  };
}

const API = { headers: { Accept: 'application/vnd.github+json' } };

export async function search(q, { limit = 10 } = {}) {
  const res = await getJson('https://api.github.com/search/repositories', { ...API, params: { q, sort: 'stars', order: 'desc', per_page: Math.min(limit, 50) } });
  return (res.items || []).map((d, i) => toRow(d, i + 1, q));
}

/** Repositories created in the last `days` days that already gained stars: what builders start on. */
export async function rising({ days = 60, minStars = 300, limit = 10 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return search(`created:>${since} stars:>=${minStars}`, { limit });
}
