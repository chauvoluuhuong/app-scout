// MCP tools. Model tools return a short text summary (for Claude) and, for UI tools, the map
// snapshot in structuredContent (for the view). The view's own buttons use ui_action, which
// is hidden from the model.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleAction, normalizePlan, startScout } from './actions.mjs';
import { applyGrouping, ALL_STORES, isRunning, STORE_LABEL } from './pipeline.mjs';
import { getSession, listSessions, save, EXPORTS } from './sessions.mjs';
import { snapshot, summary } from './viewmodel.mjs';
import { exportSession, PARTS } from './export.mjs';
import { connectOrigins, sendTo, UI_FILE, webInfo } from './web/server.mjs';
import { waitFor, publish } from './bus.mjs';

export const UI_URI = 'ui://app-scout/map.html';
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

const SESSION = { type: 'string', description: 'Session id, as returned by scout or list_sessions.' };
const ui = (visibility = ['model', 'app']) => ({ ui: { resourceUri: UI_URI, visibility } });

const TOOLS = [
  {
    name: 'scout',
    title: 'Scout the app market',
    description:
      'Start a market scout: collect up to `apps` apps (default 100) from the App Store, Google Play, Chrome Web Store, Google Workspace Marketplace and GitHub, and show them on a live map. ' +
      'With no topic it reads the overall charts and categories; with a topic (for example "ai meeting notes") it searches the stores for it. ' +
      'Returns immediately with a session id while the crawl runs. Then call scout_status until the status is "grouping", call list_apps, and call save_grouping.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional category or keyword to search for. Leave out to scout the overall charts.' },
        apps: { type: 'integer', minimum: 20, maximum: 500, default: 100, description: 'How many apps to investigate. Default 100.' },
        stores: { type: 'array', items: { type: 'string', enum: ALL_STORES }, description: 'Stores to read. Default: all five.' },
        market: { type: 'string', enum: ['us', 'vn'], default: 'us', description: 'Store country. us (default) or vn.' },
      },
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
    _meta: ui(),
  },
  {
    name: 'scout_status',
    title: 'Wait for the scout',
    description: 'Wait up to wait_seconds (default 40) for the crawl to move on, then report progress per store and what to do next. Call it repeatedly until the status is "grouping" or "ready".',
    inputSchema: { type: 'object', required: ['session'], properties: { session: SESSION, wait_seconds: { type: 'integer', minimum: 0, maximum: 50, default: 40 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_apps',
    title: 'List collected apps',
    description: 'Compact list of the apps a session collected, one per line: id, store, name, category, users, rating, price, estimated revenue, a short summary and recent 1–2 star review titles. Use it to group the apps (save_grouping) and to answer questions about the market.',
    inputSchema: { type: 'object', required: ['session'], properties: { session: SESSION, offset: { type: 'integer', minimum: 0, default: 0 }, limit: { type: 'integer', minimum: 1, maximum: 250, default: 150 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_grouping',
    title: 'Save segments and openings',
    description:
      'Group the session\'s apps into 4–8 segments (each with 2–4 keywords naming its apps by id), and add openings: gaps the data supports, each tied to the apps that show it. ' +
      'Optionally add app_notes with each leader\'s main complaint from its reviews. The map redraws with these groups.',
    inputSchema: {
      type: 'object',
      required: ['session', 'segments'],
      properties: {
        session: SESSION,
        segments: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'keywords'],
            properties: {
              name: { type: 'string', description: 'Short shared name, such as "Meeting assistant".' },
              insight: { type: 'string', description: 'One sentence on what the data shows for this segment.' },
              keywords: {
                type: 'array',
                items: { type: 'object', required: ['name', 'app_ids'], properties: { name: { type: 'string' }, insight: { type: 'string' }, app_ids: { type: 'array', items: { type: 'string' } } } },
              },
            },
          },
        },
        openings: {
          type: 'array',
          items: { type: 'object', required: ['name', 'insight'], properties: { name: { type: 'string' }, insight: { type: 'string' }, segment: { type: 'string' }, app_ids: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } } } },
        },
        app_notes: { type: 'array', items: { type: 'object', required: ['app_id', 'complaint'], properties: { app_id: { type: 'string' }, complaint: { type: 'string' } } } },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'plan_research',
    title: 'Plan research from an idea',
    description:
      'Turn the user\'s product idea into a research plan they can edit before scouting: candidate customers, product forms, and the segments to scout, each with 1–4 search phrases a buyer would type into a store. ' +
      'Shows the plan in the map view, where the user adjusts it and starts a focused scout.',
    inputSchema: {
      type: 'object',
      required: ['idea', 'segments'],
      properties: {
        idea: { type: 'string' },
        customers: { type: 'array', items: { type: 'string' } },
        forms: { type: 'array', items: { type: 'string' }, description: 'Product forms, such as mobile app, Chrome extension, web app, Workspace add-on.' },
        segments: { type: 'array', items: { type: 'object', required: ['name', 'phrases'], properties: { name: { type: 'string' }, phrases: { type: 'array', items: { type: 'string' } } } } },
        stores: { type: 'array', items: { type: 'string', enum: ALL_STORES } },
        apps: { type: 'integer', minimum: 20, maximum: 500, default: 100 },
      },
    },
    annotations: { readOnlyHint: true },
    _meta: ui(),
  },
  {
    name: 'show_map',
    title: 'Open a saved session',
    description: 'Show the map of a saved research session, where the user left off.',
    inputSchema: { type: 'object', required: ['session'], properties: { session: SESSION } },
    annotations: { readOnlyHint: true },
    _meta: ui(),
  },
  {
    name: 'list_sessions',
    title: 'List research sessions',
    description: 'List saved research sessions, newest first.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_view_state',
    title: 'What the user is looking at',
    description: 'The map\'s current state for a session: what is selected or in focus, the active lens, and questions asked from the map that still need an answer (with the context the map sent).',
    inputSchema: { type: 'object', required: ['session'], properties: { session: SESSION } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'answer_question',
    title: 'Answer a map question',
    description: 'Record your answer to a question asked from the map, so the map (and the browser page) shows it next to the question.',
    inputSchema: { type: 'object', required: ['session', 'question_id', 'answer'], properties: { session: SESSION, question_id: { type: 'string' }, answer: { type: 'string' } } },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'export_session',
    title: 'Export a session',
    description: 'Write a session to a file: json (everything), csv (the apps table) or md (a readable report). Returns the file path.',
    inputSchema: { type: 'object', required: ['session'], properties: { session: SESSION, format: { type: 'string', enum: ['json', 'csv', 'md'], default: 'md' }, parts: { type: 'array', items: { type: 'string', enum: PARTS } } } },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'ui_action',
    title: 'Map view action',
    description: 'Used by the map view for its own buttons.',
    inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string' }, args: { type: 'object' } } },
    _meta: ui(['app']),
  },
];

export const listTools = () => TOOLS;

const text = (t, structured, isError) => ({ content: [{ type: 'text', text: t }], ...(structured ? { structuredContent: structured } : {}), ...(isError ? { isError: true } : {}) });

function appLine(a) {
  const low = (a.lowReviews || []).map((r) => r.title).filter(Boolean).slice(0, 2).join(' / ');
  return [a.id, STORE_LABEL[a.store], a.name, a.category || '', a.usersLabel || '', a.rating != null ? `${Math.round(a.rating * 10) / 10}★` : '', a.priceLabel || '', a.revenueLabel, a.topGrossingRank ? `top grossing #${a.topGrossingRank}` : '', (a.summary || '').replace(/\s+/g, ' ').slice(0, 120), low ? `low reviews: ${low}` : '']
    .filter(Boolean).join(' | ');
}

const HANDLERS = {
  async scout(a) {
    const s = startScout({ topic: a.topic, apps: a.apps, stores: a.stores, market: a.market });
    const w = webInfo(s.id);
    return text(`Started scout ${s.id} for ${a.topic ? `"${a.topic}"` : 'the overall charts'}: up to ${s.target} apps from ${s.stores.map((x) => STORE_LABEL[x]).join(', ')}. The map fills in live.` + (w ? `\nLive map in the browser: ${w.url}` : '') + '\nNext: call scout_status with this session id.', snapshot(s, w));
  },
  async scout_status(a) {
    const s = getSession(a.session);
    const wait = Math.min(Math.max(a.wait_seconds ?? 40, 0), 50) * 1000;
    if (isRunning(s.id) && wait) await waitFor(s.id, (e) => e.kind === 'phase', wait);
    return text(summary(s, webInfo(s.id)) + `\nProgress: ${s.progress.pct}% · ${JSON.stringify(s.progress.perStore)}`);
  },
  async list_apps(a) {
    const s = getSession(a.session);
    const off = a.offset ?? 0, lim = Math.min(a.limit ?? 150, 250);
    const rows = s.apps.slice(off, off + lim).map(appLine);
    return text(`${s.apps.length} apps in ${s.id} (showing ${off + 1}–${off + rows.length}). Columns: id | store | name | category | users | rating | price | est. revenue | chart | summary | low reviews\n` + rows.join('\n'));
  },
  async save_grouping(a) {
    const s = getSession(a.session);
    if (isRunning(s.id)) return text('The crawl is still running. Call scout_status first, then group when the status is "grouping".', null, true);
    if (!Array.isArray(a.segments) || !a.segments.length) return text('Give at least one segment.', null, true);
    applyGrouping(s, a);
    const placed = s.apps.filter((x) => x.kw).length;
    return text(`Saved ${s.grouping.segments.length} segments, ${s.grouping.keywords.length} keywords and ${s.grouping.openings.length} openings for ${s.id}; ${placed} of ${s.apps.length} apps sit in a keyword. The map redrew.\n` + summary(s, webInfo(s.id)));
  },
  async plan_research(a) {
    const plan = normalizePlan(a);
    return text(`Plan ready for "${plan.idea}": ${plan.segments.length} segments to scout (${plan.segments.map((x) => x.name).join(', ')}). The user can edit it in the map view and start a focused scout.`, { view: 'plan', plan, web: webInfo(null) });
  },
  async show_map(a) {
    const s = getSession(a.session);
    return text(summary(s, webInfo(s.id)), snapshot(s, webInfo(s.id)));
  },
  async list_sessions() {
    const l = listSessions();
    if (!l.length) return text('No saved sessions yet. Start one with scout.');
    return text(l.map((x) => `${x.id} · "${x.name}" · ${x.status} · ${x.apps} apps${x.focused ? ' · focused' : ''} · ${x.questions} questions · updated ${x.updated}`).join('\n'));
  },
  async get_view_state(a) {
    const s = getSession(a.session);
    const open = s.questions.filter((q) => !q.answer);
    return text(JSON.stringify({ session: s.id, name: s.name, status: s.status, view: s.view, unanswered_questions: open }, null, 1));
  },
  async answer_question(a) {
    const s = getSession(a.session);
    const q = s.questions.find((x) => x.id === a.question_id);
    if (!q) return text(`No question ${a.question_id} in ${s.id}.`, null, true);
    q.answer = String(a.answer).slice(0, 8000);
    q.answeredAt = new Date().toISOString();
    save(s, { now: true });
    sendTo(s.id, { type: 'answer', question: q });
    publish({ session: s.id, kind: 'question' });
    return text(`Saved the answer to ${q.id}; the map shows it.`);
  },
  async export_session(a) {
    const s = getSession(a.session);
    const r = exportSession(s, a.format || 'md', a.parts);
    const path = join(EXPORTS, r.filename);
    writeFileSync(path, r.text);
    const w = webInfo(s.id);
    return text(`Exported ${s.id} to ${path}` + (w ? `\nDownload link (local): ${w.origin}/export?s=${s.id}&f=${a.format || 'md'}&t=${w.token}` : ''));
  },
  async ui_action(a) {
    const result = await handleAction(a.action, a.args || {}, 'widget');
    return text(`ok: ${a.action}`, result);
  },
};

export async function callTool(name, args) {
  const h = HANDLERS[name];
  if (!h) return text(`Unknown tool: ${name}`, null, true);
  try {
    return await h(args || {});
  } catch (e) {
    return text(e.message, { view: 'error', message: e.message }, true);
  }
}

export function listResources() {
  return [{ uri: UI_URI, name: 'App Scout map', description: 'The live market map', mimeType: RESOURCE_MIME_TYPE }];
}

export function readResource(uri) {
  if (uri !== UI_URI) throw new Error(`Unknown resource ${uri}`);
  return {
    contents: [{
      uri: UI_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: readFileSync(UI_FILE, 'utf8'),
      _meta: { ui: { csp: { connectDomains: connectOrigins(), resourceDomains: [] }, prefersBorder: false } },
    }],
  };
}
