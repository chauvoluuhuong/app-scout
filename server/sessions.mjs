// Sessions are plain JSON files, one per research, in the plugin's data directory
// (${CLAUDE_PLUGIN_DATA}, kept across plugin updates) or ~/.app-scout when run on its own.
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
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
  if (cache.has(id)) return cache.get(id);
  const f = file(id);
  if (!existsSync(f)) throw new Error(`No session "${id}". Use list_sessions to see saved sessions.`);
  const s = JSON.parse(readFileSync(f, 'utf8'));
  cache.set(id, s);
  return s;
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
  s.updated = nowIso();
  const f = file(s.id);
  writeFileSync(f + '.tmp', JSON.stringify(s));
  renameSync(f + '.tmp', f);
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
