import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const sourceDirectory = fileURLToPath(new URL('../art/demos/', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../public/demos/', import.meta.url));
const filenames = [
  'unix-workstation',
  'retro-gaming',
  'commodore-desktop',
  'apple-desktop',
];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function parseXpm(source, filename) {
  const strings = [...source.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
    JSON.parse(`"${match[1]}"`),
  );
  if (strings.length < 3) throw new Error(`${filename}: incomplete XPM`);

  const [width, height, colorCount, charsPerPixel] = strings[0].split(/\s+/).map(Number);
  if (!width || !height || colorCount !== 2 || charsPerPixel !== 1) {
    throw new Error(`${filename}: expected a two-color, one-character-per-pixel XPM`);
  }

  const colors = new Map();
  for (const definition of strings.slice(1, 1 + colorCount)) {
    const match = definition.match(/^(.)\s+c\s+(#[0-9a-f]{6})$/i);
    if (!match) throw new Error(`${filename}: unsupported color definition ${definition}`);
    colors.set(match[1], match[2].toLowerCase());
  }
  const black = [...colors].find(([, color]) => color === '#000000')?.[0];
  const white = [...colors].find(([, color]) => color === '#ffffff')?.[0];
  if (!black || !white) throw new Error(`${filename}: colors must be #000000 and #FFFFFF`);

  const rows = strings.slice(1 + colorCount, 1 + colorCount + height);
  if (rows.length !== height || rows.some((row) => row.length !== width)) {
    throw new Error(`${filename}: pixel rows do not match ${width} × ${height}`);
  }
  return { width, height, rows, white };
}

function encodeOneBitPng({ width, height, rows, white }) {
  const bytesPerRow = Math.ceil(width / 8);
  const scanlines = Buffer.alloc((bytesPerRow + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (bytesPerRow + 1);
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x] === white) {
        scanlines[rowOffset + 1 + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1;
  header[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const filename of filenames) {
  const source = readFileSync(`${sourceDirectory}${filename}.xpm`, 'utf8');
  const bitmap = parseXpm(source, filename);
  writeFileSync(`${outputDirectory}${filename}.png`, encodeOneBitPng(bitmap));
  console.log(`Built ${filename}.png from ${filename}.xpm (${bitmap.width} × ${bitmap.height})`);
}
