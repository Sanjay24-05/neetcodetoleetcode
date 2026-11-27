// Draws the extension icon (orange rounded square with a dark arrow) as PNGs in icons/. Run once; the PNGs are committed.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Shape in unit coordinates (0..1). Returns [r,g,b,a] or null.
const ORANGE = [255, 161, 22], DARK = [26, 26, 26];
function shade(x, y) {
  const r = 0.2, m = 0.02; // corner radius, margin
  const cx = Math.min(Math.max(x, m + r), 1 - m - r), cy = Math.min(Math.max(y, m + r), 1 - m - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;
  const shaft = y > 0.44 && y < 0.56 && x > 0.2 && x < 0.62;
  const dx = x - 0.5; // arrow head: triangle from x=0.5 to tip at x=0.82
  const head = dx >= 0 && x <= 0.82 && Math.abs(y - 0.5) <= 0.27 * (1 - dx / 0.32);
  return shaft || head ? DARK : ORANGE;
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const S = 4, out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = shade((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (py * size + px) * 4;
    if (a) { out[i] = r / a; out[i + 1] = g / a; out[i + 2] = b / a; out[i + 3] = (255 * a) / (S * S); }
  }
  writeFileSync(`icons/icon${size}.png`, png(size, out));
}
console.log('wrote icons/icon{16,32,48,128}.png');
