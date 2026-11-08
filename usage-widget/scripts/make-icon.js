// Generates assets/icon.ico (256x256 PNG inside an ICO): a dark disc with an orange gauge arc + needle.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const N = 256;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    const dx = x - 127.5, dy = y - 127.5, d = Math.hypot(dx, dy);
    let px = [0, 0, 0, 0];
    if (d <= 124) px = [17, 22, 29, 255];
    const ang = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise
    if (d <= 112 && d >= 92 && ang >= -135 && ang <= 135) px = [255, 107, 61, 255];
    // needle toward ~57%
    const a = (18.9 * Math.PI) / 180;
    const t = dx * Math.sin(a) - dy * Math.cos(a), perp = Math.abs(dx * Math.cos(a) + dy * Math.sin(a));
    if (t > 0 && t < 80 && perp < 5) px = [232, 238, 245, 255];
    raw.set(px, y * (N * 4 + 1) + 1 + x * 4);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); // ICO, 1 image
header[6] = 0; header[7] = 0; // 256x256 encoded as 0
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'), Buffer.concat([header, png]));
console.log('wrote assets/icon.ico', header.length + png.length, 'bytes');
