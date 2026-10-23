// Actions the map view can take. The same handler serves the in-chat view (through the
// app-only ui_action tool), the browser page (HTTP and WebSocket) and the model tools.
import { randomBytes } from 'node:crypto';
import { ALL_STORES, isRunning, runScout, stopScout } from './pipeline.mjs';
import { getSession, listSessions, newSession, save, setPrefs } from './sessions.mjs';
import { snapshot } from './viewmodel.mjs';
import { exportSession } from './export.mjs';
import { sendTo, webInfo } from './web/server.mjs';
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
  return s;
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

export async function handleAction(action, args = {}, from = 'widget') {
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
    case 'view': {
      const s = getSession(args.session);
      s.view = { ...s.view, ...(args.state || {}) };
      save(s);
      sendTo(s.id, { type: 'view', state: s.view, from });
      return { ok: true };
    }
    case 'question': {
      const s = getSession(args.session);
      const text = String(args.text || '').trim().slice(0, 1000);
      if (!text) throw new Error('Type a question first.');
      const q = { id: `q-${randomBytes(3).toString('hex')}`, text, context: args.context || null, from, at: new Date().toISOString(), answer: null, delivered: from === 'widget' };
      s.questions.push(q);
      save(s, { now: true });
      // A question asked in the browser reaches Claude through the view open in the chat.
      const routed = from === 'browser' ? sendTo(s.id, { type: 'ask', question: q }, 'widget') : 0;
      publish({ session: s.id, kind: 'question' });
      return { question: q, routed };
    }
    case 'delivered': {
      const s = getSession(args.session);
      // First caller wins, so two copies of the view in one chat never send a question twice.
      const q = s.questions.find((x) => x.id === args.id);
      const already = !q || q.delivered;
      if (q) q.delivered = true;
      save(s);
      return { already };
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
