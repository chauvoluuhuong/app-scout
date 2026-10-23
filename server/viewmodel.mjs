// What the map view receives: a compact snapshot of one session. Kept small because it
// travels through the host and is stored with the conversation.
import { LENSES, segmentStats } from './analysis.mjs';
import { STORE_LABEL } from './pipeline.mjs';
import { getPrefs } from './sessions.mjs';

const TIER = ['dim', 'medium', 'bright'];

export function snapshot(s, web) {
  const g = s.grouping || { segments: [], keywords: [], openings: [] };
  const total = s.apps.length;
  return {
    view: 'map',
    session: {
      id: s.id, name: s.name, market: s.market, topic: s.topic, target: s.target, stores: s.stores,
      plan: s.plan, status: s.status, error: s.error, created: s.created, updated: s.updated,
      groupedBy: g.by || null,
    },
    progress: s.progress,
    apps: s.apps.map((a) => ({
      id: a.id, n: a.name, s: a.store, dev: a.developer, seg: a.seg, kw: a.kw,
      x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10,
      u: a.users, ul: a.usersLabel, t: a.tier, r: a.revenue, rl: a.revenueLabel, rm: a.revenueMethod, rc: a.revenueConf,
      rb: a.revBucket, pr: a.priceLabel, rt: a.rating, rv: a.reviewsRead || 0, tg: a.topGrossingRank || null,
      c: a.complaint || (a.lowReviews?.[0] ? a.lowReviews[0].title || a.lowReviews[0].text.slice(0, 80) : null),
      url: a.url, cat: a.category,
    })),
    segments: g.segments.map((x) => ({ ...x, stats: segmentStats(x, s.apps, total) })),
    keywords: g.keywords,
    openings: g.openings,
    lensCounts: Object.fromEntries(Object.entries(LENSES).map(([k, f]) => [k, s.apps.filter(f).length])),
    questions: s.questions.slice(-20),
    viewState: s.view,
    storeLabels: STORE_LABEL,
    tiers: TIER,
    prefs: getPrefs(),
    web,
  };
}

/** One short paragraph for the model: counts and what to do next, never the whole table. */
export function summary(s, web) {
  const per = Object.entries(s.progress.perStore).map(([k, v]) => `${STORE_LABEL[k]} ${v.apps}${v.status === 'failed' ? ' (failed)' : ''}`).join(', ');
  const lines = [`Session ${s.id} "${s.name}": ${s.status}, ${s.apps.length} of ${s.target} apps (${per || 'no stores yet'}). ${s.progress.step}.`];
  if (s.status === 'grouping') lines.push('Next: call list_apps, then save_grouping with 4–8 segments, 2–4 keywords each, and openings backed by the data.');
  if (s.status === 'crawling' || s.status === 'queued') lines.push('Next: call scout_status to wait for the crawl.');
  if (s.status === 'failed') lines.push(`Error: ${s.error}`);
  if (s.grouping?.by === 'claude') lines.push(`Segments: ${s.grouping.segments.map((x) => x.name).join(', ')}.`);
  const open = s.questions.filter((q) => !q.answer);
  if (open.length) lines.push(`Unanswered map questions: ${open.map((q) => `${q.id} "${q.text}"`).join('; ')}. Use get_view_state, then answer_question.`);
  if (web) lines.push(`Live map in the browser: ${web.url}`);
  return lines.join('\n');
}
