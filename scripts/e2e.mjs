// End-to-end test with screenshots. Runs the real MCP server behind the test MCP Apps host
// (scripts/host-harness.mjs), drives headless Chrome over the DevTools protocol (Node's
// built-in WebSocket, no dependencies), checks each step and saves a screenshot of it.
// Offline: the map data comes from test/fixtures/meeting-notes.json (a real scout).
//
// Usage:
//   node scripts/e2e.mjs            run, write e2e-out/ (screenshots, report.md, pr-body.md)
//   node scripts/e2e.mjs --publish  also push the run to the e2e-evidence branch and embed
//                                   the screenshot links in e2e-out/pr-body.md
// CHROME_PATH overrides where Chrome is.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'e2e-out');
const PUBLISH = process.argv.includes('--publish');
const SESSION = 'e2e-meeting-notes';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

// ------------------------------------------------------------------ setup
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const data = mkdtempSync(join(tmpdir(), 'app-scout-e2e-'));
mkdirSync(join(data, 'sessions'), { recursive: true });
const fx = JSON.parse(readFileSync(join(root, 'test/fixtures/meeting-notes.json'), 'utf8'));
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
writeFileSync(join(data, 'sessions', `${SESSION}.json`), JSON.stringify({
  id: SESSION, ...fx.session, created: now, updated: now, plan: null, status: 'grouping',
  apps: fx.apps, grouping: null, questions: [], view: { sizeBy: 'revenue', lens: null, focus: null }, error: null,
}));

const procs = [];
const cleanup = () => procs.forEach((p) => { try { p.kill(); } catch {} });
process.on('exit', cleanup);

function startHarness() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(root, 'scripts/host-harness.mjs'), SESSION], { env: { ...process.env, CLAUDE_PLUGIN_DATA: data, HARNESS_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.push(p);
    let errs = '';
    p.stderr.on('data', (d) => (errs += d));
    p.stdout.on('data', (d) => { const m = String(d).match(/harness on (http:\/\/[^\s]+)/); if (m) resolve(m[1]); });
    p.on('exit', (c) => reject(new Error(`harness exited (${c}): ${errs.slice(-400)}`)));
  });
}

const CHROME = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
async function startChrome() {
  if (!CHROME) throw new Error('Chrome not found. Set CHROME_PATH.');
  const profile = mkdtempSync(join(tmpdir(), 'app-scout-chrome-'));
  const p = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  procs.push(p);
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map(), waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) waiters.filter((w) => w.method === m.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.params); });
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  return { cdp, once };
}

// ------------------------------------------------------------------ run
const harnessUrl = await startHarness();
const rpc = async (method, params) => (await (await fetch(`${harnessUrl}/rpc`, { method: 'POST', body: JSON.stringify({ method, params }) })).json()).result;
const tool = (name, args) => rpc('tools/call', { name, arguments: args });

const grouped = await tool('save_grouping', { session: SESSION, ...fx.grouping });
if (grouped.isError) throw new Error('save_grouping failed: ' + grouped.content[0].text);

