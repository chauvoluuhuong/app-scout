// The scout: collect listings from each store in parallel (each store is rate limited on its
// own), read prices and reviews for the leaders, then wait for Claude to group the apps.
import * as appstore from './stores/appstore.mjs';
import * as play from './stores/play.mjs';
import * as chrome from './stores/chrome.mjs';
import * as workspace from './stores/workspace.mjs';
import * as github from './stores/github.mjs';
import { onHttpEvent } from './lib/http.mjs';
import { log, queryMatch, slug } from './lib/util.mjs';
import { assignTiers, clusterLayout, estimateRevenue, monthlyPrice, revenueBucket, sameProduct, spiralLayout } from './analysis.mjs';
import { publish } from './bus.mjs';
import { save } from './sessions.mjs';

export const ALL_STORES = ['appstore', 'play', 'chrome', 'workspace', 'github'];
export const STORE_LABEL = { appstore: 'App Store', play: 'Google Play', chrome: 'Chrome Web Store', workspace: 'Workspace', github: 'GitHub' };
const WEIGHT = { appstore: 0.4, play: 0.3, chrome: 0.15, workspace: 0.1, github: 0.05 };
const BROWSE = {
  play: ['PRODUCTIVITY', 'BUSINESS', 'COMMUNICATION', 'TOOLS', 'EDUCATION'],
  chrome: ['productivity/tools', 'productivity/workflow', 'productivity/communication'],
  workspace: ['productivity', 'business-tools', 'communication'],
};
const running = new Map(); // session id -> { cancel: boolean }

// The current session per host, so rate-limit events reach the right progress view.
let current = null;
onHttpEvent((e) => {
  if (!current) return;
  const store = { 'play.google.com': 'play', 'itunes.apple.com': 'appstore', 'apps.apple.com': 'appstore', 'chromewebstore.google.com': 'chrome', 'workspace.google.com': 'workspace', 'api.github.com': 'github' }[e.host];
  const ps = store && current.progress.perStore[store];
  if (!ps) return;
  ps.slowed = e.type === 'slowed' ? Math.round(e.waitMs / 1000) : 0;
  emit(current, 'progress');
});

function emit(s, kind) {
  save(s);
  publish({ session: s.id, kind });
}

function quotas(stores, target) {
  const w = stores.reduce((t, st) => t + WEIGHT[st], 0);
  const q = {};
  let left = target;
  stores.forEach((st, i) => {
    q[st] = i === stores.length - 1 ? left : Math.max(1, Math.round((target * WEIGHT[st]) / w));
    left -= q[st];
  });
  return q;
}

function setStep(s, pct, step) {
  s.progress.pct = Math.max(s.progress.pct, Math.round(pct));
  s.progress.step = step;
}

function addApp(s, row) {
  const key = `${row.store}:${row.storeId}`;
  if (s.apps.some((a) => `${a.store}:${a.storeId}` === key)) return false;
  s.apps.push({ id: `a${s.apps.length + 1}`, ...row });
  const ps = s.progress.perStore[row.store];
  ps.apps++;
  ps.details++;
  spiralLayout(s.apps);
  const collected = s.apps.length / s.target;
  setStep(s, 5 + collected * 55, 'Collecting listings');
  return true;
}

