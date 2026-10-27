// Actions the map page can take, over HTTP or the WebSocket. The model tools reuse some of
// them. Every open page (in Claude's in-app browser or a normal browser tab) calls the same
// handler, so they all read and change one shared state.
import { randomBytes } from 'node:crypto';
import { ALL_STORES, isRunning, runScout, stopScout } from './pipeline.mjs';
import { getSession, listSessions, newSession, save, setPrefs } from './sessions.mjs';
import { snapshot } from './viewmodel.mjs';
import { exportSession } from './export.mjs';
import { broadcast, webInfo } from './web/server.mjs';
import { publish } from './bus.mjs';

export function clampApps(n) {
  const v = Math.round(Number(n) || 100);
  return Math.max(20, Math.min(500, v));
}

export function cleanStores(list) {
  const s = (Array.isArray(list) && list.length ? list : ALL_STORES).filter((x) => ALL_STORES.includes(x));
  return s.length ? s : ALL_STORES;
}

export function startScout({ topic = null, apps = 100, stores, market = 'us', name, plan = null }) {
  const s = newSession({ name, topic: topic || null, stores: cleanStores(stores), market: market === 'vn' ? 'vn' : 'us', apps: clampApps(apps), plan });
  runScout(s); // runs in the background; progress arrives through the bus
  broadcast({ type: 'session', id: s.id, name: s.name }); // every open page follows the new scout
  return s;
}

// Plans from plan_research, kept in memory until a page opens them. Open pages get them pushed.
const plans = new Map();
export function postPlan(plan) {
  const id = `plan-${randomBytes(3).toString('hex')}`;
  plans.set(id, plan);
  if (plans.size > 20) plans.delete(plans.keys().next().value);
  broadcast({ type: 'plan', id });
  return id;
}

/** A plan from Claude, possibly edited by the user, turned into a focused scout. */
export function normalizePlan(p = {}) {
  const segs = (p.segments || []).map((x) => (typeof x === 'string' ? { name: x, phrases: [x] } : { name: String(x.name || '').slice(0, 60), phrases: (x.phrases || [x.name]).map(String).slice(0, 4) })).filter((x) => x.name);
  return {
    idea: String(p.idea || '').slice(0, 500),
    customers: (p.customers || []).map(String).slice(0, 8),
    forms: (p.forms || []).map(String).slice(0, 8),
    segments: segs.slice(0, 8),
    selected: {
      customers: (p.selected?.customers || p.customers || []).map(String),
      forms: (p.selected?.forms || p.forms || []).map(String),
      segments: (p.selected?.segments || segs.map((x) => x.name)).map(String),
    },
    stores: cleanStores(p.stores),
    apps: clampApps(p.apps ?? 100),
  };
}

export async function handleAction(action, args = {}) {
  const web = (id) => webInfo(id);
  switch (action) {
    case 'snapshot': {
      const s = getSession(args.session);
      return snapshot(s, web(s.id));
    }
    case 'start': {
      const s = startScout({ topic: args.topic, apps: args.apps, stores: args.stores, market: args.market, name: args.name });
      return snapshot(s, web(s.id));
    }
    case 'start_plan': {
      const plan = normalizePlan(args.plan);
      const chosen = plan.segments.filter((x) => plan.selected.segments.includes(x.name));
      if (!chosen.length) throw new Error('Pick at least one segment to scout.');
      const s = startScout({ name: plan.idea ? plan.idea.slice(0, 48) : 'Focused scout', apps: plan.apps, stores: plan.stores, market: args.market, plan: { ...plan, segments: chosen } });
      return snapshot(s, web(s.id));
    }
    case 'rescout': {
      const s = getSession(args.session);
      if (isRunning(s.id)) throw new Error('This session is still crawling.');
      s.target = clampApps(args.apps ?? s.target);
      runScout(s);
      return snapshot(s, web(s.id));
    }
    case 'stop': {
      stopScout(args.session);
      return snapshot(getSession(args.session), web(args.session));
    }
    case 'sessions':
      return { sessions: listSessions() };
    case 'plan': {
      const plan = plans.get(args.id);
      if (!plan) throw new Error('That plan is gone. Ask Claude to plan it again.');
      return { view: 'plan', plan, web: web(null) };
    }
    case 'view': {
      // Each page keeps its own camera; the session keeps whatever the user looked at last,
      // which is what get_view_state tells Claude.
      const s = getSession(args.session);
      s.view = { ...s.view, ...(args.state || {}) };
      save(s);
      return { ok: true };
    }
    case 'question': {
      const s = getSession(args.session);
      const text = String(args.text || '').trim().slice(0, 1000);
      if (!text) throw new Error('Type a question first.');
      // Saved with the session: Claude reads it with get_view_state, and scout_status and
      // show_map list it until it is answered. Every open page sees it in its next snapshot.
      const q = { id: `q-${randomBytes(3).toString('hex')}`, text, context: args.context || null, at: new Date().toISOString(), answer: null };
      s.questions.push(q);
      save(s, { now: true });
      publish({ session: s.id, kind: 'question' });
      return { question: q };
    }
    case 'export': {
      const s = getSession(args.session);
      return exportSession(s, ['json', 'csv', 'md'].includes(args.format) ? args.format : 'json', args.parts);
    }
    case 'prefs':
      return { prefs: setPrefs(args.patch || {}) };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
