// End-to-end test with screenshots. Runs the real MCP server over stdio, opens the map link its
// tools return in two headless Chrome tabs at once (standing in for Claude's in-app browser and
// a normal browser tab), drives them over the DevTools protocol (Node's built-in WebSocket, no
// dependencies), checks each step and saves a screenshot of it.
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
// A session saved mid-crawl, to show the controls while a scout runs (no network needed).
const RUNNING = 'e2e-running';
writeFileSync(join(data, 'sessions', `${RUNNING}.json`), JSON.stringify({
  id: RUNNING, ...fx.session, name: 'Scout in progress', created: now, updated: now, plan: null, status: 'crawling',
  progress: { ...fx.session.progress, pct: 42, step: 'Reading Google Play' }, apps: fx.apps.slice(0, 20), grouping: null, questions: [], view: {}, error: null,
}));

const procs = [];
const cleanup = () => procs.forEach((p) => { try { p.kill(); } catch {} });
process.on('exit', cleanup);

// The MCP server, spoken to over stdio the way Claude does.
function startServer() {
  const p = spawn(process.execPath, [join(root, 'server/index.mjs')], { env: { ...process.env, CLAUDE_PLUGIN_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  procs.push(p);
  let buf = '', seq = 0;
  const waiting = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); }
  });
  return (method, params) => new Promise((r) => { const id = ++seq; waiting.set(id, (m) => r(m.result)); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
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
  let first = true;
  // Each call gives one tab with its own DevTools connection.
  return async function openTab() {
    const page = first ? (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') : await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    first = false;
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
    const js = async (expression) => {
      const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression, what, ms = 10000) => {
      const t0 = Date.now();
      for (;;) {
        try { if (await js(expression)) return; } catch {}
        if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
        await sleep(200);
      }
    };
    const go = async (url) => { const loaded = once('Page.loadEventFired'); await cdp('Page.navigate', { url }); await loaded; };
    const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('missing ${sel.replace(/'/g, '')}'); el.click(); return true; })()`);
    return { cdp, js, waitFor, go, click };
  };
}

// ------------------------------------------------------------------ run
const rpc = startServer();
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } });
const tool = (name, args) => rpc('tools/call', { name, arguments: args });
const mapLink = (r) => (r.content[0].text.match(/Map: (http:\/\/\S+)/) || [])[1];

const grouped = await tool('save_grouping', { session: SESSION, ...fx.grouping });
if (grouped.isError) throw new Error('save_grouping failed: ' + grouped.content[0].text);

const openTab = await startChrome();
const A = await openTab(); // stands in for Claude's in-app browser
let B = null;              // a second copy, as in a normal browser tab
let shotOf = A;

