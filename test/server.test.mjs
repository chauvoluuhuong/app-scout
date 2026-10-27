// Starts the real MCP server over stdio (no network crawl) and checks the protocol surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { connect } from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function start(dataDir = mkdtempSync(join(tmpdir(), 'app-scout-test-'))) {
  const srv = spawn(process.execPath, [join(root, 'server/index.mjs')], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir } });
  let buf = '', seq = 0;
  const waiting = new Map();
  srv.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(m.id)?.(m);
    }
  });
  const rpc = (method, params) => new Promise((r) => { const id = ++seq; waiting.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { srv, rpc };
}

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } };
const mapLink = (r) => (r.content[0].text.match(/Map: (http:\/\/\S+)/) || [])[1];

// A saved session on disk, so no crawl (and no network) is needed.
function savedSessionDir() {
  const dir = mkdtempSync(join(tmpdir(), 'app-scout-test-'));
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  const apps = [{ id: 'a1', store: 'github', storeId: 'o/r', name: 'repo', users: 10, usersLabel: '10 stars', x: 500, y: 300, revenue: null, revenueLabel: 'Unknown', tier: 2 }];
  writeFileSync(join(dir, 'sessions', 'saved-abc123.json'), JSON.stringify({ id: 'saved-abc123', name: 'Saved', created: '2026-10-23T00:00:00Z', updated: '2026-10-23T00:00:00Z', market: 'us', topic: null, target: 20, stores: ['github'], plan: null, status: 'grouping', progress: { pct: 100, step: 'Done', perStore: { github: { status: 'done', apps: 1, details: 1, reviews: 0, slowed: 0 } }, searches: { done: 0, total: 0 }, pricingPages: 0, reviewsRead: 0 }, apps, grouping: null, questions: [], view: {}, error: null }));
  return dir;
}

test('MCP handshake, tools, and the App Scout card resource', async () => {
  const { srv, rpc } = start();
  try {
    const init = await rpc('initialize', INIT);
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'app-scout');
    assert.ok(init.result.capabilities.resources);
    assert.match(init.result.instructions, /built-in browser/);

    const tools = (await rpc('tools/list')).result.tools;
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of ['scout', 'scout_status', 'list_apps', 'save_grouping', 'plan_research', 'show_map', 'list_sessions', 'get_view_state', 'answer_question', 'export_session']) assert.ok(byName[n], n);
    assert.equal(byName.ui_action, undefined);
    for (const n of ['scout', 'plan_research', 'show_map', 'answer_question']) assert.equal(byName[n]._meta.ui.resourceUri, 'ui://app-scout/dock.html', n);
    assert.deepEqual(byName.dock._meta.ui.visibility, ['app']);
    const card = (await rpc('resources/read', { uri: 'ui://app-scout/dock.html' })).result.contents[0];
    assert.equal(card.mimeType, 'text/html;profile=mcp-app');
    assert.match(card.text, /ui\/message/);

    const plan = (await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'Meeting notes for Vietnamese teams', segments: [{ name: 'Meeting assistant', phrases: ['ai meeting notes'] }] } })).result;
    assert.equal(plan.structuredContent, undefined);
    assert.match(mapLink(plan), /\/\?plan=plan-[a-f0-9]+&t=/);

    const sessions = (await rpc('tools/call', { name: 'list_sessions', arguments: {} })).result;
    assert.match(sessions.content[0].text, /No saved sessions/);

    const bad = (await rpc('tools/call', { name: 'show_map', arguments: { session: 'nope' } })).result;
    assert.equal(bad.isError, true);

    const unknown = await rpc('no/such/method', {});
    assert.equal(unknown.error.code, -32601);
  } finally {
    srv.kill();
  }
});