async function collectStore(s, store, quota, phrases, ctl) {
  const ps = s.progress.perStore[store];
  ps.status = 'running';
  emit(s, 'progress');
  const opts = { country: s.market, lang: s.market === 'vn' ? 'vi' : 'en' };
  const take = () => ps.apps < quota && !ctl.cancel;
  try {
    if (store === 'appstore') {
      if (phrases.length) {
        for (const q of phrases) {
          if (!take()) break;
          const rows = await appstore.search(q, { ...opts, limit: Math.min(50, quota) });
          s.progress.searches.done++;
          for (const r of rows) if (take() && queryMatch(q, r) >= 0.34) addApp(s, r);
          emit(s, 'progress');
        }
      } else {
        const [free, gross] = await Promise.all([appstore.chart('topfree', { ...opts, limit: 100 }), appstore.chart('topgrossing', { ...opts, limit: 100 })]);
        for (let i = 0; i < 100 && take(); i++) {
          if (gross[i]) addApp(s, gross[i]);
          if (free[i] && take()) addApp(s, free[i]);
        }
        emit(s, 'progress');
      }
    } else if (store === 'github') {
      const lists = phrases.length ? phrases.map((q) => () => github.search(q, { limit: quota })) : [() => github.rising({ limit: quota })];
      for (const fn of lists) {
        if (!take()) break;
        const rows = await fn();
        if (phrases.length) s.progress.searches.done++;
        for (const r of rows) if (take()) addApp(s, r);
        emit(s, 'progress');
      }
    } else {
      const mod = { play, chrome, workspace }[store];
      const sources = phrases.length ? phrases.map((q) => () => mod.search(q, opts)) : BROWSE[store].map((c) => () => mod.category(c, opts));
      // Read every list first, then take from them in turn, so each search or category
      // gets its share instead of the first one filling the quota.
      const lists = [];
      for (const fn of sources) {
        if (ctl.cancel) break;
        try {
          lists.push(await fn());
        } catch (e) {
          log(store, 'list failed:', e.message);
        }
        if (phrases.length) s.progress.searches.done++;
        emit(s, 'progress');
      }
      const refs = [];
      for (let i = 0; refs.length < quota * 1.5 && lists.some((l) => i < l.length); i++) {
        for (const l of lists) if (l[i] && !refs.includes(l[i])) refs.push(l[i]);
      }
      for (const ref of refs) {
        if (!take()) break;
        try {
          addApp(s, await mod.details(ref, opts));
        } catch (e) {
          log(store, ref, e.message);
        }
        emit(s, 'progress');
      }
    }
    ps.status = 'done';
  } catch (e) {
    ps.status = 'failed';
    ps.error = e.message;
    log(store, 'failed:', e.message);
  }
  ps.slowed = 0;
  emit(s, 'progress');
}

async function enrichAppStore(s, ctl) {
  try {
    const ids = await appstore.chartIds('topgrossing', { country: s.market, limit: 200 });
    for (const a of s.apps) if (a.store === 'appstore') {
      const r = ids.indexOf(a.storeId);
      if (r >= 0) a.topGrossingRank = r + 1;
    }
  } catch (e) {
    log('top grossing ids failed:', e.message);
  }
  const leaders = s.apps.filter((a) => a.store === 'appstore').sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0));
  const priced = leaders.slice(0, 25), reviewed = leaders.slice(0, 15);
  let done = 0;
  const total = priced.length + reviewed.length || 1;
  for (const a of priced) {
    if (ctl.cancel) return;
    try {
      a.iapItems = await appstore.inAppPurchases(a.url);
      s.progress.pricingPages++;
    } catch (e) {
      log('IAP', a.name, e.message);
    }
    setStep(s, 60 + (++done / total) * 32, 'Reading prices and reviews');
    emit(s, 'progress');
  }
  for (const a of reviewed) {
    if (ctl.cancel) return;
    try {
      const r = await appstore.reviews(a.storeId, { country: s.market });
      a.reviewsRead = r.count;
      a.lowReviews = r.low;
      s.progress.reviewsRead += r.count;
      s.progress.perStore.appstore.reviews += r.count;
    } catch (e) {
      log('reviews', a.name, e.message);
    }
    setStep(s, 60 + (++done / total) * 32, 'Reading prices and reviews');
    emit(s, 'progress');
  }
}

/** Fill revenue estimates, user tiers and positions from what has been collected. */
export function analyse(s) {
  const priced = s.apps.filter((a) => a.store === 'appstore').map((a) => ({ a, p: monthlyPrice(a) })).filter((x) => x.p);
  for (const a of s.apps) {
    const twin = a.store === 'appstore' ? null : priced.find((x) => sameProduct(x.a, a));
    Object.assign(a, estimateRevenue(a, twin ? twin.p : null));
    a.revBucket = revenueBucket(a.revenue);
  }
  assignTiers(s.apps);
  if (s.grouping) clusterLayout(s.apps, s.grouping.segments, s.grouping.keywords);
  else spiralLayout(s.apps);
}

