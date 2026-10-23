// Developer helper: start the server over stdio, run one small scout, print what came back.
// Usage: node scripts/try.mjs "ai meeting notes" 20
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [topic, apps = '20'] = process.argv.slice(2);
const srv = spawn(process.execPath, [join(root, 'server/index.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, CLAUDE_PLUGIN_DATA: join(root, '.dev-data') } });
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
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;

console.log((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'try', version: '0' } })).result.serverInfo);
console.log('tools:', (await rpc('tools/list')).result.tools.map((t) => t.name).join(', '));
const started = await call('scout', { topic, apps: Number(apps) });
console.log(started.content[0].text);
const sid = started.structuredContent.session.id;
for (let i = 0; i < 12; i++) {
  const st = await call('scout_status', { session: sid, wait_seconds: 30 });
  console.log(st.content[0].text.split('\n')[0]);
  if (!/crawling|queued/.test(st.content[0].text.split('\n')[0])) break;
}
console.log((await call('list_apps', { session: sid, limit: 8 })).content[0].text);
srv.kill();
