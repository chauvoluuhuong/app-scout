// Turns crawled listings into what the map draws: revenue estimates, user tiers, segment
// stats, positions. Every estimate keeps its method so the view can say how it was made.
import { human, seeded } from './lib/util.mjs';

// ---------------------------------------------------------------- revenue estimate
// Same method as the app-market-research skill's estimate.py:
//   user base = installs/users, or App Store ratings x 50..100 (about 1-2% of downloaders rate)
//   MRR       = user base x 30% active x 1..4% paid x lowest monthly price
const ACTIVE = 0.3, CONV = [0.01, 0.04];

function parsePrice(s) {
  const m = String(s || '').match(/[$€£]\s?(\d[\d,]*(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

/** Lowest plausible monthly price from in-app purchases (weekly x4.3, yearly /12). */
export function monthlyPrice(app) {
  const found = [];
  for (const it of app.iapItems || []) {
    let p = parsePrice(it.price);
    if (p == null) continue;
    const n = (it.name || '').toLowerCase();
    if (/week/.test(n)) p *= 4.3;
    else if (/year|annual/.test(n)) p /= 12;
    else if (/lifetime|credit|coin|token/.test(n)) continue;
    if (p >= 1) found.push(p);
  }
  return found.length ? Math.round(Math.min(...found) * 100) / 100 : null;
}

function userBase(app) {
  if (app.store === 'appstore' && app.ratingsCount) return [app.ratingsCount * 50, app.ratingsCount * 100, `${human(app.ratingsCount)} ratings x 50..100`];
  if (['play', 'chrome', 'workspace'].includes(app.store) && app.users) return [app.users, app.users, `${human(app.users)} ${app.usersKind}`];
  return null;
}

// Spotting the same product in two stores. Listing names differ in small ways ("Otter Transcribe
// Voice Notes" on iOS, "OtterAI Transcribe Voice Notes" on Play), so compare the brand word
// (the first word, with a trailing "ai" or "app" removed) and require the rest to overlap.
const FILLER = new Set(['ai', 'app', 'apps', 'the', 'for', 'and', 'with', 'by', 'a', 'an', 'of', 'to', 'your', 'free', 'pro', 'new', 'app.']);
function nameTokens(name) {
  const words = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const brand = (words[0] || '').replace(/(ai|app)$/, '') || words[0] || '';
  return { brand, rest: new Set(words.slice(1).filter((w) => !FILLER.has(w))) };
}

export function sameProduct(a, b) {
  const x = nameTokens(a.name), y = nameTokens(b.name);
  if (!x.brand || x.brand !== y.brand || x.brand.length < 3) return false;
  if (!x.rest.size || !y.rest.size) return true; // one-word names: the brand is the product
  const shared = [...x.rest].filter((w) => y.rest.has(w)).length;
  const devA = String(a.developer || '').toLowerCase().split(/\W+/)[0];
  const devB = String(b.developer || '').toLowerCase().split(/\W+/)[0];
  return shared / Math.min(x.rest.size, y.rest.size) >= 0.5 || (devA.length > 2 && devA === devB);
}

/**
 * `borrowed` is an App Store monthly price for the same product, used when this store
 * doesn't publish one (Play, Chrome, Workspace). The method says so, and confidence drops to L.
 */
export function estimateRevenue(app, borrowed = null) {
  const base = userBase(app);
  const own = monthlyPrice(app);
  const price = own ?? borrowed;
  if (!base || !price) return { revenue: null, revenueLow: null, revenueHigh: null, revenueLabel: 'Unknown', revenueMethod: !base ? 'no user count' : 'no monthly price found', revenueConf: null };
  const lo = base[0] * ACTIVE * CONV[0] * price;
  const hi = base[1] * ACTIVE * CONV[1] * price;
  return {
    revenue: Math.round(Math.sqrt(lo * hi)),
    revenueLow: Math.round(lo),
    revenueHigh: Math.round(hi),
    revenueLabel: `est. $${human(lo)}–$${human(hi)}/mo`,
    revenueMethod: `${base[2]} x 30% active x 1–4% paid x $${price}/mo${own == null ? ' (price from its App Store listing)' : ''}`,
    revenueConf: app.store === 'appstore' || own == null ? 'L' : 'M',
  };
}

export const revenueBucket = (r) => (r == null ? null : r < 1e4 ? 0 : r < 1e6 ? 1 : 2);

/** Rank apps within their own store by users: 2 = top third, 1 = middle, 0 = bottom. */
export function assignTiers(apps) {
  const byStore = {};
  for (const a of apps) (byStore[a.store] ||= []).push(a);
  for (const list of Object.values(byStore)) {
    const ranked = list.filter((a) => a.users > 0).sort((a, b) => b.users - a.users);
    ranked.forEach((a, i) => (a.tier = i < ranked.length / 3 ? 2 : i < (ranked.length * 2) / 3 ? 1 : 0));
    list.forEach((a) => (a.tier ??= 0));
  }
}

// ---------------------------------------------------------------- lenses and segment stats
export const LENSES = {
  leaders: (a) => a.revBucket === 2 && a.tier === 2,
  gaps: (a) => a.tier === 2 && a.revBucket === 0,
  premium: (a) => a.revBucket >= 1 && a.tier === 0,
  unknown: (a) => a.revenue == null,
};

export function segmentStats(seg, apps, total) {
  const list = apps.filter((a) => a.seg === seg.id);
  const known = list.filter((a) => a.revenue != null);
  const sum = known.reduce((t, a) => t + a.revenue, 0);
  const top3 = [...known].sort((a, b) => b.revenue - a.revenue).slice(0, 3).reduce((t, a) => t + a.revenue, 0);
  const plats = {};
  for (const a of list) plats[a.store] = (plats[a.store] || 0) + 1;
  return {
    apps: list.length,
    revenueKnown: known.length,
    revenueSum: sum,
    crowded: list.length >= Math.max(12, total * 0.18) && sum > 0 && top3 / sum >= 0.7,
    moneyGaps: list.filter(LENSES.gaps).length,
    inTopGrossing: list.filter((a) => a.topGrossingRank).length,
    platforms: plats,
  };
}

// ---------------------------------------------------------------- layout (world space 1000 x 600)
const CX = 500, CY = 300;

/** Before grouping: a sunflower spiral in arrival order, so dots appear as apps arrive. */
export function spiralLayout(apps) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  apps.forEach((a, i) => {
    const r = 14 * Math.sqrt(i + 1);
    a.x = CX + Math.cos(i * golden) * r * 1.5;
    a.y = CY + Math.sin(i * golden) * r * 0.9;
  });
}

/**
 * After grouping: each segment is a disc sized by its app count. Discs start on an ellipse and
 * are relaxed so they pack closely without overlapping (leaving room for their labels).
 * Keywords sit on a ring inside their segment; apps scatter around their keyword.
 */
export function clusterLayout(apps, segments, keywords) {
  const S = segments.length;
  const count = (s) => apps.filter((a) => a.seg === s.id).length;
  segments.forEach((s, i) => {
    s.r = 22 + 8 * Math.sqrt(count(s));
    const ang = S === 1 ? 0 : (i / S) * Math.PI * 2 - Math.PI / 2;
    s.x = CX + Math.cos(ang) * (S === 1 ? 0 : 240);
    s.y = CY + Math.sin(ang) * (S === 1 ? 0 : 150);
  });
  const GAP = 34; // room for the segment's name above its disc
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < S; i++) for (let j = i + 1; j < S; j++) {
      const a = segments[i], b = segments[j];
      let dx = b.x - a.x, dy = (b.y - a.y) * 1.25;
      const d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + GAP;
      if (d < min) {
        const push = (min - d) / 2;
        dx /= d;
        dy /= d;
        a.x -= dx * push; a.y -= (dy * push) / 1.25;
        b.x += dx * push; b.y += (dy * push) / 1.25;
      }
    }
    // Pull together first, then only push apart, so the final layout never overlaps.
    if (it < 200) for (const s of segments) {
      s.x += (CX - s.x) * 0.015;
      s.y += (CY - s.y) * 0.015;
    }
  }
  for (const s of segments) {
    const kws = keywords.filter((k) => k.seg === s.id);
    const turn = seeded(s.id)() * Math.PI;
    kws.forEach((k, j) => {
      const ang = (j / Math.max(kws.length, 1)) * Math.PI * 2 + turn;
      const r = kws.length === 1 ? 0 : s.r * 0.5;
      k.x = s.x + Math.cos(ang) * r;
      k.y = s.y + Math.sin(ang) * r * 0.8;
    });
  }
  const kwById = new Map(keywords.map((k) => [k.id, k]));
  const segById = new Map(segments.map((s) => [s.id, s]));
  const counts = {};
  for (const a of apps) counts[a.kw || a.seg] = (counts[a.kw || a.seg] || 0) + 1;
  for (const a of apps) {
    const c = kwById.get(a.kw) || segById.get(a.seg);
    if (!c) continue;
    const rnd = seeded(a.id);
    const spread = 8 + 4.5 * Math.sqrt(counts[a.kw || a.seg] || 1);
    const ang = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
    a.x = c.x + Math.cos(ang) * r * 1.2;
    a.y = c.y + Math.sin(ang) * r;
  }
  for (const s of segments) delete s.r;
}
