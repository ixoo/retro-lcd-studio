import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const WIDTH = 320;
const HEIGHT = 200;
const outputDirectory = fileURLToPath(new URL('../public/demos/', import.meta.url));

const FONT = {
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111', J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00010/00100/01000/11111', 3: '11110/00001/00001/01110/00001/00001/11110',
  4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/10000/11110/00001/00001/11110',
  6: '01110/10000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110', 9: '01110/10001/10001/01111/00001/00001/01110',
  '.': '00000/00000/00000/00000/00000/00110/00110', ':': '00000/00110/00110/00000/00110/00110/00000',
  '-': '00000/00000/00000/11111/00000/00000/00000', '/': '00001/00010/00100/01000/10000/00000/00000',
  '>': '10000/01000/00100/00010/00100/01000/10000', '<': '00001/00010/00100/01000/00100/00010/00001',
  '+': '00000/00100/00100/11111/00100/00100/00000', '=': '00000/11111/00000/11111/00000/00000/00000',
  '*': '00000/10101/01110/11111/01110/10101/00000', '_': '00000/00000/00000/00000/00000/00000/11111',
  '?': '01110/10001/00001/00010/00100/00000/00100', '!': '00100/00100/00100/00100/00100/00000/00100',
  '[': '01110/01000/01000/01000/01000/01000/01110', ']': '01110/00010/00010/00010/00010/00010/01110',
};

function canvas(fill = 0) {
  return new Uint8Array(WIDTH * HEIGHT).fill(fill);
}

function setPixel(target, x, y, color = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) target[y * WIDTH + x] = color;
}

function fillRect(target, x, y, width, height, color = 1) {
  for (let row = Math.max(0, y); row < Math.min(HEIGHT, y + height); row += 1) {
    target.fill(color, row * WIDTH + Math.max(0, x), row * WIDTH + Math.min(WIDTH, x + width));
  }
}

function rect(target, x, y, width, height, color = 1, thickness = 1) {
  fillRect(target, x, y, width, thickness, color);
  fillRect(target, x, y + height - thickness, width, thickness, color);
  fillRect(target, x, y, thickness, height, color);
  fillRect(target, x + width - thickness, y, thickness, height, color);
}

function line(target, x0, y0, x1, y1, color = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    setPixel(target, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function circle(target, centerX, centerY, radius, color = 1, filled = false) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = x * x + y * y;
      if (filled ? distance <= radius * radius : Math.abs(distance - radius * radius) <= radius) {
        setPixel(target, centerX + x, centerY + y, color);
      }
    }
  }
}

function text(target, value, x, y, color = 1, scale = 1) {
  let cursor = x;
  for (const rawCharacter of value) {
    const character = rawCharacter.toUpperCase();
    const glyph = (FONT[character] ?? FONT['?']).split('/');
    glyph.forEach((row, rowIndex) => row.split('').forEach((bit, columnIndex) => {
      if (bit === '1') fillRect(target, cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
    }));
    cursor += 6 * scale;
  }
}

function checker(target, x, y, width, height, color = 1, period = 2) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if ((Math.floor(column / period) + Math.floor(row / period)) % 2 === 0) setPixel(target, column, row, color);
    }
  }
}

function lightWindow(target, x, y, width, height, title) {
  fillRect(target, x, y, width, height, 0);
  rect(target, x, y, width, height, 1);
  fillRect(target, x, y + 10, width, 1, 1);
  text(target, title, x + 4, y + 2, 1);
  rect(target, x + width - 9, y + 2, 6, 6, 1);
}

function darkWindow(target, x, y, width, height, title) {
  fillRect(target, x, y, width, height, 1);
  rect(target, x, y, width, height, 0);
  fillRect(target, x, y, width, 10, 0);
  text(target, title, x + 4, y + 2, 1);
  rect(target, x + width - 9, y + 2, 6, 6, 1);
}

