// Small helpers shared by the server. Standard library only.

export const log = (...a) => process.stderr.write('[app-scout] ' + a.join(' ') + '\n');

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** '41,000,000' -> 41000000, '43.2K' -> 43200, '4M+' -> 4000000. */
export function parseCount(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Math.round(s);
  const m = String(s).match(/([\d.,]+)\s*([KMB])?/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(v)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(v * mult);
}

/** 1234567 -> 1.2M */
export function human(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  for (const [d, s] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) {
    if (a >= d) return (n / d).toFixed(1).replace(/\.0$/, '') + s;
  }
  return String(Math.round(n));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function unescapeHtml(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9#]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
}

/** HTML -> visible text, one chunk per line. Scripts and styles dropped. */
export function pageText(raw) {
  let s = raw.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '\n');
  s = unescapeHtml(s);
  return s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function afterLine(lines, label) {
  const i = lines.indexOf(label);
  return i >= 0 && i + 1 < lines.length ? lines[i + 1] : null;
}

export function uniq(list) {
  return [...new Set(list)];
}

/** Deterministic 0..1 random generator seeded from a string, for stable map layouts. */
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slug(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 48) || 'item';
}

/** Share of the query's words (3+ letters) found in the app's name or summary. */
export function queryMatch(q, row) {
  const words = (q.toLowerCase().match(/\w+/g) || []).filter((w) => w.length > 2);
  if (!words.length) return 1;
  const text = `${row.name || ''} ${row.summary || ''}`.toLowerCase();
  return Math.round((words.filter((w) => text.includes(w)).length / words.length) * 100) / 100;
}
