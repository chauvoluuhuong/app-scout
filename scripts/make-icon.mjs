// Draws the listing icon (.claude-plugin/icon.png, 1024x1024): a small galaxy of app dots on a
// dark rounded square, with one amber "opening" dot. Pure Node (zlib), no image libraries.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const px = Buffer.alloc(S * S * 4);
const blend = (x, y, r, g, b, a) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4, ia = px[i + 3] / 255;
  px[i] = Math.round(r * a + px[i] * (1 - a));
  px[i + 1] = Math.round(g * a + px[i + 1] * (1 - a));
  px[i + 2] = Math.round(b * a + px[i + 2] * (1 - a));
  px[i + 3] = Math.round(255 * Math.min(1, a + ia));
};
// rounded square background
const R = 200;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const dx = Math.max(R - x, x - (S - 1 - R), 0), dy = Math.max(R - y, y - (S - 1 - R), 0);
  const d = Math.hypot(dx, dy) - R;
  const a = Math.max(0, Math.min(1, 0.5 - d));
  if (a > 0) blend(x, y, 7, 11, 9, a);
}
const disc = (cx, cy, r, c, alpha = 1) => {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
    const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5)) * alpha;
    if (a > 0) blend(x, y, c[0], c[1], c[2], a);
  }
};
const ring = (cx, cy, r, w, c) => {
  for (let y = Math.floor(cy - r - w); y <= cy + r + w; y++) for (let x = Math.floor(cx - r - w); x <= cx + r + w; x++) {
    const a = Math.max(0, Math.min(1, w / 2 - Math.abs(Math.hypot(x - cx, y - cy) - r) + 0.5));
    if (a > 0) blend(x, y, c[0], c[1], c[2], a);
  }
};
let s = 7;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const clusters = [[360, 380, [93, 202, 165]], [670, 360, [93, 202, 165]], [520, 660, [225, 251, 242]], [300, 690, [47, 107, 88]], [730, 650, [93, 202, 165]]];
for (const [cx, cy, col] of clusters) for (let i = 0; i < 26; i++) {
  const r = [7, 11, 17][Math.floor(rnd() * 3)];
  disc(cx + gauss() * 55, cy + gauss() * 45, r, col, 0.92);
}
ring(560, 470, 22, 6, [143, 179, 217]);
ring(420, 560, 15, 5, [143, 179, 217]);
disc(512, 512, 30, [239, 159, 39]);
ring(512, 512, 52, 6, [239, 159, 39]);

// PNG encode
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'icon.png');
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