function unixWorkstation() {
  const target = canvas(1);
  fillRect(target, 0, 0, WIDTH, 11, 0);
  text(target, 'WORKSPACE  FILE  TOOLS', 5, 2, 1);
  text(target, '14:37', 284, 2, 1);
  for (let y = 15; y < HEIGHT; y += 8) for (let x = 3; x < WIDTH; x += 8) setPixel(target, x, y, 0);

  darkWindow(target, 5, 17, 154, 82, 'TERMINAL');
  ['SUN% UNAME -A', 'UNIX 4.3BSD WORKSTATION', 'SUN% LS /USR', 'BIN  LIB  LOCAL  SPOOL', 'SUN% PS -A', 'PID  TTY   TIME COMMAND', '128  P0    0:02 SHELL', 'SUN% _'].forEach((value, index) => text(target, value, 10, 31 + index * 8, 0));

  darkWindow(target, 165, 17, 80, 65, 'SYSTEM');
  text(target, 'CPU', 170, 31, 0);
  const bars = [8, 15, 11, 20, 13, 24, 17, 29, 21, 16, 25, 19];
  bars.forEach((height, index) => fillRect(target, 172 + index * 5, 70 - height, 3, height, 0));
  line(target, 170, 71, 236, 71, 0);
  text(target, 'MEM 72%', 170, 73, 0);

  darkWindow(target, 250, 17, 65, 65, 'CLOCK');
  circle(target, 282, 52, 20, 0);
  line(target, 282, 52, 282, 37, 0);
  line(target, 282, 52, 296, 46, 0);

  darkWindow(target, 5, 105, 123, 90, 'EDITOR NOTES');
  ['SYSTEM CHECKLIST', '[*] NETWORK', '[*] STORAGE', '[ ] BACKUP', '', 'NEXT WINDOW:', '23 MAY 1988'].forEach((value, index) => text(target, value, 10, 119 + index * 9, 0));

  darkWindow(target, 134, 88, 181, 107, 'FILE MANAGER /USR');
  const folders = [['BIN', 145, 108], ['LIB', 198, 108], ['MAN', 251, 108], ['LOCAL', 145, 148], ['GAMES', 198, 148], ['TMP', 251, 148]];
  folders.forEach(([label, x, y]) => {
    fillRect(target, x, y + 3, 29, 17, 1);
    rect(target, x, y + 3, 29, 17, 0);
    fillRect(target, x + 3, y, 10, 4, 0);
    text(target, label, x, y + 24, 0);
  });
  line(target, 129, 165, 137, 176, 0); line(target, 137, 176, 132, 176, 0); line(target, 137, 176, 139, 181, 0);
  return target;
}

function retroGaming() {
  const target = canvas(1);
  text(target, 'SCORE 053470', 5, 3, 0);
  text(target, 'CRYSTAL 180', 115, 3, 0);
  text(target, 'WAVE 04', 230, 3, 0);
  fillRect(target, 0, 13, WIDTH, 1, 0);
  for (const [x, y] of [[12, 25], [39, 42], [63, 27], [91, 50], [126, 31], [153, 43], [185, 25], [219, 52], [278, 31], [306, 57]]) setPixel(target, x, y, 0);
  circle(target, 40, 46, 14, 0);
  for (let y = 38; y <= 54; y += 4) line(target, 29, y, 51, y - 3, 0);

  // Player ship and projectiles.
  fillRect(target, 53, 78, 22, 5, 0); line(target, 53, 78, 45, 82, 0); line(target, 53, 82, 45, 82, 0);
  line(target, 61, 77, 67, 71, 0); line(target, 64, 78, 71, 82, 0); fillRect(target, 76, 80, 8, 2, 0);
  fillRect(target, 94, 79, 5, 2, 0); fillRect(target, 107, 79, 3, 2, 0);

  // Floating platforms, crystals, enemies, and explosion.
  for (const [x, y] of [[124, 68], [218, 74], [270, 58]]) {
    fillRect(target, x, y, 35, 4, 0); line(target, x, y + 4, x + 8, y + 10, 0); line(target, x + 34, y + 4, x + 27, y + 10, 0);
    line(target, x + 17, y - 17, x + 10, y - 7, 0); line(target, x + 17, y - 17, x + 24, y - 7, 0); line(target, x + 10, y - 7, x + 17, y, 0); line(target, x + 24, y - 7, x + 17, y, 0);
  }
  circle(target, 171, 81, 7, 0, true); circle(target, 171, 81, 13, 0); line(target, 151, 81, 191, 81, 0); line(target, 171, 61, 171, 101, 0);
  for (const [x, y] of [[202, 46], [248, 99]]) { circle(target, x, y, 7, 0); fillRect(target, x - 3, y - 2, 2, 2, 1); fillRect(target, x + 2, y - 2, 2, 2, 1); line(target, x - 5, y + 7, x - 9, y + 12, 0); line(target, x + 5, y + 7, x + 9, y + 12, 0); }

  // Alien terrain.
  const terrain = [[0, 125], [18, 118], [31, 139], [52, 133], [68, 147], [89, 139], [111, 153], [133, 142], [154, 160], [178, 146], [202, 155], [224, 137], [246, 146], [268, 129], [291, 140], [319, 124]];
  for (let index = 1; index < terrain.length; index += 1) line(target, ...terrain[index - 1], ...terrain[index], 0);
  for (let x = 0; x < WIDTH; x += 1) {
    const segment = terrain.findIndex((point) => point[0] >= x);
    const right = terrain[Math.max(1, segment)]; const left = terrain[Math.max(0, segment - 1)];
    const top = Math.round(left[1] + (right[1] - left[1]) * ((x - left[0]) / Math.max(1, right[0] - left[0])));
    if (x % 3 !== 0) fillRect(target, x, top + 2, 1, HEIGHT - top - 2, 0);
  }
  for (let x = 8; x < WIDTH; x += 25) { line(target, x, 190, x + 4, 176, 1); line(target, x + 4, 176, x + 8, 190, 1); }
  rect(target, 257, 19, 57, 29, 0); line(target, 262, 40, 273, 31, 0); line(target, 273, 31, 286, 38, 0); line(target, 286, 38, 308, 25, 0);
  return target;
}