test('the map link opens the session and the plan on the local page', async () => {
  const { srv, rpc } = start(savedSessionDir());
  try {
    await rpc('initialize', INIT);
    const r = (await rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result;
    const link = new URL(mapLink(r));
    assert.equal(link.searchParams.get('s'), 'saved-abc123');
    const t = link.searchParams.get('t');
    const call = async (action, args) => (await fetch(`${link.origin}/api/action?t=${t}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args }) })).json();
    assert.equal((await call('snapshot', { session: 'saved-abc123' })).apps.length, 1);
    assert.match(await (await fetch(link)).text(), /<canvas id="cv"/);

    const plan = (await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'x', segments: [{ name: 'A', phrases: ['a'] }] } })).result;
    const got = await call('plan', { id: new URL(mapLink(plan)).searchParams.get('plan') });
    assert.equal(got.view, 'plan');
    assert.equal(got.plan.segments[0].name, 'A');
  } finally {
    srv.kill();
  }
});

test('every open page gets the same pushes (in-app browser and browser tab together)', async () => {
  const { srv, rpc } = start(savedSessionDir());
  try {
    await rpc('initialize', INIT);
    const link = new URL(mapLink((await rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result));
    const t = link.searchParams.get('t');
    const page = () => new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${link.host}/ws?t=${t}&s=saved-abc123`);
      const got = [];
      ws.onmessage = (e) => { const m = JSON.parse(e.data); got.push(m); if (m.type === 'hello') resolve({ ws, got }); };
      ws.onerror = reject;
    });
    const pages = [await page(), await page()];
    const until = async (pred) => { for (let i = 0; i < 50 && !pages.every((p) => p.got.some(pred)); i++) await new Promise((r) => setTimeout(r, 50)); return pages.every((p) => p.got.some(pred)); };

    // A question asked on one page is saved with the session and reaches Claude's tools.
    const asked = await (await fetch(`${link.origin}/api/action?t=${t}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'question', args: { session: 'saved-abc123', text: 'Who pays?' } }) })).json();
    assert.ok(await until((m) => m.type === 'changed'), 'both pages hear about the question');
    const state = JSON.parse((await rpc('tools/call', { name: 'get_view_state', arguments: { session: 'saved-abc123' } })).result.content[0].text);
    assert.equal(state.unanswered_questions[0].id, asked.question.id);

    await rpc('tools/call', { name: 'answer_question', arguments: { session: 'saved-abc123', question_id: asked.question.id, answer: 'Teams.' } });
    assert.ok(await until((m) => m.type === 'answer' && m.question.answer === 'Teams.'), 'both pages get the answer');

    await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'x', segments: [{ name: 'A', phrases: ['a'] }] } });
    assert.ok(await until((m) => m.type === 'plan'), 'both pages get the plan');
    pages.forEach((p) => p.ws.close());
  } finally {
    srv.kill();
  }
});

test('a page on another App Scout server sees the scout live (several chats share one data folder)', async () => {
  // Claude Desktop runs one server per chat and can leave old ones running; the map page may be
  // open on any of them while the scout runs in another.
  const dir = savedSessionDir();
  const a = start(dir), b = start(dir);
  try {
    await a.rpc('initialize', INIT);
    await b.rpc('initialize', INIT);
    const link = new URL(mapLink((await b.rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result));
    const t = link.searchParams.get('t');
    const call = async (action, args) => (await fetch(`${link.origin}/api/action?t=${t}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args }) })).json();
    assert.equal((await call('snapshot', { session: 'saved-abc123' })).session.status, 'grouping');
    const got = [];
    const ws = new WebSocket(`ws://${link.host}/ws?t=${t}&s=saved-abc123`);
    await new Promise((r, j) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); got.push(m); if (m.type === 'hello') r(); }; ws.onerror = j; });
    const until = async (pred) => { for (let i = 0; i < 60 && !got.some(pred); i++) await new Promise((r) => setTimeout(r, 50)); return got.some(pred); };

    // Server A groups the apps; B's page hears about it and B serves the new data.
    const g = (await a.rpc('tools/call', { name: 'save_grouping', arguments: { session: 'saved-abc123', segments: [{ name: 'Dev tools', keywords: [{ name: 'Repos', app_ids: ['a1'] }] }], openings: [] } })).result;
    assert.notEqual(g.isError, true);
    assert.ok(await until((m) => m.type === 'changed'), "B's page is told the session changed");
    const snap = await call('snapshot', { session: 'saved-abc123' });
    assert.equal(snap.session.status, 'ready');
    assert.equal(snap.segments[0].name, 'Dev tools');

    // B saving the view afterwards keeps A's grouping on disk.
    await call('view', { session: 'saved-abc123', state: { lens: 'leaders' } });
    await new Promise((r) => setTimeout(r, 1300));
    const disk = JSON.parse(readFileSync(join(dir, 'sessions', 'saved-abc123.json'), 'utf8'));
    assert.equal(disk.status, 'ready');
    assert.equal(disk.grouping.segments[0].name, 'Dev tools');
    assert.equal(disk.view.lens, 'leaders');

    // A scout another server starts: B's open page follows it.
    writeFileSync(join(dir, 'sessions', 'new-def456.json'), JSON.stringify({ ...disk, id: 'new-def456', name: 'New scout', status: 'crawling', apps: [], grouping: null }));
    assert.ok(await until((m) => m.type === 'session' && m.id === 'new-def456'), "B's page follows the new scout");
    ws.close();
  } finally {
    a.srv.kill();
    b.srv.kill();
  }
});

test('local web server rejects requests without the token and speaks WebSocket with it', async () => {
  const { srv, rpc } = start();
  try {
    await rpc('initialize', INIT);
    const plan = new URL(mapLink((await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'x', segments: [{ name: 'A', phrases: ['a'] }] } })).result));
    const origin = plan.origin;
    assert.equal((await fetch(origin + '/api/action', { method: 'POST', body: '{}' })).status, 403);
    const token = plan.searchParams.get('t');
    const ok = await fetch(`${origin}/api/action?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sessions' }) });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { sessions: [] });

    const port = Number(new URL(origin).port);
    const hello = await new Promise((resolve, reject) => {
      const key = randomBytes(16).toString('base64');
      const sock = connect(port, '127.0.0.1', () => sock.write(`GET /ws?t=${token} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      let data = Buffer.alloc(0);
      sock.on('data', (c) => {
        data = Buffer.concat([data, c]);
        const end = data.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = data.subarray(0, end).toString();
        const expect = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if (!head.includes(expect)) return reject(new Error('bad accept key'));
        const frame = data.subarray(end + 4);
        if (frame.length < 2) return;
        const len = frame[1] & 0x7f;
        if (frame.length < 2 + len) return;
        sock.destroy();
        resolve(JSON.parse(frame.subarray(2, 2 + len).toString()));
      });
      sock.on('error', reject);
    });
    assert.equal(hello.type, 'hello');
  } finally {
    srv.kill();
  }
});

