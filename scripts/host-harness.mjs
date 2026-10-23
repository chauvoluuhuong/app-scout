// Developer helper: a minimal MCP Apps host for testing the map view the way Claude runs it.
// It starts the MCP server over stdio, serves a page with the view in a sandboxed iframe, and
// relays the view's requests (tools/call, ui/message, ui/open-link, ...) like a host would.
// Usage: node scripts/host-harness.mjs [session-id]   then open http://127.0.0.1:4790
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const session = process.argv[2] || '';
const srv = spawn(process.execPath, [join(root, 'server/index.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA || join(root, '.dev-data') } });
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
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }, clientInfo: { name: 'host-harness', version: '0' } });

const PAGE = `<!doctype html><meta charset="utf-8"><title>Host harness</title>
<style>body{margin:0;font:13px system-ui;background:#1a1a1a;color:#ddd;display:grid;grid-template-columns:1fr 320px;height:100vh}
#chat{border-left:1px solid #333;padding:10px;overflow:auto}#chat div{background:#262626;border-radius:8px;padding:8px;margin:0 0 8px;white-space:pre-wrap;word-break:break-word}
#wrap{padding:16px;overflow:auto}iframe{width:100%;border:0;display:block}</style>
<div id="wrap"><p>Simulated chat · the view below is an MCP App iframe</p><iframe id="f" sandbox="allow-scripts allow-same-origin" ></iframe></div><div id="chat"><b>Messages from the view</b></div>
<script>
const f = document.getElementById('f'), chat = document.getElementById('chat');
const say = (t) => { const d = document.createElement('div'); d.textContent = t; chat.appendChild(d); chat.scrollTop = 1e9; };
let result = null;
fetch('/rpc', { method: 'POST', body: JSON.stringify({ method: 'tools/call', params: { name: 'show_map', arguments: { session: ${JSON.stringify(session)} } } }) }).then(r => r.json()).then(m => { result = m.result; return fetch('/rpc', { method: 'POST', body: JSON.stringify({ method: 'resources/read', params: { uri: 'ui://app-scout/map.html' } }) }); }).then(r => r.json()).then(m => { f.srcdoc = m.result.contents[0].text; });
const post = (msg) => f.contentWindow.postMessage({ jsonrpc: '2.0', ...msg }, '*');
window.addEventListener('message', async (e) => {
  if (e.source !== f.contentWindow) return;
  const m = e.data; if (!m || m.jsonrpc !== '2.0') return;
  if (m.method === 'ui/initialize') { post({ id: m.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'harness', version: '0' }, hostCapabilities: {}, hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } } }); return; }
  if (m.method === 'ui/notifications/initialized') { post({ method: 'ui/notifications/tool-input', params: { arguments: {} } }); post({ method: 'ui/notifications/tool-result', params: result }); return; }
  if (m.method === 'ui/notifications/size-changed') { f.style.height = m.params.height + 'px'; return; }
  if (m.method === 'tools/call') { const r = await (await fetch('/rpc', { method: 'POST', body: JSON.stringify({ method: 'tools/call', params: m.params }) })).json(); post({ id: m.id, result: r.result }); return; }
  if (m.method === 'ui/message') { say('USER (from view): ' + m.params.content.map(c => c.text).join('\\n')); post({ id: m.id, result: {} }); return; }
  if (m.method === 'ui/update-model-context') { say('context: ' + m.params.content[0].text.slice(0, 300)); post({ id: m.id, result: {} }); return; }
  if (m.method === 'ui/open-link') { say('open link: ' + m.params.url); post({ id: m.id, result: {} }); return; }
  if (m.method === 'ui/download-file') { const r = m.params.contents[0].resource; say('download: ' + r.uri + ' (' + r.text.length + ' chars)'); post({ id: m.id, result: {} }); return; }
  if (m.method === 'ui/request-display-mode') { say('display mode: ' + m.params.mode); post({ id: m.id, result: { mode: m.params.mode } }); post({ method: 'ui/notifications/host-context-changed', params: { displayMode: m.params.mode } }); return; }
  if (m.id !== undefined) post({ id: m.id, error: { code: -32601, message: 'not in harness: ' + m.method } });
});
</script>`;

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    for await (const c of req) body += c;
    const { method, params } = JSON.parse(body);
    const r = await rpc(method, params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(r));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(4790, '127.0.0.1', () => console.log('harness on http://127.0.0.1:4790'));