function commodoreDesktop() {
  const target = canvas(0);
  fillRect(target, 0, 0, WIDTH, 11, 1);
  text(target, 'FILE  EDIT  VIEW  DESK', 5, 2, 0);
  text(target, '10:24', 285, 2, 0);
  checker(target, 0, 12, WIDTH, HEIGHT - 12, 1, 2);

  // Desktop icons.
  for (const [label, x, y] of [['SYSTEM', 7, 22], ['WORK', 7, 57], ['TRASH', 7, 96], ['PROJECTS', 7, 139]]) {
    fillRect(target, x, y, 28, 22, 0); rect(target, x, y, 28, 22, 1);
    if (label === 'TRASH') { line(target, x + 7, y + 6, x + 21, y + 6); rect(target, x + 9, y + 7, 11, 12); }
    else { fillRect(target, x + 4, y + 4, 20, 5, 1); rect(target, x + 4, y + 4, 20, 14, 1); }
    fillRect(target, x - 1, y + 24, Math.min(42, label.length * 6 + 2), 9, 0); text(target, label, x, y + 25, 1);
  }

  lightWindow(target, 48, 18, 175, 91, 'PAINT - LANDSCAPE.PIC');
  rect(target, 53, 32, 26, 69, 1); line(target, 53, 50, 79, 50); line(target, 53, 69, 79, 69); line(target, 53, 87, 79, 87);
  line(target, 60, 43, 71, 33); circle(target, 65, 60, 5); fillRect(target, 60, 77, 10, 8, 1);
  rect(target, 83, 32, 134, 63, 1);
  line(target, 87, 83, 118, 53); line(target, 118, 53, 137, 72); line(target, 137, 72, 160, 44); line(target, 160, 44, 193, 82);
  for (let x = 92; x < 211; x += 9) { line(target, x, 90, x + 7, 74); line(target, x + 7, 74, x + 13, 90); }
  line(target, 84, 85, 216, 85); line(target, 117, 94, 153, 72); line(target, 153, 72, 189, 94);

  lightWindow(target, 229, 18, 86, 91, 'CALCULATOR');
  fillRect(target, 235, 32, 73, 13, 0); rect(target, 235, 32, 73, 13, 1); text(target, '12345', 271, 35, 1);
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
    rect(target, 235 + column * 18, 49 + row * 13, 17, 12, 1);
    text(target, String((row * 4 + column) % 10), 241 + column * 18, 51 + row * 13, 1);
  }

  lightWindow(target, 48, 116, 120, 79, 'NOTEPAD - TODO.TXT');
  ['TODO LIST', '---------', '[ ] FINISH REPORT', '[*] SAVE BACKUP', '[ ] CALL AT 3PM'].forEach((value, index) => text(target, value, 54, 130 + index * 10, 1));
  lightWindow(target, 174, 116, 141, 79, 'FILES: WORK DISK');
  ['BUDGET.XLS  12K', 'SUMMARY.TXT 04K', 'GRAPH.PIC   18K', 'PROGRAM.PRG 23K', 'NOTES.TXT   02K'].forEach((value, index) => text(target, value, 181, 132 + index * 10, 1));
  line(target, 218, 102, 225, 114, 1); line(target, 225, 114, 220, 113, 1); line(target, 225, 114, 228, 119, 1);
  return target;
}

