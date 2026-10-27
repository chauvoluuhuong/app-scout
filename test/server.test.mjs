// Starts the real MCP server over stdio (no network crawl) and checks the protocol surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

test('MCP handshake and tools; no UI resource, tools return text only', async () => {
  const { srv, rpc } = start();
  try {
    const init = await rpc('initialize', INIT);
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'app-scout');
    assert.equal(init.result.capabilities.resources, undefined);
    assert.match(init.result.instructions, /built-in browser/);

    const tools = (await rpc('tools/list')).result.tools;
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of ['scout', 'scout_status', 'list_apps', 'save_grouping', 'plan_research', 'show_map', 'list_sessions', 'get_view_state', 'answer_question', 'export_session']) assert.ok(byName[n], n);
    assert.equal(byName.ui_action, undefined);
    assert.ok(tools.every((t) => !t._meta));
    assert.equal((await rpc('resources/read', { uri: 'ui://app-scout/map.html' })).error.code, -32601);

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