/** Group by store category until Claude groups the apps, so the map is never empty. */
function interimName(a) {
  if (a.store === 'github') return 'Open source';
  if (a.store === 'chrome') return 'Chrome extensions';
  if (a.store === 'workspace') return 'Workspace add-ons';
  const c = String(a.category || STORE_LABEL[a.store]).replace(/_/g, ' ').toLowerCase().replace(/&/g, 'and');
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function interimGrouping(s) {
  const segs = new Map();
  for (const a of s.apps) {
    const name = interimName(a);
    if (!segs.has(name)) segs.set(name, { id: `s-${slug(name)}`, name, insight: 'Grouped by store category until Claude groups the apps.' });
    a.seg = segs.get(name).id;
    a.kw = null;
  }
  return { segments: [...segs.values()], keywords: [], openings: [], by: 'store-category', at: new Date().toISOString() };
}

export async function runScout(s) {
  if (running.has(s.id)) return;
  const ctl = { cancel: false };
  running.set(s.id, ctl);
  current = s;
  s.status = 'crawling';
  s.error = null;
  s.apps = [];
  s.grouping = s.grouping?.by === 'claude' ? null : s.grouping;
  s.progress = { pct: 1, step: 'Checking sources', perStore: {}, searches: { done: 0, total: 0 }, pricingPages: 0, reviewsRead: 0 };
  for (const st of s.stores) s.progress.perStore[st] = { status: 'queued', apps: 0, details: 0, reviews: 0, slowed: 0 };
  const phrases = s.plan ? s.plan.segments.flatMap((x) => x.phrases || [x.name]).slice(0, 12) : s.topic ? [s.topic] : [];
  s.progress.searches.total = phrases.length ? phrases.length * s.stores.filter((x) => x !== 'github').length + (s.stores.includes('github') ? phrases.length : 0) : 0;
  emit(s, 'progress');
  try {
    const q = quotas(s.stores, s.target);
    await Promise.all(s.stores.map((st) => collectStore(s, st, q[st], phrases, ctl)));
    if (s.stores.includes('appstore') && !ctl.cancel) await enrichAppStore(s, ctl);
    if (!s.apps.length) throw new Error('No store returned any apps. Check your connection, or try a broader topic.');
    setStep(s, 94, 'Building the map');
    s.grouping = s.grouping || interimGrouping(s);
    analyse(s);
    s.status = ctl.cancel ? 'stopped' : s.grouping.by === 'claude' ? 'ready' : 'grouping';
    s.progress.pct = 100;
    s.progress.step = s.status === 'grouping' ? 'Waiting for Claude to group the apps' : 'Done';
  } catch (e) {
    s.status = 'failed';
    s.error = e.message;
    log('scout failed:', e.message);
  } finally {
    running.delete(s.id);
    if (current === s) current = null;
    save(s, { now: true });
    publish({ session: s.id, kind: 'phase' });
  }
}

export function stopScout(id) {
  const ctl = running.get(id);
  if (ctl) ctl.cancel = true;
  return !!ctl;
}

export const isRunning = (id) => running.has(id);

/** Apply Claude's grouping: segments with keywords, each keyword naming its apps. */
export function applyGrouping(s, g) {
  const segments = [], keywords = [], openings = [];
  const byId = new Map(s.apps.map((a) => [a.id, a]));
  for (const a of s.apps) {
    a.seg = null;
    a.kw = null;
  }
  (g.segments || []).forEach((sg, i) => {
    const seg = { id: `s${i + 1}`, name: sg.name, insight: sg.insight || '' };
    segments.push(seg);
    (sg.keywords || []).forEach((kw, j) => {
      const k = { id: `s${i + 1}k${j + 1}`, seg: seg.id, name: kw.name, insight: kw.insight || '' };
      keywords.push(k);
      for (const id of kw.app_ids || []) {
        const a = byId.get(id);
        if (a) Object.assign(a, { seg: seg.id, kw: k.id });
      }
    });
    for (const id of sg.app_ids || []) {
      const a = byId.get(id);
      if (a && !a.seg) a.seg = seg.id;
    }
  });
  const loose = s.apps.filter((a) => !a.seg);
  if (loose.length) {
    const other = { id: `s${segments.length + 1}`, name: 'Other', insight: 'Apps Claude did not place in a segment.' };
    segments.push(other);
    loose.forEach((a) => (a.seg = other.id));
  }
  for (const n of g.app_notes || []) {
    const a = byId.get(n.app_id);
    if (a && n.complaint) a.complaint = n.complaint;
  }
  s.grouping = { segments, keywords, openings, by: 'claude', at: new Date().toISOString() };
  analyse(s);
  (g.openings || []).forEach((o, i) => {
    const near = (o.app_ids || []).map((id) => byId.get(id)).filter(Boolean);
    const seg = segments.find((x) => x.name === o.segment) || segments[0];
    const x = near.length ? near.reduce((t, a) => t + a.x, 0) / near.length : seg.x;
    const y = near.length ? near.reduce((t, a) => t + a.y, 0) / near.length : seg.y;
    openings.push({ id: `o${i + 1}`, name: o.name, insight: o.insight || '', evidence: o.evidence || [], apps: near.map((a) => a.id), x: x + 10, y: y - 14 });
  });
  if (s.status === 'grouping') {
    s.status = 'ready';
    s.progress.step = 'Done';
  }
  save(s, { now: true });
  publish({ session: s.id, kind: 'phase' });
}