function appleDesktop() {
  const target = canvas(0);
  fillRect(target, 0, 0, WIDTH, 11, 1);
  // Generic system mark rather than a logo.
  fillRect(target, 5, 3, 6, 5, 0); setPixel(target, 8, 2, 0);
  text(target, 'FILE  EDIT  VIEW  SPECIAL', 18, 2, 0);
  text(target, '4:20 PM', 274, 2, 0);

  lightWindow(target, 8, 20, 110, 74, 'SYSTEM DISK');
  for (const [label, x, y] of [['SYSTEM', 18, 39], ['UTIL', 52, 39], ['CONTROL', 86, 39], ['README', 18, 68]]) {
    fillRect(target, x, y + 3, 24, 15, 0); rect(target, x, y + 3, 24, 15, 1); fillRect(target, x + 3, y, 9, 4, 1); text(target, label, x, y + 21, 1);
  }

  lightWindow(target, 124, 28, 154, 116, 'QUARTERLY REPORT');
  text(target, 'QUARTERLY REPORT', 135, 44, 1, 2);
  fillRect(target, 135, 61, 132, 1, 1);
  text(target, 'A REVIEW OF OPERATIONS', 136, 66, 1);
  for (let row = 0; row < 7; row += 1) {
    fillRect(target, 136, 81 + row * 7, 42 - (row % 3) * 5, 1, 1);
    fillRect(target, 220, 81 + row * 7, 42 - ((row + 1) % 3) * 5, 1, 1);
  }
  rect(target, 181, 80, 31, 48, 1);
  [12, 20, 28, 37].forEach((height, index) => fillRect(target, 185 + index * 6, 124 - height, 4, height, 1));

  lightWindow(target, 12, 106, 105, 82, 'CONTROL PANEL');
  text(target, 'SCREEN', 18, 121, 1); rect(target, 18, 131, 31, 34, 1); fillRect(target, 22, 135, 23, 22, 1);
  text(target, 'MOUSE', 59, 121, 1); rect(target, 58, 132, 47, 33, 1); line(target, 65, 144, 97, 144, 1); fillRect(target, 80, 140, 3, 9, 1);
  text(target, 'SLOW   FAST', 61, 154, 1);
  line(target, 58, 174, 105, 174, 1); fillRect(target, 82, 170, 3, 9, 1);

  for (const [label, x, y, kind] of [['DISK', 288, 25, 'disk'], ['WORK', 288, 62, 'disk'], ['PROJECTS', 286, 101, 'folder'], ['NOTES', 290, 140, 'doc'], ['TRASH', 288, 173, 'trash']]) {
    if (kind === 'disk') { rect(target, x, y, 22, 23, 1); fillRect(target, x + 4, y + 3, 14, 7, 1); }
    if (kind === 'folder') { rect(target, x, y + 4, 26, 18, 1); fillRect(target, x + 3, y, 10, 5, 1); }
    if (kind === 'doc') { rect(target, x + 4, y, 16, 22, 1); line(target, x + 7, y + 7, x + 17, y + 7); line(target, x + 7, y + 11, x + 17, y + 11); }
    if (kind === 'trash') { rect(target, x + 4, y + 5, 16, 18, 1); line(target, x + 2, y + 4, x + 22, y + 4); }
    text(target, label, x - 2, y + 26, 1);
  }
  line(target, 199, 161, 207, 174, 1); line(target, 207, 174, 202, 173, 1); line(target, 207, 174, 210, 180, 1);
  return target;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
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

function encodeOneBitPng(pixels) {
  const bytesPerRow = Math.ceil(WIDTH / 8);
  const scanlines = Buffer.alloc((bytesPerRow + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const rowOffset = y * (bytesPerRow + 1);
    for (let x = 0; x < WIDTH; x += 1) {
      if (pixels[y * WIDTH + x] === 0) scanlines[rowOffset + 1 + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 1; // One-bit samples.
  header[9] = 0; // Grayscale, where 0 is black and 1 is white.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outputDirectory, { recursive: true });
for (const demo of [
  { filename: 'unix-workstation.png', pixels: unixWorkstation() },
  { filename: 'retro-gaming.png', pixels: retroGaming() },
  { filename: 'commodore-desktop.png', pixels: commodoreDesktop() },
  { filename: 'apple-desktop.png', pixels: appleDesktop() },
]) {
  writeFileSync(`${outputDirectory}${demo.filename}`, encodeOneBitPng(demo.pixels));
  console.log(`Generated ${demo.filename}`);
}
