// Developer helper: a minimal MCP Apps host for testing the App Scout card (ui/dock.html) the
// way Claude Desktop Chat runs it. It starts the MCP server over stdio and serves a page that
// looks like a chat: each call to renderTool(name, args) adds the tool's card as a sandboxed
// iframe at the bottom, and the host relays the cards' requests (tools/call, ui/message,
// ui/open-link, ...). Messages a card posts appear in the chat as user messages.
// Usage: node scripts/host-harness.mjs   then open http://127.0.0.1:4790
// (HARNESS_PORT changes the port; CLAUDE_PLUGIN_DATA the data directory.)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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
<style>body{margin:0;font:13px system-ui;background:#1a1a1a;color:#ddd}#chat{max-width:560px;margin:0 auto;padding:16px}
.msg{background:#262626;border-radius:8px;padding:8px;margin:0 0 10px;white-space:pre-wrap;word-break:break-word}.msg.user{background:#33405a}
iframe{width:100%;border:0;display:block;margin:0 0 10px;height:60px}</style>
<div id="chat"><div class="msg">Simulated chat · App Scout cards appear below as MCP App iframes</div></div>
<script>
const chat = document.getElementById('chat');
const say = (t, cls) => { const d = document.createElement('div'); d.className = 'msg ' + (cls || ''); d.textContent = t; chat.appendChild(d); window.scrollTo(0, 1e9); };
const rpc = async (method, params) => (await (await fetch('/rpc', { method: 'POST', body: JSON.stringify({ method, params }) })).json());
const frames = [];
window.messages = [];
// Like a host: call the tool, show its text, and if it links a UI resource, add a card under it.
window.renderTool = async (name, args) => {
  const tools = (await rpc('tools/list')).result.tools;
  const t = tools.find((x) => x.name === name);
  const r = (await rpc('tools/call', { name, arguments: args })).result;
  say('tool ' + name + ': ' + r.content[0].text.slice(0, 160));
  const uri = t && t._meta && t._meta.ui && t._meta.ui.resourceUri;
  if (!uri) return r;
  const html = (await rpc('resources/read', { uri })).result.contents[0].text;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  f.srcdoc = html;
  f.result = r;
  chat.appendChild(f);
  frames.push(f);
  return r;
};
window.addEventListener('message', async (e) => {
  const f = frames.find((x) => x.contentWindow === e.source); if (!f) return;
  const m = e.data; if (!m || m.jsonrpc !== '2.0') return;
  const post = (msg) => f.contentWindow.postMessage({ jsonrpc: '2.0', ...msg }, '*');
  if (m.method === 'ui/initialize') { post({ id: m.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'harness', version: '0' }, hostCapabilities: {}, hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline'] } } }); return; }
  if (m.method === 'ui/notifications/initialized') { post({ method: 'ui/notifications/tool-result', params: f.result }); return; }
  if (m.method === 'ui/notifications/size-changed') { f.style.height = m.params.height + 'px'; return; }
  if (m.method === 'tools/call') { const r = await rpc('tools/call', m.params); post({ id: m.id, result: r.result }); return; }
  if (m.method === 'ui/message') { const t = m.params.content.map((c) => c.text).join('\\n'); window.messages.push(t); say('USER: ' + t, 'user'); post({ id: m.id, result: {} }); return; }
  if (m.method === 'ui/open-link') { say('open link: ' + m.params.url); post({ id: m.id, result: {} }); return; }
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
}).listen(Number(process.env.HARNESS_PORT) || 4790, '127.0.0.1', function () { console.log(`harness on http://127.0.0.1:${this.address().port}`); });
