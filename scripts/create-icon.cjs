const fs = require('node:fs');
const path = require('node:path');
// A small uncompressed ICO, generated from our own vector geometry.
const size = 64, pixels = Buffer.alloc(size * size * 4);
function polygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  let color = [79, 70, 229];
  if ((Math.abs(x - 32) < 2 && y >= 16 && y <= 48) || (Math.abs(y - 24) < 2 && x >= 18 && x <= 32) || (Math.abs(y - 40) < 2 && x >= 32 && x <= 46)) color = [199, 210, 254];
  if ((x - 18) ** 2 + (y - 24) ** 2 < 36 || (x - 46) ** 2 + (y - 40) ** 2 < 36) color = [255, 255, 255];
  if (polygon(x, y, [[35,11],[24,34],[33,34],[29,53],[42,28],[33,28]])) color = [250, 204, 21];
  const i = ((size - 1 - y) * size + x) * 4;
  pixels.set([color[2], color[1], color[0], 255], i);
}
const mask = Buffer.alloc(size * size / 8), dib = Buffer.alloc(40), header = Buffer.alloc(22);
dib.writeUInt32LE(40); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8); dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(pixels.length, 20);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = size; header[7] = size; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(dib.length + pixels.length + mask.length, 14); header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(__dirname, '../public/flashmap.ico'), Buffer.concat([header, dib, pixels, mask]));