test('a map question reaches Claude: by the monitor, or by the prompt hook when no monitor runs', async () => {
  const dir = savedSessionDir();
  const { srv, rpc } = start(dir);
  const run = (script, env) => spawn(process.execPath, [join(root, 'server', script)], { env: { ...process.env, CLAUDE_PLUGIN_DATA: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = (p) => new Promise((r) => { let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('exit', () => r(o)); });
  let watch;
  try {
    await rpc('initialize', INIT);
    const link = new URL(mapLink((await rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result));
    const ask = async (text) => (await fetch(`${link.origin}/api/action?t=${link.searchParams.get('t')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'question', args: { session: 'saved-abc123', text, context: { focus: { type: 'app', name: 'repo' } } } }) })).json();

    // The monitor finds this session's server by itself (the live file and its parent process).
    watch = run('watch.mjs');
    let printed = '';
    watch.stdout.on('data', (d) => (printed += d));
    await new Promise((r) => setTimeout(r, 800));
    const a = await ask('Who pays?');
    assert.equal(a.listening, true, 'the page knows a monitor is listening');
    for (let i = 0; i < 40 && !printed.includes(a.question.id); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(printed, new RegExp(`^\\[App Scout map question ${a.question.id} · session saved-abc123\\] "Who pays\\?" Looking at: repo \\(app\\) Answer here, then call answer_question`, 'm'));
    assert.equal(printed.trim().split('\n').length, 1, 'one line per question');
    await new Promise((r) => { watch.on('exit', r); watch.kill(); });
    await new Promise((r) => setTimeout(r, 200)); // let the server see the monitor's request close

    // Without a monitor the hook attaches it to the next message, once.
    const b = await ask('Who else?');
    const first = await output(run('hook.mjs'));
    assert.match(first, new RegExp(`Questions the user asked on the App Scout map:\\n\\[App Scout map question ${b.question.id}`));
    assert.equal(await output(run('hook.mjs')), '');

    const snap = await (await fetch(`${link.origin}/api/action?t=${link.searchParams.get('t')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'snapshot', args: { session: 'saved-abc123' } }) })).json();
    assert.ok(snap.questions.every((q) => q.sentAt), 'the page can show "Claude has it"');
  } finally {
    watch?.kill();
    srv.kill();
  }
});

test('the App Scout card: only the newest acts, Send takes the question once', async () => {
  const dir = savedSessionDir();
  const { srv, rpc } = start(dir);
  const dock = async (args) => (await rpc('tools/call', { name: 'dock', arguments: args })).result.structuredContent;
  try {
    await rpc('initialize', INIT);
    const link = new URL(mapLink((await rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result));
    const ask = async (text) => (await fetch(`${link.origin}/api/action?t=${link.searchParams.get('t')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'question', args: { session: 'saved-abc123', text } }) })).json();

    const older = (await dock({ op: 'hello' })).id;
    const newer = (await dock({ op: 'hello' })).id;
    assert.equal((await dock({ op: 'poll', id: older })).active, false, 'an older card steps aside');
    const idle = await dock({ op: 'poll', id: newer });
    assert.equal(idle.active, true);
    assert.equal(idle.session.id, 'saved-abc123');
    assert.match(idle.map, /\?s=saved-abc123&t=/);

    const a = await ask('Who pays?');
    assert.equal(a.dock, true, 'the page knows a card is waiting');
    const ready = await dock({ op: 'poll', id: newer });
    assert.equal(ready.prompt.id, a.question.id);
    assert.match(ready.prompt.text, /^\[App Scout map question .*"Who pays\?"\nLooking at: Saved\nAnswer here, then call answer_question/);
    assert.equal((await dock({ op: 'poll', id: newer })).prompt.id, a.question.id, 'polling leaves it queued');

    assert.equal((await dock({ op: 'sent', qid: a.question.id })).taken, true);
    assert.equal((await dock({ op: 'sent', qid: a.question.id })).taken, false, 'taken once');
    assert.equal((await dock({ op: 'poll', id: newer })).prompt, null);
    const res = await fetch(`${link.origin}/pending?t=${link.searchParams.get('t')}`);
    assert.deepEqual((await res.json()).questions, [], 'the hook gets nothing already sent');

    const shown = (await rpc('tools/call', { name: 'answer_question', arguments: { session: 'saved-abc123', question_id: a.question.id, answer: 'Teams.' } })).result;
    assert.match(shown.content[0].text, /watch\.mjs" --once/, 'Claude is reminded to restart the watcher');
  } finally {
    srv.kill();
  }
});