const { cdp, once } = await startChrome();
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, what, ms = 10000) {
  const t0 = Date.now();
  for (;;) {
    try { if (await js(expression)) return; } catch {}
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}
async function go(url) { const loaded = once('Page.loadEventFired'); await cdp('Page.navigate', { url }); await loaded; }

const steps = [];
async function step(title, fn) {
  const n = String(steps.length + 1).padStart(2, '0');
  const file = `${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  const s = { n, title, file, ok: true, detail: '' };
  try { s.detail = (await fn()) || ''; } catch (e) { s.ok = false; s.detail = e.message; }
  await sleep(400);
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, file), Buffer.from(shot.data, 'base64'));
  steps.push(s);
  console.log(`${s.ok ? 'PASS' : 'FAIL'} ${n} ${title}${s.detail ? ' · ' + s.detail : ''}`);
}
const V = `document.getElementById('f').contentDocument`; // the view, inside the host's iframe
const chat = `[...document.querySelectorAll('#chat div')].map((x) => x.textContent)`;
const click = (sel) => js(`(() => { const el = ${V}.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ${sel.replace(/'/g, '')}'); el.click(); return true; })()`);

await step('Map opens in the chat view', async () => {
  const pointer = (await tool('show_map', { session: SESSION })).structuredContent;
  if (!pointer || pointer.apps) throw new Error('show_map should send a pointer, not the app list');
  const bytes = JSON.stringify(pointer).length;
  await go(harnessUrl);
  await waitFor(`${V}.getElementById('stat').textContent.includes('46 apps')`, 'the view to load 46 apps');
  return `the model-visible payload is ${bytes} bytes; the view fetched all 46 apps itself`;
});

await step('First-run tour shows how to read the map', async () => {
  await waitFor(`${V}.getElementById('tour').style.display === 'block'`, 'the tour');
  const txt = await js(`${V}.getElementById('tour').innerText`);
  if (!/1 of 3/.test(txt)) throw new Error('tour should start at step 1 of 3');
  return txt.split('\n').slice(1, 2).join(' ');
});

await step('Legend folds into the help icon after the tour', async () => {
  await click('[data-t="skip"]');
  await waitFor(`${V}.querySelector('#lg [data-l="open"]')`, 'the folded legend');
  await sleep(900);
});

await step('Every segment name is drawn', async () => {
  const names = fx.grouping.segments.map((s) => s.name);
  const drawn = await js(`[...(${V}.defaultView.__appScoutLabels || [])]`);
  const missing = names.filter((n) => !drawn.includes(n) && !drawn.some((d) => d.endsWith('…') && n.startsWith(d.slice(0, -1))));
  if (missing.length) throw new Error('missing: ' + missing.join(', '));
  return `${names.length} of ${names.length} segment names on screen`;
});

await step('Apps found opens a sortable table', async () => {
  await click('[data-m="0"]');
  await waitFor(`${V}.getElementById('modal').style.display === 'flex'`, 'the table');
  await js(`${V}.querySelector('th[data-sort="r"]').click()`);
  const first = await js(`${V}.querySelector('#modal tbody tr td').textContent`);
  return `sorted by revenue, first row: ${first}`;
});

let picked = '';
await step('Selecting a row shows the app on the map', async () => {
  picked = await js(`${V}.querySelector('#modal tbody tr td').textContent`);
  await js(`${V}.querySelector('#modal tbody tr').click()`);
  await waitFor(`${V}.querySelector('#pn .t').textContent === ${JSON.stringify(picked)}`, 'the panel to show the app');
  await sleep(900);
  return picked;
});

let qid = '';
await step('Ask Claude sends the question with its context', async () => {
  await click('[data-a="ask"]');
  await click('[data-s]');
  await click('[data-a="send"]');
  await waitFor(`${chat}.some((t) => t.includes('[App Scout · session ${SESSION} · question'))`, 'the message in the chat');
  const msg = await js(`${chat}.reverse().find((t) => t.includes('· question'))`);
  qid = (msg.match(/question (q-[a-f0-9]+)/) || [])[1];
  if (!/Map context: .*"name":/.test(msg)) throw new Error('message has no map context');
  return `${qid} reached the chat with its context`;
});

await step("Claude's answer shows on the map", async () => {
  const r = await tool('answer_question', { session: SESSION, question_id: qid, answer: `E2E answer for ${picked}: it earns from subscriptions (est., App Store in-app purchases).` });
  if (r.isError) throw new Error(r.content[0].text);
  await click('[data-a="done"]');
  await waitFor(`(${V}.querySelector('#pn .qa') || {}).innerText?.includes('E2E answer')`, 'the answer in the panel');
});

await step('Export hands the report to the host', async () => {
  await js(`${V}.getElementById('bExport').click()`);
  await click('[data-a="doexp"]');
  await waitFor(`${chat}.some((t) => t.startsWith('download:'))`, 'the download');
  return await js(`${chat}.reverse().find((t) => t.startsWith('download:'))`);
});

await step('Plan from idea shows an editable plan', async () => {
  const r = await tool('plan_research', { idea: 'Meeting notes app for Vietnamese small teams', customers: ['SMB teams', 'Freelancers'], forms: ['Mobile app', 'Chrome extension'], segments: [{ name: 'Meeting assistant', phrases: ['ai meeting notes'] }, { name: 'Voice notes', phrases: ['voice notes'] }], apps: 50 });
  await js(`document.getElementById('f').contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: ${JSON.stringify(r)} }, '*')`);
  await waitFor(`${V}.querySelector('#pn .t').textContent === 'Research plan'`, 'the plan');
  return 'customers, forms and segments as chips';
});

await step('Open in browser shows the same map', async () => {
  const pointer = (await tool('show_map', { session: SESSION })).structuredContent;
  await go(pointer.web.url);
  await waitFor(`document.getElementById('stat').textContent.includes('46 apps')`, 'the browser map');
  await sleep(900);
});

cleanup();

// ------------------------------------------------------------------ report
const failed = steps.filter((s) => !s.ok).length;
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', '--short', 'HEAD');
const summary = `${steps.length - failed} of ${steps.length} steps passed · branch \`${branch}\` @ \`${commit}\` · ${new Date().toISOString()}`;
const table = (link) => ['| # | Step | Result |', '|---|---|---|', ...steps.map((s) => `| ${s.n} | ${s.title} | ${s.ok ? '✅' : '❌'} ${s.detail.replace(/\|/g, '\\|')} |`), '', ...steps.map((s) => `**${s.n} · ${s.title}**\n\n![${s.title}](${link(s.file)})\n`)].join('\n');
writeFileSync(join(OUT, 'report.md'), `# E2E run\n\n${summary}\n\n${table((f) => f)}`);

let base = null;
if (PUBLISH) {
  if (failed) console.error('Not publishing: some steps failed.');
  else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = `${branch.replace(/[^\w.-]+/g, '-')}/${stamp}`;
    const wt = mkdtempSync(join(tmpdir(), 'app-scout-evidence-'));
    rmSync(wt, { recursive: true, force: true });
    let remote = true;
    try { git('ls-remote', '--exit-code', '--heads', 'origin', 'e2e-evidence'); } catch { remote = false; }
    if (remote) { git('fetch', '-q', 'origin', 'e2e-evidence'); git('worktree', 'add', '-q', '-B', 'e2e-evidence', wt, 'origin/e2e-evidence'); }
    else git('worktree', 'add', '-q', '--orphan', '-b', 'e2e-evidence', wt);
    cpSync(OUT, join(wt, dir), { recursive: true });
    execFileSync('git', ['add', '-A'], { cwd: wt });
    execFileSync('git', ['commit', '-q', '-m', `E2E evidence: ${branch} @ ${commit}\n\n${summary}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`], { cwd: wt });
    execFileSync('git', ['push', '-q', 'origin', 'e2e-evidence'], { cwd: wt });
    git('worktree', 'remove', '--force', wt);
    const repo = git('remote', 'get-url', 'origin').replace(/^git@github\.com:|^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    base = `https://raw.githubusercontent.com/${repo}/e2e-evidence/${dir}`;
    console.log(`Published: https://github.com/${repo}/tree/e2e-evidence/${dir}`);
  }
}
writeFileSync(join(OUT, 'pr-body.md'), `## E2E\n\n${summary}\n\n${base ? table((f) => `${base}/${f}`) : '_Screenshots not published: run `node scripts/e2e.mjs --publish`._'}\n`);
console.log(`\n${summary}\nReport: e2e-out/report.md`);
process.exit(failed ? 1 : 0);
