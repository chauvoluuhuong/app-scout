// Actions the map page can take, over HTTP or the WebSocket. The model tools reuse some of
// them. Every open page (in Claude's in-app browser or a normal browser tab) calls the same
// handler, so they all read and change one shared state.
import { randomBytes } from 'node:crypto';
import { ALL_STORES, isRunning, runScout, stopScout } from './pipeline.mjs';
import { getSession, listSessions, newSession, save, setPrefs } from './sessions.mjs';
import { snapshot } from './viewmodel.mjs';
import { exportSession } from './export.mjs';
import { broadcast, listening, webInfo } from './web/server.mjs';
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

// Questions asked on a map page wait here until Claude's side collects them: the plugin's
// monitor or a one-shot watcher (server/watch.mjs, which wake Claude), the in-chat dock widget
// (ui/dock.html, which posts it as the user's message when they press Send), or the prompt hook
// (server/hook.mjs, which attaches it to the user's next message). Whoever comes first takes
// it, so Claude gets each question once.
const inbox = []; // { session, id }
export const hasQuestions = () => inbox.length > 0;

function pending({ session, id }) {
  try {
    const s = getSession(session);
    const q = s.questions.find((x) => x.id === id);
    return q && !q.answer ? { s, q } : null;
  } catch {
    return null;
  }
}

function markSent({ s, q }) {
  q.sentAt = new Date().toISOString();
  save(s, { now: true });
  publish({ session: s.id, kind: 'question' }); // pages show "Claude has it"
  return questionText(s, q);
}

/** Every waiting question, as lines for Claude, taken off the queue. */
export function takeQuestions() {
  return inbox.splice(0).map(pending).filter(Boolean).map(markSent);
}

/** The oldest waiting question, left on the queue (the dock shows it until the user sends it). */
export function peekQuestion() {
  while (inbox.length) {
    const p = pending(inbox[0]);
    if (p) return { id: p.q.id, session: p.s.id, question: p.q.text, text: questionText(p.s, p.q) };
    inbox.shift(); // answered or gone meanwhile
  }
  return null;
}

/** Take one question by id, once the dock has posted it. Null if someone else took it first. */
export function takeQuestion(id) {
  const i = inbox.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const p = pending(inbox.splice(i, 1)[0]);
  return p ? markSent(p) : null;
}

// The dock: an MCP Apps widget in Claude Desktop Chat (and other hosts that render them). A new
// one appears with each show_map, scout, plan_research and answer_question result, and the older
// ones stay in the chat history, still running. Only the newest acts; the rest say it moved.
let dockNewest = null, dockSeen = 0, dockSeq = 0, current = null;
export const dockActive = () => Date.now() - dockSeen < 6000;
/** The session the chat last looked at, for the dock's map link. */
export const setCurrent = (id) => { current = id; };

export function dock(op, args = {}) {
  if (op === 'hello') {
    dockNewest = `dock-${++dockSeq}-${randomBytes(2).toString('hex')}`;
    return { id: dockNewest };
  }
  if (op === 'poll') {
    const active = args.id === dockNewest;
    if (active) dockSeen = Date.now();
    const sid = current || listSessions()[0]?.id || null;
    let session = null;
    if (sid) { try { const s = getSession(sid); session = { id: s.id, name: s.name, status: s.status }; } catch {} }
    return { active, prompt: active ? peekQuestion() : null, session, map: sid ? webInfo(sid)?.url || null : null };
  }
  if (op === 'sent') return { taken: !!takeQuestion(args.qid) };
  throw new Error(`Unknown dock op: ${op}`);
}

/** For Claude, and readable when it shows as the user's message: the question, what the user
 *  was looking at on the map, and what to do with it. */
export function questionText(s, q) {
  const c = q.context || {}, f = c.focus || {};
  const where = (f.path && f.path.length ? f.path.join(' › ') : f.name) || s.name;
  const nums = Object.entries(c.metrics || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ');
  const near = (c.nearby || []).map((x) => x.name || x).filter(Boolean).slice(0, 5).join(', ');
  return [
    `[App Scout map question ${q.id} · session ${s.id}] "${q.text}"`,
    `Looking at: ${where}${f.type ? ` (${f.type})` : ''}${nums ? ` · ${nums}` : ''}${near ? ` · nearby: ${near}` : ''}`,
    `Answer here, then call answer_question (session ${s.id}, question_id ${q.id}) so the map shows it. get_view_state has the full map context.`,
  ].join('\n');
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
      // Saved with the session, then queued for Claude (see takeQuestions). get_view_state,
      // scout_status and show_map also list it until it is answered.
      const q = { id: `q-${randomBytes(3).toString('hex')}`, text, context: args.context || null, at: new Date().toISOString(), answer: null, sentAt: null };
      s.questions.push(q);
      save(s, { now: true });
      inbox.push({ session: s.id, id: q.id });
      publish({ session: s.id, kind: 'question', fresh: true });
      return { question: q, listening: listening(), dock: dockActive() };
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
