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

test('MCP handshake, tools, UI resource and app-only tool', async () => {
  const { srv, rpc } = start();
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }, clientInfo: { name: 'test', version: '0' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'app-scout');

    const tools = (await rpc('tools/list')).result.tools;
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of ['scout', 'scout_status', 'list_apps', 'save_grouping', 'plan_research', 'show_map', 'list_sessions', 'get_view_state', 'answer_question', 'export_session', 'ui_action']) assert.ok(byName[n], n);
    assert.equal(byName.scout._meta.ui.resourceUri, 'ui://app-scout/map.html');
    assert.deepEqual(byName.ui_action._meta.ui.visibility, ['app']);

    const res = (await rpc('resources/read', { uri: 'ui://app-scout/map.html' })).result.contents[0];
    assert.equal(res.mimeType, 'text/html;profile=mcp-app');
    assert.match(res.text, /<canvas id="cv"/);
    assert.ok(res._meta.ui.csp.connectDomains.some((d) => d.startsWith('ws://127.0.0.1:')));

    const plan = (await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'Meeting notes for Vietnamese teams', segments: [{ name: 'Meeting assistant', phrases: ['ai meeting notes'] }] } })).result;
    assert.equal(plan.structuredContent.view, 'plan');
    assert.equal(plan.structuredContent.plan.segments[0].name, 'Meeting assistant');

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

test('hosts without MCP Apps get text only; MCP Apps hosts get a pointer, never the app list', async () => {
  const plain = start();
  try {
    await plain.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cli', version: '0' } });
    const r = (await plain.rpc('tools/call', { name: 'plan_research', arguments: { idea: 'x', segments: [{ name: 'A', phrases: ['a'] }] } })).result;
    assert.equal(r.structuredContent, undefined);
    assert.match(r.content[0].text, /Plan ready/);
  } finally {
    plain.srv.kill();
  }
  // A saved session on disk, so no crawl (and no network) is needed.
  const dir = mkdtempSync(join(tmpdir(), 'app-scout-test-'));
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  const apps = [{ id: 'a1', store: 'github', storeId: 'o/r', name: 'repo', users: 10, usersLabel: '10 stars', x: 500, y: 300, revenue: null, revenueLabel: 'Unknown', tier: 2 }];
  writeFileSync(join(dir, 'sessions', 'saved-abc123.json'), JSON.stringify({ id: 'saved-abc123', name: 'Saved', created: '2026-10-23T00:00:00Z', updated: '2026-10-23T00:00:00Z', market: 'us', topic: null, target: 20, stores: ['github'], plan: null, status: 'grouping', progress: { pct: 100, step: 'Done', perStore: { github: { status: 'done', apps: 1, details: 1, reviews: 0, slowed: 0 } }, searches: { done: 0, total: 0 }, pricingPages: 0, reviewsRead: 0 }, apps, grouping: null, questions: [], view: {}, error: null }));
  const ui = start(dir);
  try {
    await ui.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }, clientInfo: { name: 'host', version: '0' } });
    const r = (await ui.rpc('tools/call', { name: 'show_map', arguments: { session: 'saved-abc123' } })).result;
    assert.equal(r.structuredContent.view, 'map');
    assert.equal(r.structuredContent.session.id, 'saved-abc123');
    assert.equal(r.structuredContent.apps, undefined);
    const full = (await ui.rpc('tools/call', { name: 'ui_action', arguments: { action: 'snapshot', args: { session: 'saved-abc123' } } })).result;
    assert.equal(full.structuredContent.apps.length, 1);
  } finally {
    ui.srv.kill();
  }
});

test('local web server rejects requests without the token and speaks WebSocket with it', async () => {
  const { srv, rpc } = start();
  try {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }, clientInfo: { name: 'test', version: '0' } });
    const res = (await rpc('resources/read', { uri: 'ui://app-scout/map.html' })).result.contents[0];
    const origin = res._meta.ui.csp.connectDomains.find((d) => d.startsWith('http://'));
    assert.equal((await fetch(origin + '/api/action', { method: 'POST', body: '{}' })).status, 403);

    const plan = (await rpc('tools/call', { name: 'plan_research', arguments: { idea: 'x', segments: [{ name: 'A', phrases: ['a'] }] } })).result;
    const token = new URL(plan.structuredContent.web.url).searchParams.get('t');
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
