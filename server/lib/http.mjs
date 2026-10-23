// Polite HTTP client: one request at a time per host, a minimum gap between requests,
// and a back-off that honours 429/503 and Retry-After. It never rotates IPs or disguises
// itself; when a site asks us to slow down, we slow down.
import { sleep } from './util.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 app-scout/0.1';

// Minimum milliseconds between two requests to the same host.
const GAP = {
  'itunes.apple.com': 3000, // Apple documents roughly 20 calls a minute for the Search API
  'apps.apple.com': 1500,
  'play.google.com': 1500,
  'chromewebstore.google.com': 1500,
  'workspace.google.com': 1500,
  'api.github.com': 1200,
  'github.com': 1500,
};
const DEFAULT_GAP = 1500;

const queues = new Map(); // host -> { tail: Promise, last: number }
let listener = () => {};

/** Receive { type: 'slowed' | 'resumed', host, waitMs } events, for the progress view. */
export function onHttpEvent(fn) {
  listener = fn;
}

function hostOf(url) {
  return new URL(url).host;
}

async function attempt(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opts.headers || {}) },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function run(url, opts) {
  const host = hostOf(url);
  const retries = opts.retries ?? 3;
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await attempt(url, opts);
    } catch (e) {
      if (i >= retries) throw new Error(`network error for ${host}: ${e.message}`);
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (res.ok) return opts.json ? res.json() : res.text();
    if ((res.status === 429 || res.status === 503 || res.status >= 500) && i < retries) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 30000 * 2 ** i;
      listener({ type: 'slowed', host, waitMs: wait, status: res.status });
      await sleep(wait);
      listener({ type: 'resumed', host });
      continue;
    }
    const err = new Error(`HTTP ${res.status} from ${host}`);
    err.status = res.status;
    throw err;
  }
}

/** GET a URL, queued per host so we never send two requests to one site at once. */
export function get(url, opts = {}) {
  if (opts.params) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(opts.params)) if (v != null) u.searchParams.set(k, String(v));
    url = u.toString();
  }
  const host = hostOf(url);
  const q = queues.get(host) || { tail: Promise.resolve(), last: 0 };
  queues.set(host, q);
  const gap = GAP[host] ?? DEFAULT_GAP;
  const job = q.tail.then(async () => {
    const wait = q.last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await run(url, opts);
    } finally {
      q.last = Date.now();
    }
  });
  q.tail = job.catch(() => {});
  return job;
}

export const getText = (url, opts) => get(url, { ...opts, json: false });
export const getJson = (url, opts) => get(url, { ...opts, json: true });
