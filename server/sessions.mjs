// Sessions are plain JSON files, one per research, in the plugin's data directory
// (${CLAUDE_PLUGIN_DATA}, kept across plugin updates) or ~/.app-scout when run on its own.
//
// Several App Scout servers can share this directory: Claude Desktop starts one per chat (and
// may leave an old one running), Claude Code one per session. A scout runs in one of them, but
// the map page can be open on another. So a session is read again when another server has
// written it, a stale copy never overwrites a newer file, and onExternalChange() reports writes
// made by other servers, so their pages update live.
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { nowIso, slug } from './lib/util.mjs';

export const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.app-scout');
const SESSIONS = join(DATA_DIR, 'sessions');
export const EXPORTS = join(DATA_DIR, 'exports');
mkdirSync(SESSIONS, { recursive: true });
mkdirSync(EXPORTS, { recursive: true });

const cache = new Map();
const timers = new Map();
const stamps = new Map(); // id -> mtime of the file when this server last read or wrote it
const pinned = new Set();  // sessions this server is crawling: its copy is the live one

const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

/** While this server crawls a session, its in-memory copy wins over the file. */
export const pin = (id) => pinned.add(id);
export const unpin = (id) => pinned.delete(id);

function file(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid session id: ${id}`);
  return join(SESSIONS, `${id}.json`);
}

export function newSession({ name, topic = null, stores, market = 'us', apps = 100, plan = null }) {
  const id = `${slug(name || topic || 'scout')}-${randomBytes(3).toString('hex')}`;
  const s = {
    id,
    name: name || (topic ? `${topic} (${market.toUpperCase()})` : `Overview ${market.toUpperCase()}`),
    created: nowIso(),
    updated: nowIso(),
    market,
    topic,
    target: apps,
    stores,
    plan,
    status: 'queued', // queued | crawling | grouping | ready | failed | planned
    progress: { pct: 0, step: 'Waiting to start', perStore: {}, searches: { done: 0, total: 0 }, pricingPages: 0, reviewsRead: 0 },
    apps: [],
    grouping: null, // { segments, keywords, openings, by, at }
    questions: [],
    view: { sizeBy: 'revenue', lens: null, focus: null },
    error: null,
  };
  cache.set(id, s);
  saveNow(s);
  return s;
}

export function getSession(id) {
  const f = file(id);
  const had = cache.get(id);
  if (had && (pinned.has(id) || mtime(f) <= (stamps.get(id) || 0))) return had;
  if (!existsSync(f)) {
    if (had) return had;
    throw new Error(`No session "${id}". Use list_sessions to see saved sessions.`);
  }
  const t = mtime(f);
  const fresh = JSON.parse(readFileSync(f, 'utf8'));
  stamps.set(id, t);
  if (!had) {
    cache.set(id, fresh);
    return fresh;
  }
  // Another server wrote it: refresh in place, so references held elsewhere stay current.
  for (const k of Object.keys(had)) delete had[k];
  return Object.assign(had, fresh);
}

export function listSessions() {
  return readdirSync(SESSIONS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const s = cache.get(f.slice(0, -5)) || JSON.parse(readFileSync(join(SESSIONS, f), 'utf8'));
        return { id: s.id, name: s.name, updated: s.updated, status: s.status, apps: s.apps.length, focused: !!s.plan, questions: s.questions.length };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

function saveNow(s) {
  const f = file(s.id);
  // Another server wrote a newer copy since we read ours, and we are not the one crawling:
  // ours is stale, so keep theirs (our next read picks it up).
  const newer = stamps.has(s.id) && mtime(f) > stamps.get(s.id);
  if (newer && !pinned.has(s.id)) return;
  // The crawling server keeps its apps and progress, but takes the questions and the view
  // another server's page added meanwhile.
  if (newer) {
    try {
      const disk = JSON.parse(readFileSync(f, 'utf8'));
      const mine = new Map(s.questions.map((q) => [q.id, q]));
      for (const q of disk.questions || []) {
        if (!mine.has(q.id)) s.questions.push(q);
        else if (q.answer && !mine.get(q.id).answer) Object.assign(mine.get(q.id), q);
      }
      s.view = { ...s.view, ...(disk.view || {}) };
    } catch {}
  }
  s.updated = nowIso();
  writeFileSync(f + '.tmp', JSON.stringify(s));
  renameSync(f + '.tmp', f);
  stamps.set(s.id, mtime(f));
}

/** Call fn(id, isNew) when another server writes a session file. */
export function onExternalChange(fn) {
  try {
    watch(SESSIONS, (_, name) => {
      if (!name || !name.endsWith('.json')) return;
      const id = name.slice(0, -5);
      const t = mtime(join(SESSIONS, name));
      if (!t || t === stamps.get(id)) return; // gone, or our own write
      fn(id, !cache.has(id));
    });
  } catch {
    // no file watching here: pages still refresh while a crawl runs
  }
}

/** Save soon (coalesces bursts of progress updates into one write a second). */
export function save(s, { now = false } = {}) {
  if (now) {
    clearTimeout(timers.get(s.id));
    timers.delete(s.id);
    return saveNow(s);
  }
  if (timers.has(s.id)) return;
  timers.set(s.id, setTimeout(() => {
    timers.delete(s.id);
    saveNow(s);
  }, 1000));
}

// ---------------------------------------------------------------- per-user preferences
const PREFS = join(DATA_DIR, 'prefs.json');
export function getPrefs() {
  try {
    return JSON.parse(readFileSync(PREFS, 'utf8'));
  } catch {
    return { tourDone: false };
  }
}
export function setPrefs(patch) {
  const p = { ...getPrefs(), ...patch };
  writeFileSync(PREFS, JSON.stringify(p));
  return p;
}
