// How the map's helpers find the map server of their own Claude session.
// Each MCP server process writes live/<pid>.json (port, token, parent pid) in the data
// directory while it runs. The monitor (server/watch.mjs) and the prompt hook
// (server/hook.mjs) are started by the same Claude Code process as the MCP server, so they
// pick the server whose parent is one of their own ancestors. Standard library only.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const liveDir = (dataDir) => join(dataDir, 'live');

/** Called by the MCP server once its web server listens. Removed again on exit. */
export function register(dataDir, info) {
  const dir = liveDir(dataDir);
  // The file holds the token, so only this user may read it.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${process.pid}.json`);
  writeFileSync(file, JSON.stringify({ pid: process.pid, ppid: process.ppid, ...info }), { mode: 0o600 });
  try { chmodSync(dir, 0o700); chmodSync(file, 0o600); } catch {} // a folder or file from an older version
  const drop = () => rmSync(file, { force: true });
  process.on('exit', drop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function ancestors() {
  const out = new Set();
  let pid = process.ppid;
  for (let i = 0; i < 8 && pid > 1; i++) {
    out.add(pid);
    try { pid = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { break; }
  }
  return out;
}

/** { origin, token } of this session's map server, or null. APP_SCOUT_URL (origin?t=token) overrides. */
export function findServer(dataDir) {
  if (process.env.APP_SCOUT_URL) {
    const u = new URL(process.env.APP_SCOUT_URL);
    return { origin: u.origin, token: u.searchParams.get('t') };
  }
  let files;
  try { files = readdirSync(liveDir(dataDir)).filter((f) => f.endsWith('.json')); } catch { return null; }
  const live = [];
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync(join(liveDir(dataDir), f), 'utf8'));
      if (alive(s.pid)) live.push(s);
      else rmSync(join(liveDir(dataDir), f), { force: true });
    } catch {}
  }
  if (!live.length) return null;
  const mine = ancestors();
  // Without ps (Windows) nothing matches; then only a lone server is safe to use.
  const s = live.find((x) => mine.has(x.ppid)) || (mine.size <= 1 && live.length === 1 ? live[0] : null);
  return s && { origin: `http://127.0.0.1:${s.port}`, token: s.token };
}