const steps = [];
async function step(title, fn) {
  const n = String(steps.length + 1).padStart(2, '0');
  const file = `${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  const s = { n, title, file, ok: true, detail: '' };
  shotOf = A;
  try { s.detail = (await fn()) || ''; } catch (e) { s.ok = false; s.detail = e.message; }
  await sleep(400);
  const shot = await shotOf.cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, file), Buffer.from(shot.data, 'base64'));
  steps.push(s);
  console.log(`${s.ok ? 'PASS' : 'FAIL'} ${n} ${title}${s.detail ? ' · ' + s.detail : ''}`);
}

let link = '';
await step('Map opens from the link the tool returns', async () => {
  const r = await tool('show_map', { session: SESSION });
  if (r.structuredContent) throw new Error('tools should return text only');
  link = mapLink(r);
  if (!link) throw new Error('show_map gave no map link');
  await A.go(link);
  await A.waitFor(`document.getElementById('stat').textContent.includes('46 apps')`, 'the map to load 46 apps');
  return `show_map ends with "Map: ${link.replace(/t=\w+/, 't=…')}"`;
});

await step('Toolbar icons sit on the text line', async () => {
  const off = await A.js(`[...document.querySelectorAll('.tbar button')].filter((b) => b.offsetParent).map((b) => { const i = b.querySelector('svg').getBoundingClientRect(), r = b.getBoundingClientRect(); return Math.abs((i.top + i.bottom) / 2 - (r.top + r.bottom) / 2); })`);
  const worst = Math.max(...off);
  if (worst > 1.5) throw new Error(`an icon is ${worst.toFixed(1)}px off centre`);
  return `${off.length} buttons, every icon within ${worst.toFixed(1)}px of centre`;
});

await step('First-run tour shows how to read the map', async () => {
  await A.waitFor(`document.getElementById('tour').style.display === 'block'`, 'the tour');
  const txt = await A.js(`document.getElementById('tour').innerText`);
  if (!/1 of 3/.test(txt)) throw new Error('tour should start at step 1 of 3');
  return txt.split('\n').slice(1, 2).join(' ');
});

await step('Legend folds into the help icon after the tour', async () => {
  await A.click('[data-t="skip"]');
  await A.waitFor(`document.querySelector('#lg [data-l="open"]')`, 'the folded legend');
  await A.click('#lg [data-l="open"]');
  const txt = await A.js(`document.getElementById('lg').innerText`);
  if (/Size by|Lenses/.test(txt)) throw new Error('the legend should only explain the map now');
  if (!/Size: est\. revenue/.test(txt) || !/Brightness: users/.test(txt)) throw new Error('the legend should say size is revenue and brightness is users');
  await A.click('#lg [data-l="close"]');
  await sleep(900);
  return 'one encoding: size = est. revenue, brightness = users';
});

await step('Every segment name is drawn', async () => {
  const names = fx.grouping.segments.map((s) => s.name);
  const drawn = await A.js(`[...(window.__appScoutLabels || [])]`);
  const missing = names.filter((n) => !drawn.includes(n) && !drawn.some((d) => d.endsWith('…') && n.startsWith(d.slice(0, -1))));
  if (missing.length) throw new Error('missing: ' + missing.join(', '));
  return `${names.length} of ${names.length} segment names on screen`;
});

await step('Lenses sit in the bar under the map', async () => {
  await A.waitFor(`document.getElementById('lbar').style.display !== 'none'`, 'the lens bar');
  await A.click('#lbar [data-lens="unknown"]');
  const on = await A.js(`document.querySelector('#lbar button.on').textContent`);
  if (!on.startsWith('Unknown revenue')) throw new Error('the lens did not turn on: ' + on);
  await sleep(600);
  return `${await A.js(`[...document.querySelectorAll('#lbar button')].map((b) => b.textContent).join(' | ')`)} · on: ${on}`;
});

await step('Apps found opens a sortable table', async () => {
  await A.click('#lbar [data-lens=""]');
  await A.click('[data-m="0"]');
  await A.waitFor(`document.getElementById('modal').style.display === 'flex'`, 'the table');
  await A.js(`document.querySelector('th[data-sort="r"]').click()`);
  const first = await A.js(`document.querySelector('#modal tbody tr td').textContent`);
  return `sorted by revenue, first row: ${first}`;
});

let picked = '';
await step('Selecting a row shows the app on the map', async () => {
  picked = await A.js(`document.querySelector('#modal tbody tr td').textContent`);
  await A.js(`document.querySelector('#modal tbody tr').click()`);
  await A.waitFor(`document.querySelector('#pn .t').textContent === ${JSON.stringify(picked)}`, 'the panel to show the app');
  await sleep(900);
  return picked;
});

// The plugin's monitor and prompt hook, started from this process the way Claude Code starts
// them next to the MCP server: they find the server through its live file.
const plugin = (script) => spawn(process.execPath, [join(root, 'server', script), data], { env: { ...process.env, CLAUDE_PLUGIN_DATA: data }, stdio: ['ignore', 'pipe', 'ignore'] });
const watch = plugin('watch.mjs');
procs.push(watch);
let notified = '';
watch.stdout.on('data', (d) => (notified += d));

let qid = '';
await step('Ask Claude: the monitor hands the question to Claude', async () => {
  await sleep(800); // the monitor finds the server and starts waiting
  await A.click('[data-a="ask"]');
  await A.click('[data-s]');
  await A.click('[data-a="send"]');
  await A.waitFor(`(document.getElementById('ast') || {}).textContent?.includes('Claude has your question')`, '"Claude has your question" on the page');
  const line = notified.trim().split('\n').at(-1) || '';
  qid = (line.match(/question (q-[a-f0-9]+)/) || [])[1];
  if (!qid || !/map context: \{.*"focus"/.test(line)) throw new Error('the monitor printed no question with its context: ' + line);
  return `monitor notification: ${line.slice(0, 90)}…`;
});

await step('A second copy of the map opens alongside', async () => {
  B = await openTab();
  await B.go(link);
  await B.waitFor(`document.getElementById('stat').textContent.includes('46 apps')`, 'the second page');
  shotOf = B;
  await sleep(900);
  return 'same link, same session, both pages live';
});

await step("Claude's answer reaches both pages", async () => {
  const r = await tool('answer_question', { session: SESSION, question_id: qid, answer: `E2E answer for ${picked}: it earns from subscriptions (est., App Store in-app purchases).` });
  if (r.isError) throw new Error(r.content[0].text);
  await B.waitFor(`document.getElementById('toast').textContent.startsWith('Claude answered')`, 'the answer toast on the second page');
  await A.waitFor(`(document.getElementById('ans') || {}).innerText?.includes('E2E answer')`, 'the answer in the first page panel');
  return 'the asking page shows the answer in place; the second page announced it';
});

await step('Without the monitor, the next message carries the question', async () => {
  await new Promise((r) => { watch.on('exit', r); watch.kill(); });
  await sleep(5500); // the page stops counting on a monitor a few seconds after it goes
  await A.click('[data-a="done"]');
  await A.click('[data-a="ask"]');
  await A.click('[data-s]:nth-of-type(2)');
  await A.click('[data-a="send"]');
  await A.waitFor(`(document.getElementById('ast') || {}).textContent?.includes('send any message')`, 'the "send any message" hint');
  shotOf = A;
  const hint = await A.js(`document.getElementById('ast').textContent`);
  const hook = plugin('hook.mjs');
  const out = await new Promise((r) => { let o = ''; hook.stdout.on('data', (d) => (o += d)); hook.on('exit', () => r(o)); });
  if (!/Questions the user asked on the App Scout map:\n\[App Scout map question q-/.test(out)) throw new Error('the hook attached nothing: ' + out);
  await A.waitFor(`(document.getElementById('ast') || {}).textContent?.includes('Claude has your question')`, 'the page to see Claude got it');
  return `page said "${hint.slice(0, 60)}…"; the hook attached the question`;
});

await step('A plan from Claude shows on every open page', async () => {
  const r = await tool('plan_research', { idea: 'Meeting notes app for Vietnamese small teams', customers: ['SMB teams', 'Freelancers'], forms: ['Mobile app', 'Chrome extension'], segments: [{ name: 'Meeting assistant', phrases: ['ai meeting notes'] }, { name: 'Voice notes', phrases: ['voice notes'] }], apps: 50 });
  if (!/\?plan=plan-/.test(mapLink(r))) throw new Error('plan_research gave no plan link');
  for (const P of [A, B]) await P.waitFor(`document.querySelector('#pn .t').textContent === 'Research plan'`, 'the plan');
  return 'pushed to both pages; the plan link opens it too';
});

await step('While a scout runs, Scout and its controls are off', async () => {
  await A.go(link.replace(/s=[^&]+/, `s=${RUNNING}`));
  await A.waitFor(`document.getElementById('stat').textContent.startsWith('Scouting')`, 'the running scout');
  const st = await A.js(`({ scout: document.getElementById('bScout').disabled, apps: document.getElementById('nApps').disabled, label: document.getElementById('bScout').textContent.trim() })`);
  if (!st.scout || !st.apps || st.label !== 'Scouting…') throw new Error('controls still on: ' + JSON.stringify(st));
  await A.go(link);
  await A.waitFor(`document.getElementById('stat').textContent.includes('46 apps')`, 'the finished session');
  const back = await A.js(`!document.getElementById('bScout').disabled && !document.getElementById('nApps').disabled`);
  if (!back) throw new Error('controls stay off after the scout');
  shotOf = A;
  await A.go(link.replace(/s=[^&]+/, `s=${RUNNING}`));
  await A.waitFor(`document.getElementById('bScout').disabled`, 'the disabled Scout button');
  return 'Scout and the app count read "Scouting…" and are off while crawling; back on for a finished session';
});

await step('Export downloads the report', async () => {
  await A.go(link);
  await A.waitFor(`document.getElementById('stat').textContent.includes('46 apps')`, 'the map');
  const ok = await A.js(`fetch('/export?s=${SESSION}&f=md&parts=apps,segments&t=' + new URLSearchParams(location.search).get('t')).then((r) => r.ok && r.headers.get('content-disposition'))`);
  if (!ok) throw new Error('the export link failed');
  await A.js(`document.getElementById('bExport').click()`);
  return ok;
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
