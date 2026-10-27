// Local web server on 127.0.0.1 only: serves the map page, a small JSON API for its buttons,
// exports, and a WebSocket that pushes live updates. The same link can be open in several
// places at once (Claude's in-app browser and a normal browser tab); every page watching a
// session gets the same pushes, and all state lives here, so they stay in step.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accept } from './ws.mjs';
import { subscribe } from '../bus.mjs';
import { log } from '../lib/util.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const UI_FILE = join(here, '..', '..', 'ui', 'app.html');

const TOKEN = process.env.APP_SCOUT_DEV_TOKEN || randomBytes(16).toString('hex');
let PORT = null;
let handler = null; // (action, args) => Promise<result>
const clients = new Set(); // { conn, session }

export const webReady = () => PORT != null;

/** Links the view uses. Null until the server is listening. */
export function webInfo(sessionId) {
  if (PORT == null) return null;
  const base = `http://127.0.0.1:${PORT}`;
  return {
    origin: base,
    url: `${base}/?s=${encodeURIComponent(sessionId || '')}&t=${TOKEN}`,
    ws: `ws://127.0.0.1:${PORT}/ws?t=${TOKEN}&s=${encodeURIComponent(sessionId || '')}`,
    api: `${base}/api`,
    token: TOKEN,
  };
}

/** Send to every connected page watching `session`. */
export function sendTo(session, msg) {
  let n = 0;
  for (const c of clients) {
    if (c.session === session) {
      c.conn.send(msg);
      n++;
    }
  }
  return n;
}

/** Send to every connected page, whatever it is watching (a new session, a new plan). */
export function broadcast(msg) {
  for (const c of clients) c.conn.send(msg);
  return clients.size;
}

function okHost(req) {
  const h = req.headers.host || '';
  return h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`;
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (!okHost(req)) return send(res, 403, { error: 'Bad host' });
  if (url.searchParams.get('t') !== TOKEN) return send(res, 403, { error: 'Missing or wrong token' });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', { ...cors, 'Access-Control-Allow-Methods': 'GET, POST' });

  if (url.pathname === '/' && req.method === 'GET') {
    return send(res, 200, readFileSync(UI_FILE), 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ; img-src 'self' data:" });
  }
  if (url.pathname === '/api/action' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'Invalid JSON' }, undefined, cors);
    }
    try {
      return send(res, 200, await handler(body.action, body.args || {}), undefined, cors);
    } catch (e) {
      return send(res, 400, { error: e.message }, undefined, cors);
    }
  }
  if (url.pathname === '/export' && req.method === 'GET') {
    try {
      const r = await handler('export', { session: url.searchParams.get('s'), format: url.searchParams.get('f') || 'json', parts: (url.searchParams.get('parts') || '').split(',').filter(Boolean) });
      return send(res, 200, r.text, `${r.mimeType}; charset=utf-8`, { 'Content-Disposition': `attachment; filename="${r.filename}"` });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

export function startWeb(actionHandler) {
  handler = actionHandler;
  const server = createServer((req, res) => {
    route(req, res).catch((e) => send(res, 500, { error: e.message }));
  });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (!okHost(req) || url.pathname !== '/ws' || url.searchParams.get('t') !== TOKEN) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const conn = accept(req, socket);
    if (!conn) return;
    const client = { conn, session: url.searchParams.get('s') || null };
    clients.add(client);
    conn.onclose = () => clients.delete(client);
    conn.onmessage = async (msg) => {
      try {
        if (msg.type === 'sub') client.session = msg.session;
        else if (msg.type === 'action') conn.send({ type: 'result', id: msg.id, result: await handler(msg.action, msg.args || {}) });
      } catch (e) {
        conn.send({ type: 'result', id: msg.id, error: e.message });
      }
    };
    conn.send({ type: 'hello' });
  });

  // Push session changes to everyone watching that session (coalesced to ~3 per second).
  const pending = new Map();
  subscribe((e) => {
    if (pending.has(e.session)) {
      if (e.kind === 'phase') pending.get(e.session).kind = 'phase';
      return;
    }
    const entry = { kind: e.kind };
    pending.set(e.session, entry);
    setTimeout(() => {
      pending.delete(e.session);
      sendTo(e.session, { type: 'changed', session: e.session, kind: entry.kind });
    }, 300);
  });

  return new Promise((resolve) => {
    let port = 4777;
    const tryListen = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 4797) {
          port++;
          tryListen();
        } else {
          log('web server not started:', err.message);
          resolve(null);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        PORT = port;
        log(`map page on http://127.0.0.1:${port}`);
        resolve(port);
      });
    };
    tryListen();
  });
}
