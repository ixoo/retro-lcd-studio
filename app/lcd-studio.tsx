'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BoxSelect,
  CalendarDays,
  Circle,
  Clock3,
  Download,
  FolderOpen,
  ImagePlus,
  Minus,
  MousePointer2,
  PaintBucket,
  Pause,
  Pencil,
  Pentagon,
  Play,
  Plus,
  Redo2,
  Rotate3D,
  RotateCcw,
  Settings2,
  Square,
  Stamp,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';

import {
  LcdCanvas,
  type LcdAppearance,
  type LcdCanvasHandle,
  type LcdEditTool,
  type LcdMode,
  type LcdSelection,
} from '@/app/lcd-canvas';
import {
  ballBitmap,
  CALENDAR_FORMATS,
  clampFramePosition,
  CLOCK_FORMATS,
  createMotionState,
  CURSOR_PATTERNS,
  CURSOR_SHAPES,
  findNearestFreePosition,
  formatLiveCalendar,
  formatLiveClock,
  frameCollides,
  frameContains,
  stepBall,
  stepMouse,
  type CalendarFormat,
  type ClockFormat,
  type CursorPatternId,
  type LiveElement,
  type LiveMotionState,
  type LiveSpriteFrame,
} from '@/app/live-elements';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

const INITIAL_BITMAP = [
  '10000001110011110',
  '10000010001010001',
  '10000010000010001',
  '10000010000010001',
  '10000010000010001',
  '10000010001010001',
  '11111001110011110',
];
const MAX_BITMAP_DIMENSION = 4096;
const INITIAL_BITMAP_OFFSET: [number, number] = [
  -INITIAL_BITMAP[0].length / 2,
  -INITIAL_BITMAP.length / 2,
];

const SPRITE_CATEGORIES = [
  { id: 'arcade', label: 'Arcade' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'playful', label: 'Playful' },
] as const;

type SpriteCategoryId = (typeof SPRITE_CATEGORIES)[number]['id'];
type SpriteBitmap = { id: string; label: string; category: SpriteCategoryId; rows: string[] };

const SPRITE_BITMAPS: SpriteBitmap[] = [
  {
    id: 'invader',
    label: 'Invader',
    category: 'arcade',
    rows: [
      '00100000100',
      '00010001000',
      '00111111100',
      '01101110110',
      '11111111111',
      '10111111101',
      '10100000101',
      '00011011000',
    ],
  },
  {
    id: 'ghost',
    label: 'Ghost',
    category: 'arcade',
    rows: [
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '11111111',
      '11011011',
      '10010001',
    ],
  },
  {
    id: 'pixel-eater',
    label: 'Pixel eater',
    category: 'arcade',
    rows: [
      '00111100',
      '01111110',
      '11111000',
      '11100000',
      '11111000',
      '01111110',
      '00111100',
    ],
  },
  {
    id: 'cherries',
    label: 'Cherries',
    category: 'arcade',
    rows: [
      '00001110',
      '00011000',
      '00110000',
      '01101100',
      '11011010',
      '11111111',
      '01101110',
    ],
  },
  {
    id: 'joystick',
    label: 'Joystick',
    category: 'arcade',
    rows: [
      '00011000',
      '00011000',
      '00011000',
      '00011000',
      '00111100',
      '01111110',
      '11111111',
    ],
  },
  {
    id: 'gamepad',
    label: 'Gamepad',
    category: 'arcade',
    rows: [
      '001111111100',
      '011111111110',
      '111001100111',
      '111111111111',
      '111001100111',
      '110000000011',
      '100000000001',
    ],
  },
  {
    id: 'arcade-cabinet',
    label: 'Arcade cabinet',
    category: 'arcade',
    rows: [
      '01111110',
      '01000010',
      '01011010',
      '01000010',
      '01111110',
      '01011010',
      '01111110',
      '01100110',
    ],
  },
  {
    id: 'space-ship',
    label: 'Space ship',
    category: 'arcade',
    rows: [
      '00011000',
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '00111100',
      '01011010',
      '10000001',
    ],
  },
  {
    id: 'lcd',
    label: 'LCD',
    category: 'hardware',
    rows: INITIAL_BITMAP,
  },
  {
    id: 'computer',
    label: 'Computer',
    category: 'hardware',
    rows: [
      '01111110',
      '11000011',
      '10100101',
      '10011001',
      '11000011',
      '01111110',
      '00011000',
      '00111100',
    ],
  },
  {
    id: 'floppy',
    label: 'Floppy disk',
    category: 'hardware',
    rows: [
      '11111110',
      '11000110',
      '11000110',
      '11111110',
      '11000010',
      '10111110',
      '10100110',
      '11111110',
    ],
  },
  {
    id: 'cassette',
    label: 'Cassette tape',
    category: 'hardware',
    rows: [
      '0111111110',
      '1100000011',
      '1011111101',
      '1010010101',
      '1011111101',
      '1100000011',
      '0110110110',
    ],
  },
  {
    id: 'radio',
    label: 'Pocket radio',
    category: 'hardware',
    rows: [
      '00000110',
      '00111100',
      '11111111',
      '10011001',
      '10111101',
      '10100101',
      '11111111',
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    category: 'hardware',
    rows: [
      '00110000',
      '01111000',
      '11111111',
      '11011011',
      '10100101',
      '11011011',
      '11111111',
    ],
  },
  {
    id: 'calculator',
    label: 'Calculator',
    category: 'hardware',
    rows: [
      '01111110',
      '01000010',
      '01011010',
      '01111110',
      '01010110',
      '01101010',
      '01010110',
      '01111110',
    ],
  },
  {
    id: 'phone',
    label: 'Brick phone',
    category: 'hardware',
    rows: [
      '00011000',
      '00011000',
      '00111100',
      '00100100',
      '00111100',
      '00101000',
      '00111100',
      '00111100',
    ],
  },
  {
    id: 'heart',
    label: 'Heart',
    category: 'adventure',
    rows: ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'],
  },
  {
    id: 'star',
    label: 'Star',
    category: 'adventure',
    rows: ['00010000', '00010000', '11010110', '01111100', '00111000', '01101100', '01000100'],
  },
  {
    id: 'bolt',
    label: 'Bolt',
    category: 'adventure',
    rows: ['00011000', '00110000', '01111100', '00011000', '00110000', '01100000'],
  },
  {
    id: 'key',
    label: 'Key',
    category: 'adventure',
    rows: ['01100000', '10010000', '10011111', '01100101', '00000111'],
  },
  {
    id: 'coin',
    label: 'Coin',
    category: 'adventure',
    rows: ['00111100', '01100110', '11011011', '11011011', '11011011', '01100110', '00111100'],
  },
  {
    id: 'gem',
    label: 'Gem',
    category: 'adventure',
    rows: ['00111100', '01111110', '11111111', '11011011', '01111110', '00111100', '00011000'],
  },
  {
    id: 'potion',
    label: 'Potion',
    category: 'adventure',
    rows: ['00111100', '00011000', '00111100', '01111110', '11100111', '11111111', '01111110', '00111100'],
  },
  {
    id: 'sword',
    label: 'Sword',
    category: 'adventure',
    rows: ['00000011', '00000110', '10001100', '01011000', '00110000', '01101000', '11000100'],
  },
  {
    id: 'shield',
    label: 'Shield',
    category: 'adventure',
    rows: ['11111111', '11011011', '11011011', '11011011', '01111110', '00111100', '00011000'],
  },
  {
    id: 'crown',
    label: 'Crown',
    category: 'adventure',
    rows: ['10000001', '11011011', '11111111', '10111101', '11111111', '01111110'],
  },
  {
    id: 'skull',
    label: 'Skull',
    category: 'adventure',
    rows: ['00111100', '01111110', '11011011', '11111111', '01111110', '00100100', '00100100'],
  },
  {
    id: 'smile',
    label: 'Smile',
    category: 'playful',
    rows: ['00111111100', '01000000010', '10010001001', '10010001001', '10000000001', '10100000101', '10011111001', '01000000010', '00111111100'],
  },
  {
    id: 'cat',
    label: 'Cat',
    category: 'playful',
    rows: ['10000001', '11000011', '11111111', '10100101', '11111111', '11011011', '01111110'],
  },
  {
    id: 'duck',
    label: 'Duck',
    category: 'playful',
    rows: ['00110000', '01111000', '01101011', '01111110', '00111100', '11111110', '01111100'],
  },
  {
    id: 'fish',
    label: 'Fish',
    category: 'playful',
    rows: ['00000100', '00111110', '01011011', '11111111', '01011011', '00111110', '00000100'],
  },
  {
    id: 'mushroom',
    label: 'Mushroom',
    category: 'playful',
    rows: ['00111100', '01111110', '11011011', '11111111', '00111100', '00100100', '00111100'],
  },
  {
    id: 'flower',
    label: 'Flower',
    category: 'playful',
    rows: ['00100100', '01111110', '00111100', '11111111', '00111100', '00011000', '00011000', '00111100'],
  },
  {
    id: 'music-note',
    label: 'Music note',
    category: 'playful',
    rows: ['00011110', '00010010', '00010010', '00010010', '01110010', '11100010', '01100000'],
  },
  {
    id: 'sun',
    label: 'Sun',
    category: 'playful',
    rows: ['10011001', '01011010', '00111100', '11111111', '00111100', '01011010', '10011001'],
  },
  {
    id: 'moon',
    label: 'Moon',
    category: 'playful',
    rows: ['00111100', '01111000', '11110000', '11110000', '11110000', '01111000', '00111100'],
  },
  {
    id: 'checker',
    label: 'Checker',
    category: 'playful',
    rows: ['101010101010', '010101010101', '101010101010', '010101010101', '101010101010', '010101010101', '101010101010', '010101010101'],
  },
];

const CLIPBOARD_SPRITE_ID = 'clipboard';

type PixelFontId =
  | 'terminal'
  | 'typewriter'
  | 'block'
  | 'rounded'
  | 'narrow'
  | 'serif'
  | 'silkscreen'
  | 'tiny'
  | 'pixelify'
  | 'jersey'
  | 'micro'
  | 'arcade'
  | 'dot'
  | 'jacquard';

const PIXEL_FONTS: Array<{ id: PixelFontId; label: string; css: string; weight: number }> = [
  { id: 'terminal', label: 'Terminal', css: 'ui-monospace, SFMono-Regular, Menlo, monospace', weight: 700 },
  { id: 'typewriter', label: 'Typewriter', css: '"Courier New", Courier, monospace', weight: 700 },
  { id: 'block', label: 'Block', css: '"Arial Black", Arial, sans-serif', weight: 900 },
  { id: 'rounded', label: 'Rounded', css: '"Trebuchet MS", Arial, sans-serif', weight: 700 },
  { id: 'narrow', label: 'Narrow', css: '"Arial Narrow", "Helvetica Neue", sans-serif', weight: 700 },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif', weight: 700 },
  { id: 'silkscreen', label: 'Silkscreen', css: 'Silkscreen, monospace', weight: 400 },
  { id: 'tiny', label: 'Tiny', css: 'Tiny5, monospace', weight: 400 },
  { id: 'pixelify', label: 'Pixelify', css: '"Pixelify Sans", sans-serif', weight: 700 },
  { id: 'jersey', label: 'Jersey', css: '"Jersey 10", sans-serif', weight: 400 },
  { id: 'micro', label: 'Micro', css: '"Micro 5", monospace', weight: 400 },
  { id: 'arcade', label: 'Arcade', css: '"Press Start 2P", monospace', weight: 400 },
  { id: 'dot', label: 'Dot', css: 'DotGothic16, sans-serif', weight: 400 },
  { id: 'jacquard', label: 'Jacquard', css: '"Jacquard 12", serif', weight: 400 },
];
const MIN_TEXT_PIXEL_SIZE = 4;
const MAX_TEXT_PIXEL_SIZE = 256;

type Cell = { row: number; column: number };
type GeometryTool = 'line' | 'rectangle' | 'ellipse';
type FillPatternId = 'solid' | 'checker' | 'dots' | 'diagonal';
type GeometryPreview = { rows: string[]; row: number; column: number };

const FILL_PATTERNS: Array<{ id: FillPatternId; label: string; rows: string[] }> = [
  { id: 'solid', label: 'Solid', rows: Array<string>(6).fill('111111') },
  { id: 'checker', label: 'Checker', rows: ['101010', '010101', '101010', '010101', '101010', '010101'] },
  { id: 'dots', label: 'Dots', rows: ['100100', '000000', '000000', '100100', '000000', '000000'] },
  { id: 'diagonal', label: 'Diagonal', rows: ['100010', '000100', '001000', '010001', '100010', '000100'] },
];

const DEFAULT_APPEARANCE: LcdAppearance = {
  background: '#aeb5a7',
  pixel: '#111512',
  inverted: false,
  gridVisible: false,
  pixelWidthMm: 1,
  pixelHeightMm: 1,
  gapMm: 0.18,
  shadowOffsetMm: [0.08, -0.08],
  shadowSoftnessMm: 0.06,
  shadowOpacity: 0.2,
};

const LCD_COLOR_PRESETS = [
  {
    id: 'graphite',
    label: 'Graphite',
    background: '#aeb5a7',
    pixel: '#111512',
  },
  {
    id: 'silver',
    label: 'Silver',
    background: '#d7d9d0',
    pixel: '#28302d',
  },
  {
    id: 'olive',
    label: 'Olive',
    background: '#a6ad78',
    pixel: '#26301f',
  },
  {
    id: 'pocket',
    label: 'Pocket green',
    background: '#9bbc0f',
    pixel: '#0f380f',
  },
  {
    id: 'amber',
    label: 'Amber',
    background: '#d2a154',
    pixel: '#2b1a0b',
  },
  {
    id: 'ice',
    label: 'Ice blue',
    background: '#8eb5bf',
    pixel: '#102a35',
  },
] as const;

const GEOMETRY_GLYPH = [
  '01110',
  '10001',
  '10001',
  '11111',
  '10001',
  '10001',
  '10001',
];

type BitmapParseResult =
  | { rows: string[]; error: null }
  | { rows: null; error: string };

type BitmapFrame = {
  rows: string[];
  offsetCells: [number, number];
};

type TextSession = {
  row: number;
  column: number;
};

type BrowserTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (
    input: unknown,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

type BrowserModelContext = {
  registerTool: (
    tool: BrowserTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function parseBitmap(source: string): BitmapParseResult {
  const rows = source.replaceAll('\r', '').split('\n');
  while (rows[0]?.trim() === '') rows.shift();
  while (rows.at(-1)?.trim() === '') rows.pop();
  const normalized = rows.map((row) => row.trim());

  if (normalized.length === 0) {
    return { rows: null, error: 'Enter at least one row of pixels.' };
  }
  if (normalized.some((row) => row.length === 0)) {
    return { rows: null, error: 'Blank rows are not allowed inside the bitmap.' };
  }
  if (normalized.some((row) => !/^[01]+$/.test(row))) {
    return { rows: null, error: 'Use only 0 and 1 characters.' };
  }
  const width = normalized[0].length;
  if (normalized.some((row) => row.length !== width)) {
    return { rows: null, error: 'Every row must have the same width.' };
  }
  if (width > MAX_BITMAP_DIMENSION || normalized.length > MAX_BITMAP_DIMENSION) {
    return { rows: null, error: `Bitmaps are limited to ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} pixels.` };
  }
  return { rows: normalized, error: null };
}

function automaticThreshold(histogram: Uint32Array, pixelCount: number) {
  let totalLuminance = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    totalLuminance += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundLuminance = 0;
  let strongestSeparation = -1;
  let threshold = 127;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = pixelCount - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundLuminance += value * histogram[value];
    const backgroundMean = backgroundLuminance / backgroundWeight;
    const foregroundMean = (totalLuminance - backgroundLuminance) / foregroundWeight;
    const separation = backgroundWeight
      * foregroundWeight
      * (backgroundMean - foregroundMean) ** 2;

    if (separation > strongestSeparation) {
      strongestSeparation = separation;
      threshold = value;
    }
  }

  return threshold;
}

async function imageFileToBitmap(file: File) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.decoding = 'async';
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This image format could not be decoded.'));
    });

    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new Error('The image has no visible dimensions.');
    }

    if (
      image.naturalWidth > MAX_BITMAP_DIMENSION
      || image.naturalHeight > MAX_BITMAP_DIMENSION
    ) {
      throw new Error(
        `Images are limited to ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} pixels.`,
      );
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image conversion is unavailable in this browser.');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const luminance = new Uint8Array(width * height);
    const histogram = new Uint32Array(256);

    for (let index = 0; index < luminance.length; index += 1) {
      const rgbaIndex = index * 4;
      const alpha = rgba[rgbaIndex + 3] / 255;
      const imageLuminance = Math.round(
        rgba[rgbaIndex] * 0.2126
        + rgba[rgbaIndex + 1] * 0.7152
        + rgba[rgbaIndex + 2] * 0.0722,
      );
      const compositedLuminance = Math.round(imageLuminance * alpha + 255 * (1 - alpha));
      luminance[index] = compositedLuminance;
      histogram[compositedLuminance] += 1;
    }

    const threshold = automaticThreshold(histogram, luminance.length);
    const rows = Array.from({ length: height }, (_, rowIndex) => {
      let row = '';
      const rowStart = rowIndex * width;
      for (let column = 0; column < width; column += 1) {
        row += luminance[rowStart + column] <= threshold ? '1' : '0';
      }
      return row;
    });

    return rows;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function bitmapsMatch(first: string[], second: string[]) {
  return first.length === second.length && first.every((row, index) => row === second[index]);
}

function scaleBitmap(rows: string[], scalePercent: number) {
  if (scalePercent === 100) return rows;
  const sourceHeight = Math.max(1, rows.length);
  const sourceWidth = Math.max(1, rows[0]?.length ?? 1);
  const targetWidth = Math.min(MAX_BITMAP_DIMENSION, Math.max(1, Math.round(sourceWidth * scalePercent / 100)));
  const targetHeight = Math.min(MAX_BITMAP_DIMENSION, Math.max(1, Math.round(sourceHeight * scalePercent / 100)));

  return Array.from({ length: targetHeight }, (_, targetRow) => {
    const sourceRow = Math.min(sourceHeight - 1, Math.floor(targetRow * sourceHeight / targetHeight));
    return Array.from({ length: targetWidth }, (_, targetColumn) => {
      const sourceColumn = Math.min(sourceWidth - 1, Math.floor(targetColumn * sourceWidth / targetWidth));
      return rows[sourceRow]?.[sourceColumn] === '1' ? '1' : '0';
    }).join('');
  });
}

function bitmapFramesMatch(first: BitmapFrame, second: BitmapFrame) {
  return bitmapsMatch(first.rows, second.rows)
    && first.offsetCells[0] === second.offsetCells[0]
    && first.offsetCells[1] === second.offsetCells[1];
}

function centeredBitmapOffset(rows: string[]): [number, number] {
  return [-(rows[0]?.length ?? 1) / 2, -rows.length / 2];
}

function firstSliderValue(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMillimetres(value: number) {
  return `${value.toFixed(2)} mm`;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function ControlSlider({
  id,
  label,
  value,
  formattedValue,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-slider">
      <span>
        {label}
        <output>{formattedValue}</output>
      </span>
      <Slider
        id={id}
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(nextValue) => onChange(firstSliderValue(nextValue))}
      />
    </label>
  );
}

function focusSlider(id: string) {
  const root = document.getElementById(id);
  root?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  root?.querySelector<HTMLElement>('[data-slot="slider-thumb"]')?.focus();
}

function GeometryGuide({ appearance }: { appearance: LcdAppearance }) {
  const columns = GEOMETRY_GLYPH[0].length;
  const rows = GEOMETRY_GLYPH.length;
  const pitchXMm = appearance.pixelWidthMm + appearance.gapMm;
  const pitchYMm = appearance.pixelHeightMm + appearance.gapMm;
  const matrixWidthMm = columns * pitchXMm - appearance.gapMm;
  const matrixHeightMm = rows * pitchYMm - appearance.gapMm;
  const scale = Math.min(126 / matrixWidthMm, 142 / matrixHeightMm);
  const pixelWidth = appearance.pixelWidthMm * scale;
  const pixelHeight = appearance.pixelHeightMm * scale;
  const pitchX = pitchXMm * scale;
  const pitchY = pitchYMm * scale;
  const matrixWidth = matrixWidthMm * scale;
  const matrixHeight = matrixHeightMm * scale;
  const originX = 152 - matrixWidth / 2;
  const originY = 40 + (142 - matrixHeight) / 2;
  const sampleColumn = 2;
  const sampleRow = rows - 1;
  const sampleX = originX + sampleColumn * pitchX;
  const sampleY = originY + sampleRow * pitchY;
  const widthSampleX = originX + 2 * pitchX;
  const widthSampleY = originY;
  const heightSampleX = originX;
  const heightSampleY = originY + 3 * pitchY;
  const gapStart = sampleX + pixelWidth;
  const gapEnd = sampleX + pitchX;
  const gapCenter = (gapStart + gapEnd) / 2;
  const gapMeasureY = sampleY + pixelHeight + 10;
  const shadowX = appearance.shadowOffsetMm[0] * scale;
  const shadowY = -appearance.shadowOffsetMm[1] * scale;
  const blur = Math.max(appearance.shadowSoftnessMm * scale, 0.05);
  const cells = GEOMETRY_GLYPH.flatMap((row, rowIndex) => (
    row.split('').map((value, columnIndex) => ({ value, rowIndex, columnIndex }))
  ));
  const renderedCells = cells.filter((cell) => (
    appearance.inverted ? cell.value === '0' : cell.value === '1'
  ));

  return (
    <div className="geometry-guide">
      <svg viewBox="0 0 304 224" aria-labelledby="geometry-guide-title">
        <title id="geometry-guide-title">Live preview of pixel dimensions and spacing</title>
        <defs>
          <filter id="geometry-guide-shadow" x="0" y="0" width="304" height="224" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        </defs>
        <rect className="guide-surface" x="0" y="0" width="304" height="224" rx="10" fill={appearance.background} />

        <g className="guide-grid">
          {cells.map((cell) => (
            <rect
              key={`grid-${cell.rowIndex}-${cell.columnIndex}`}
              x={originX + cell.columnIndex * pitchX}
              y={originY + cell.rowIndex * pitchY}
              width={pixelWidth}
              height={pixelHeight}
              rx="0.6"
            />
          ))}
        </g>

        <g
          fill="#000"
          opacity={appearance.shadowOpacity}
          filter="url(#geometry-guide-shadow)"
        >
          {renderedCells.map((cell) => (
            <rect
              key={`shadow-${cell.rowIndex}-${cell.columnIndex}`}
              x={originX + cell.columnIndex * pitchX + shadowX}
              y={originY + cell.rowIndex * pitchY + shadowY}
              width={pixelWidth}
              height={pixelHeight}
              rx="0.6"
            />
          ))}
        </g>

        <g fill={appearance.pixel}>
          {renderedCells.map((cell) => (
            <rect
              key={`pixel-${cell.rowIndex}-${cell.columnIndex}`}
              x={originX + cell.columnIndex * pitchX}
              y={originY + cell.rowIndex * pitchY}
              width={pixelWidth}
              height={pixelHeight}
              rx="0.6"
            />
          ))}
        </g>

        <g className="guide-dimension-measurement" stroke={appearance.pixel} aria-hidden="true">
          <path d={`M ${widthSampleX} ${widthSampleY - 4} V ${widthSampleY - 10} H ${widthSampleX + pixelWidth} V ${widthSampleY - 4}`} />
          <path d={`M ${widthSampleX + pixelWidth / 2} ${widthSampleY - 10} V 24 H 233`} />

          <path d={`M ${heightSampleX - 4} ${heightSampleY} H ${heightSampleX - 10} V ${heightSampleY + pixelHeight} H ${heightSampleX - 4}`} />
          <path d={`M ${heightSampleX - 10} ${heightSampleY + pixelHeight / 2} H 44 V 101`} />
        </g>
        <g className="guide-gap-measurement" stroke={appearance.pixel} aria-hidden="true">
          <path d={`M ${gapStart} ${sampleY + pixelHeight + 3} V ${gapMeasureY} H ${gapEnd} V ${sampleY + pixelHeight + 3}`} />
          <path d={`M ${gapCenter} ${gapMeasureY} V 200 H 230`} />
        </g>
      </svg>

      <button type="button" className="guide-callout guide-width" onClick={() => focusSlider('pixel-width')}>
        <span>Width</span><strong>{formatMillimetres(appearance.pixelWidthMm)}</strong>
      </button>
      <button type="button" className="guide-callout guide-height" onClick={() => focusSlider('pixel-height')}>
        <span>Height</span><strong>{formatMillimetres(appearance.pixelHeightMm)}</strong>
      </button>
      <button type="button" className="guide-callout guide-gap" onClick={() => focusSlider('pixel-gap')}>
        <span>Gap</span><strong>{formatMillimetres(appearance.gapMm)}</strong>
      </button>
    </div>
  );
}

type ShadowLegendId = 'softness' | 'x' | 'y';
type GuidePoint = { x: number; y: number };
type GuideRect = { x: number; y: number; width: number; height: number };
type GuideSlot = GuideRect & { id: string };

const SHADOW_GUIDE_WIDTH = 304;
const SHADOW_GUIDE_HEIGHT = 224;
const SHADOW_LEGEND_SLOTS: GuideSlot[] = [
  { id: 'top-left', x: 6, y: 6, width: 78, height: 42 },
  { id: 'top-right', x: 220, y: 6, width: 78, height: 42 },
  { id: 'middle-left', x: 6, y: 91, width: 78, height: 42 },
  { id: 'middle-right', x: 220, y: 91, width: 78, height: 42 },
  { id: 'bottom-left', x: 6, y: 176, width: 78, height: 42 },
  { id: 'bottom-right', x: 220, y: 176, width: 78, height: 42 },
];

function rectanglesOverlap(a: GuideRect, b: GuideRect) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function nearestSlotAnchor(target: GuidePoint, slot: GuideSlot) {
  const anchors = [
    { point: { x: slot.x, y: slot.y + slot.height / 2 }, side: 'left' },
    { point: { x: slot.x + slot.width, y: slot.y + slot.height / 2 }, side: 'right' },
    { point: { x: slot.x + slot.width / 2, y: slot.y }, side: 'top' },
    { point: { x: slot.x + slot.width / 2, y: slot.y + slot.height }, side: 'bottom' },
  ] as const;

  return anchors.reduce((best, candidate) => {
    const distance = Math.abs(target.x - candidate.point.x) + Math.abs(target.y - candidate.point.y);
    const bestDistance = Math.abs(target.x - best.point.x) + Math.abs(target.y - best.point.y);
    return distance < bestDistance ? candidate : best;
  });
}

function connectorPath(target: GuidePoint, slot: GuideSlot) {
  const anchor = nearestSlotAnchor(target, slot);
  if (anchor.side === 'left' || anchor.side === 'right') {
    return `M ${target.x} ${target.y} V ${anchor.point.y} H ${anchor.point.x}`;
  }
  return `M ${target.x} ${target.y} H ${anchor.point.x} V ${anchor.point.y}`;
}

function placeShadowLegends(
  targets: Record<ShadowLegendId, GuidePoint>,
  shadowBounds: GuideRect,
  allowedSlots: Record<ShadowLegendId, readonly string[]>,
) {
  const legendIds: ShadowLegendId[] = ['softness', 'y', 'x'];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestLayout = {} as Record<ShadowLegendId, GuideSlot>;

  function assignLegend(
    index: number,
    usedSlots: Set<string>,
    layout: Partial<Record<ShadowLegendId, GuideSlot>>,
    score: number,
  ) {
    if (index === legendIds.length) {
      if (score < bestScore) {
        bestScore = score;
        bestLayout = { ...layout } as Record<ShadowLegendId, GuideSlot>;
      }
      return;
    }

    const legendId = legendIds[index];
    const target = targets[legendId];
    for (const slot of SHADOW_LEGEND_SLOTS) {
      if (usedSlots.has(slot.id) || !allowedSlots[legendId].includes(slot.id)) continue;
      const anchor = nearestSlotAnchor(target, slot).point;
      const distance = Math.abs(target.x - anchor.x) + Math.abs(target.y - anchor.y);
      const overlapPenalty = rectanglesOverlap(slot, shadowBounds) ? 10_000 : 0;
      const nextScore = score + distance + overlapPenalty;
      if (nextScore >= bestScore) continue;

      usedSlots.add(slot.id);
      layout[legendId] = slot;
      assignLegend(index + 1, usedSlots, layout, nextScore);
      usedSlots.delete(slot.id);
      delete layout[legendId];
    }
  }

  assignLegend(0, new Set(), {}, 0);
  return bestLayout;
}

function ShadowGuide({ appearance }: { appearance: LcdAppearance }) {
  const scale = Math.min(
    74 / appearance.pixelWidthMm,
    74 / appearance.pixelHeightMm,
  );
  const pixelWidth = appearance.pixelWidthMm * scale;
  const pixelHeight = appearance.pixelHeightMm * scale;
  const pixelX = 150 - pixelWidth / 2;
  const pixelY = 104 - pixelHeight / 2;
  const offsetScale = Math.min(scale, 50);
  const offsetX = Math.max(-24, Math.min(24, appearance.shadowOffsetMm[0] * offsetScale));
  const offsetY = Math.max(-24, Math.min(24, -appearance.shadowOffsetMm[1] * offsetScale));
  const shadowX = pixelX + offsetX;
  const shadowY = pixelY + offsetY;
  const pixelRight = pixelX + pixelWidth;
  const shadowRight = shadowX + pixelWidth;
  const pixelBottom = pixelY + pixelHeight;
  const shadowBottom = shadowY + pixelHeight;
  const blur = Math.min(Math.max(appearance.shadowSoftnessMm * scale, 0.05), 14);
  const xMeasureY = 174;
  const yMeasureX = 220;
  const softnessExtent = Math.max(blur * 1.35, 0.75);
  const horizontalExposure = Math.abs(offsetX);
  const verticalExposure = Math.abs(offsetY);
  const softnessEdge = horizontalExposure === 0 && verticalExposure === 0
    ? 'top'
    : horizontalExposure >= verticalExposure
      ? (offsetX >= 0 ? 'right' : 'left')
      : (offsetY >= 0 ? 'bottom' : 'top');
  const softnessMeasureX = shadowX + pixelWidth * 0.25;
  const softnessMeasureY = shadowY + pixelHeight * 0.25;
  const softnessIsVertical = softnessEdge === 'top' || softnessEdge === 'bottom';
  const softnessEdgeX = softnessEdge === 'left' ? shadowX : shadowRight;
  const softnessEdgeY = softnessEdge === 'top' ? shadowY : shadowBottom;
  const softnessMeasurement = (() => {
    const clearance = 10;

    if (softnessIsVertical) {
      const top = softnessEdgeY - softnessExtent;
      const bottom = softnessEdgeY + softnessExtent;
      const bracketX = Math.min(pixelX, shadowX - softnessExtent) - clearance;

      return {
        bracket: `M ${bracketX + 4} ${top} H ${bracketX} V ${bottom} H ${bracketX + 4}`,
        extensions: `M ${softnessMeasureX} ${top} H ${bracketX} M ${softnessMeasureX} ${bottom} H ${bracketX}`,
        target: { x: bracketX, y: softnessEdgeY },
      };
    }

    const left = softnessEdgeX - softnessExtent;
    const right = softnessEdgeX + softnessExtent;
    const bracketY = Math.min(pixelY, shadowY - softnessExtent) - clearance;

    return {
      bracket: `M ${left} ${bracketY + 4} V ${bracketY} H ${right} V ${bracketY + 4}`,
      extensions: `M ${left} ${softnessMeasureY} V ${bracketY} M ${right} ${softnessMeasureY} V ${bracketY}`,
      target: { x: softnessEdgeX, y: bracketY },
    };
  })();
  const legendTargets: Record<ShadowLegendId, GuidePoint> = {
    softness: softnessMeasurement.target,
    x: { x: (pixelRight + shadowRight) / 2, y: xMeasureY },
    y: { x: yMeasureX, y: (pixelBottom + shadowBottom) / 2 },
  };
  const shadowBounds = {
    x: Math.min(pixelX, shadowX - softnessExtent) - 5,
    y: Math.min(pixelY, shadowY - softnessExtent) - 5,
    width: Math.max(pixelRight, shadowRight + softnessExtent) - Math.min(pixelX, shadowX - softnessExtent) + 10,
    height: Math.max(pixelBottom, shadowBottom + softnessExtent) - Math.min(pixelY, shadowY - softnessExtent) + 10,
  };
  const allowedLegendSlots: Record<ShadowLegendId, readonly string[]> = {
    softness: softnessIsVertical
      ? ['top-left', 'middle-left']
      : ['top-left', 'top-right'],
    x: ['bottom-left', 'bottom-right'],
    y: ['top-right', 'middle-right'],
  };
  const legendLayout = placeShadowLegends(legendTargets, shadowBounds, allowedLegendSlots);
  const legendStyle = (legendId: ShadowLegendId) => ({
    left: `${(legendLayout[legendId].x / SHADOW_GUIDE_WIDTH) * 100}%`,
    top: `${(legendLayout[legendId].y / SHADOW_GUIDE_HEIGHT) * 100}%`,
  });

  return (
    <div className="shadow-guide">
      <svg viewBox="0 0 304 224" aria-labelledby="shadow-guide-title">
        <title id="shadow-guide-title">Live preview of pixel shadow settings</title>
        <defs>
          <filter id="shadow-guide-blur" x="0" y="0" width="304" height="224" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        </defs>
        <rect className="guide-surface" x="0" y="0" width="304" height="224" rx="10" fill={appearance.background} />
        <rect
          x={shadowX}
          y={shadowY}
          width={pixelWidth}
          height={pixelHeight}
          rx="1"
          fill="#000"
          opacity={appearance.shadowOpacity}
          filter="url(#shadow-guide-blur)"
        />
        <rect
          x={pixelX}
          y={pixelY}
          width={pixelWidth}
          height={pixelHeight}
          rx="1"
          fill={appearance.pixel}
        />

        <g className="guide-shadow-measurement" stroke={appearance.pixel} aria-hidden="true">
          <path d={`M ${pixelRight} ${xMeasureY - 4} V ${xMeasureY} H ${shadowRight} V ${xMeasureY - 4}`} />
          <path d={connectorPath(legendTargets.x, legendLayout.x)} />

          <path d={`M ${yMeasureX - 4} ${pixelBottom} H ${yMeasureX} V ${shadowBottom} H ${yMeasureX - 4}`} />
          <path d={connectorPath(legendTargets.y, legendLayout.y)} />

          <path className="guide-shadow-extension" d={softnessMeasurement.extensions} />
          <path d={softnessMeasurement.bracket} />
          <path d={connectorPath(legendTargets.softness, legendLayout.softness)} />
        </g>
      </svg>

      <button type="button" className="guide-callout shadow-callout shadow-softness" style={legendStyle('softness')} data-slot={legendLayout.softness.id} onClick={() => focusSlider('shadow-softness')}>
        <span>Softness</span><strong>{formatMillimetres(appearance.shadowSoftnessMm)}</strong>
      </button>
      <button type="button" className="guide-callout shadow-callout shadow-y" style={legendStyle('y')} data-slot={legendLayout.y.id} onClick={() => focusSlider('shadow-y')}>
        <span>Y offset</span><strong>{formatMillimetres(appearance.shadowOffsetMm[1])}</strong>
      </button>
      <button type="button" className="guide-callout shadow-callout shadow-x" style={legendStyle('x')} data-slot={legendLayout.x.id} onClick={() => focusSlider('shadow-x')}>
        <span>X offset</span><strong>{formatMillimetres(appearance.shadowOffsetMm[0])}</strong>
      </button>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-control">
      <span>{label}</span>
      <span className="color-field">
        <input
          type="color"
          value={value}
          aria-label={`${label} color`}
          onChange={(event) => onChange(event.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

function rasterizePixelTextLayout(text: string, fontId: PixelFontId, pixelSize: number) {
  const emptyLayout = { rows: ['0'], cursorOffset: { row: 0, column: 0 } };
  if (!text || typeof document === 'undefined') return emptyLayout;
  const font = PIXEL_FONTS.find((item) => item.id === fontId) ?? PIXEL_FONTS[0];
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return emptyLayout;

  const lines = text.split('\n');
  const lineAdvance = Math.max(1, Math.ceil(pixelSize * 1.25));
  context.font = `${font.weight} ${pixelSize}px ${font.css}`;
  const lineWidths = lines.map((line) => Math.ceil(context.measureText(line).width));
  const width = Math.min(MAX_BITMAP_DIMENSION, Math.max(1, ...lineWidths.map((lineWidth) => lineWidth + 2)));
  const height = Math.min(
    MAX_BITMAP_DIMENSION,
    Math.max(1, (lines.length - 1) * lineAdvance + Math.ceil(pixelSize * 1.45) + 2),
  );
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.font = `${font.weight} ${pixelSize}px ${font.css}`;
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000';
  lines.forEach((line, lineIndex) => {
    context.fillText(line, 1, Math.ceil(pixelSize * 1.08) + lineIndex * lineAdvance);
  });

  const pixels = context.getImageData(0, 0, width, height).data;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] >= 96) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  const lastLine = lines.at(-1) ?? '';
  const cursorOffset = {
    row: (lines.length - 1) * lineAdvance,
    column: lastLine ? Math.min(MAX_BITMAP_DIMENSION - 1, (lineWidths.at(-1) ?? 0) + 2) : 0,
  };
  if (bottom < top) return { rows: ['0'.repeat(width)], cursorOffset };

  return {
    rows: Array.from({ length: bottom - top + 1 }, (_, row) => (
      Array.from({ length: width }, (_, column) => (
        pixels[((top + row) * width + column) * 4 + 3] >= 96 ? '1' : '0'
      )).join('')
    )),
    cursorOffset,
  };
}

function rasterizePixelText(text: string, fontId: PixelFontId, pixelSize: number) {
  return rasterizePixelTextLayout(text, fontId, pixelSize).rows;
}

function loadPixelFont(fontId: PixelFontId, pixelSize = 16) {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const font = PIXEL_FONTS.find((item) => item.id === fontId) ?? PIXEL_FONTS[0];
  return document.fonts.load(`${font.weight} ${pixelSize}px ${font.css}`, 'Aa').then(() => undefined);
}

function liveTextRows(
  element: Extract<LiveElement, { type: 'clock' | 'calendar' }>,
  date: Date,
  cache: Map<string, string[]>,
) {
  const text = element.type === 'clock'
    ? formatLiveClock(date, element.format)
    : formatLiveCalendar(date, element.format);
  const key = `${element.type}:${element.fontId}:${element.size}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const rows = rasterizePixelText(text, element.fontId as PixelFontId, element.size);
  cache.set(key, rows);
  if (cache.size > 80) cache.delete(cache.keys().next().value ?? key);
  return rows;
}

function autoFitLiveText(
  text: string,
  fontId: PixelFontId,
  width: number,
  height: number,
) {
  let low = MIN_TEXT_PIXEL_SIZE;
  let high = Math.min(MAX_TEXT_PIXEL_SIZE, Math.max(MIN_TEXT_PIXEL_SIZE, height * 2));
  let best = MIN_TEXT_PIXEL_SIZE;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const rows = rasterizePixelText(text, fontId, size);
    const fits = rows.length <= height && (rows[0]?.length ?? 0) <= width;
    if (fits) {
      best = size;
      low = size + 1;
    } else {
      high = size - 1;
    }
  }
  return best;
}

function lineCells(start: Cell, end: Cell) {
  const cells: Cell[] = [];
  let x = start.column;
  let y = start.row;
  const dx = Math.abs(end.column - start.column);
  const sx = start.column < end.column ? 1 : -1;
  const dy = -Math.abs(end.row - start.row);
  const sy = start.row < end.row ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ row: y, column: x });
    if (x === end.column && y === end.row) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}

function constrainedGeometryEnd(tool: GeometryTool, start: Cell, end: Cell, constrain: boolean) {
  if (!constrain) return end;
  const dx = end.column - start.column;
  const dy = end.row - start.row;
  if (tool === 'line') {
    if (Math.abs(dx) > Math.abs(dy) * 2) return { row: start.row, column: end.column };
    if (Math.abs(dy) > Math.abs(dx) * 2) return { row: end.row, column: start.column };
  }
  const extent = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    row: start.row + (dy < 0 ? -extent : extent),
    column: start.column + (dx < 0 ? -extent : extent),
  };
}

function geometryFromCells(cells: Cell[]): GeometryPreview | null {
  if (cells.length === 0) return null;
  const top = Math.min(...cells.map((cell) => cell.row));
  const bottom = Math.max(...cells.map((cell) => cell.row));
  const left = Math.min(...cells.map((cell) => cell.column));
  const right = Math.max(...cells.map((cell) => cell.column));
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width > MAX_BITMAP_DIMENSION || height > MAX_BITMAP_DIMENSION) return null;
  const active = new Set(cells.map((cell) => `${cell.row}:${cell.column}`));
  return {
    row: top,
    column: left,
    rows: Array.from({ length: height }, (_, rowOffset) => (
      Array.from({ length: width }, (_, columnOffset) => (
        active.has(`${top + rowOffset}:${left + columnOffset}`) ? '1' : '0'
      )).join('')
    )),
  };
}

function rasterizeGeometry(tool: GeometryTool, start: Cell, rawEnd: Cell, constrain: boolean) {
  const end = constrainedGeometryEnd(tool, start, rawEnd, constrain);
  if (tool === 'line') return geometryFromCells(lineCells(start, end));
  const top = Math.min(start.row, end.row);
  const bottom = Math.max(start.row, end.row);
  const left = Math.min(start.column, end.column);
  const right = Math.max(start.column, end.column);
  if (left === right || top === bottom) return geometryFromCells(lineCells(start, end));
  if (tool === 'rectangle') {
    return geometryFromCells([
      ...lineCells({ row: top, column: left }, { row: top, column: right }),
      ...lineCells({ row: top, column: right }, { row: bottom, column: right }),
      ...lineCells({ row: bottom, column: right }, { row: bottom, column: left }),
      ...lineCells({ row: bottom, column: left }, { row: top, column: left }),
    ]);
  }

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = Math.max((right - left) / 2, 0.5);
  const radiusY = Math.max((bottom - top) / 2, 0.5);
  const steps = Math.max(16, Math.ceil(Math.PI * 4 * Math.max(radiusX, radiusY)));
  const outline: Cell[] = [];
  let previous: Cell | null = null;
  for (let index = 0; index <= steps; index += 1) {
    const angle = index / steps * Math.PI * 2;
    const current = {
      row: Math.round(centerY + Math.sin(angle) * radiusY),
      column: Math.round(centerX + Math.cos(angle) * radiusX),
    };
    if (previous) outline.push(...lineCells(previous, current));
    previous = current;
  }
  return geometryFromCells(outline);
}

function rasterizePolygon(points: Cell[], close: boolean) {
  if (points.length === 0) return null;
  const cells = points.length === 1 ? points : points.slice(1).flatMap((point, index) => (
    lineCells(points[index], point)
  ));
  if (close && points.length > 2) cells.push(...lineCells(points.at(-1)!, points[0]));
  return geometryFromCells(cells);
}

function patternValue(pattern: FillPatternId, row: number, column: number) {
  if (pattern === 'solid') return '1';
  if (pattern === 'checker') return (row + column) % 2 === 0 ? '1' : '0';
  if (pattern === 'dots') return row % 3 === 0 && column % 3 === 0 ? '1' : '0';
  return ((column - row) % 4 + 4) % 4 === 0 ? '1' : '0';
}

function overlayBitmapFrame(
  base: BitmapFrame,
  source: string[],
  sourceTop: number,
  sourceLeft: number,
): BitmapFrame | null {
  const width = base.rows[0].length;
  const height = base.rows.length;
  const sourceWidth = source[0]?.length ?? 1;
  const sourceHeight = source.length;
  const leftPad = Math.max(0, -sourceLeft);
  const rightPad = Math.max(0, sourceLeft + sourceWidth - width);
  const topPad = Math.max(0, -sourceTop);
  const bottomPad = Math.max(0, sourceTop + sourceHeight - height);
  const nextWidth = width + leftPad + rightPad;
  const nextHeight = height + topPad + bottomPad;
  if (nextWidth > MAX_BITMAP_DIMENSION || nextHeight > MAX_BITMAP_DIMENSION) return null;

  const blankRow = '0'.repeat(nextWidth);
  const rows = [
    ...Array<string>(topPad).fill(blankRow),
    ...base.rows.map((row) => `${'0'.repeat(leftPad)}${row}${'0'.repeat(rightPad)}`),
    ...Array<string>(bottomPad).fill(blankRow),
  ].map((row) => row.split(''));
  const targetTop = sourceTop + topPad;
  const targetLeft = sourceLeft + leftPad;
  source.forEach((row, rowIndex) => {
    for (let column = 0; column < sourceWidth; column += 1) {
      if (row[column] === '1') rows[targetTop + rowIndex][targetLeft + column] = '1';
    }
  });
  return {
    rows: rows.map((row) => row.join('')),
    offsetCells: [base.offsetCells[0] - leftPad, base.offsetCells[1] - topPad],
  };
}

function expandBitmapForFrame(
  base: BitmapFrame,
  source: string[],
  sourceTop: number,
  sourceLeft: number,
) {
  const width = base.rows[0].length;
  const height = base.rows.length;
  const sourceWidth = Math.max(1, ...source.map((row) => row.length));
  const sourceHeight = Math.max(1, source.length);
  const leftPad = Math.max(0, -sourceLeft);
  const rightPad = Math.max(0, sourceLeft + sourceWidth - width);
  const topPad = Math.max(0, -sourceTop);
  const bottomPad = Math.max(0, sourceTop + sourceHeight - height);
  const nextWidth = width + leftPad + rightPad;
  const nextHeight = height + topPad + bottomPad;
  if (nextWidth > MAX_BITMAP_DIMENSION || nextHeight > MAX_BITMAP_DIMENSION) return null;
  if (leftPad === 0 && rightPad === 0 && topPad === 0 && bottomPad === 0) {
    return { frame: base, leftPad, topPad };
  }

  const blankRow = '0'.repeat(nextWidth);
  return {
    frame: {
      rows: [
        ...Array<string>(topPad).fill(blankRow),
        ...base.rows.map((row) => `${'0'.repeat(leftPad)}${row}${'0'.repeat(rightPad)}`),
        ...Array<string>(bottomPad).fill(blankRow),
      ],
      offsetCells: [base.offsetCells[0] - leftPad, base.offsetCells[1] - topPad] as [number, number],
    },
    leftPad,
    topPad,
  };
}

function BitmapThumbnail({
  rows,
  background,
  pixel,
  inverted,
}: {
  rows: string[];
  background: string;
  pixel: string;
  inverted: boolean;
}) {
  const columns = rows[0].length;
  const cellSize = Math.min(52 / columns, 32 / rows.length);
  const pixelSize = Math.max(cellSize * 0.76, 1);
  const contentWidth = columns * cellSize;
  const contentHeight = rows.length * cellSize;
  const originX = (64 - contentWidth) / 2;
  const originY = (44 - contentHeight) / 2;

  return (
    <svg viewBox="0 0 64 44" aria-hidden="true">
      <rect width="64" height="44" rx="4" fill={background} />
      {rows.flatMap((row, rowIndex) => row.split('').map((value, columnIndex) => (
        (inverted ? value === '0' : value === '1') ? (
          <rect
            key={`${rowIndex}-${columnIndex}`}
            x={originX + columnIndex * cellSize + (cellSize - pixelSize) / 2}
            y={originY + rowIndex * cellSize + (cellSize - pixelSize) / 2}
            width={pixelSize}
            height={pixelSize}
            rx={Math.min(pixelSize * 0.08, 0.5)}
            fill={pixel}
          />
        ) : null
      )))}
    </svg>
  );
}

function PixelFontThumbnail({
  fontId,
  background,
  pixel,
}: {
  fontId: PixelFontId;
  background: string;
  pixel: string;
}) {
  const [rows, setRows] = useState(['1']);
  useEffect(() => {
    let cancelled = false;
    void loadPixelFont(fontId, 12).then(() => {
      if (!cancelled) setRows(rasterizePixelText('Aa', fontId, 12));
    });
    return () => {
      cancelled = true;
    };
  }, [fontId]);
  return <BitmapThumbnail rows={rows} background={background} pixel={pixel} inverted={false} />;
}

export function LcdStudio() {
  const canvasRef = useRef<LcdCanvasHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const bitmapRef = useRef(INITIAL_BITMAP);
  const bitmapOffsetRef = useRef<[number, number]>(INITIAL_BITMAP_OFFSET);
  const paintBaseRef = useRef<BitmapFrame | null>(null);
  const textSessionRef = useRef<TextSession | null>(null);
  const stampScaleRef = useRef(100);
  const liveElementsRef = useRef<LiveElement[]>([]);
  const liveMotionRef = useRef(new Map<string, LiveMotionState>());
  const liveFramesRef = useRef<LiveSpriteFrame[]>([]);
  const liveDraggingRef = useRef(new Set<string>());
  const liveTextCacheRef = useRef(new Map<string, string[]>());
  const livePausedRef = useRef(false);
  const liveDisplayTimeRef = useRef(0);
  const nextLiveIdRef = useRef(1);

  const [mode, setMode] = useState<LcdMode>('view');
  const [liveElements, setLiveElements] = useState<LiveElement[]>([]);
  const [selectedLiveElementId, setSelectedLiveElementId] = useState<string | null>(null);
  const [livePaused, setLivePaused] = useState(false);
  const [liveAddOpen, setLiveAddOpen] = useState(false);
  const [liveOverflowIds, setLiveOverflowIds] = useState<Set<string>>(() => new Set());
  const [editTool, setEditTool] = useState<LcdEditTool>('pen');
  const [selectedSpriteId, setSelectedSpriteId] = useState(CLIPBOARD_SPRITE_ID);
  const [stampScalePercent, setStampScalePercent] = useState(100);
  const [selectedFontId, setSelectedFontId] = useState<PixelFontId>('terminal');
  const [textPixelSize, setTextPixelSize] = useState(12);
  const [textValue, setTextValue] = useState('');
  const [textPreviewBitmap, setTextPreviewBitmap] = useState(['0']);
  const [textAnchor, setTextAnchor] = useState<{ row: number; column: number } | null>(null);
  const [textCursorOffset, setTextCursorOffset] = useState({ row: 0, column: 0 });
  const [textCursorSize, setTextCursorSize] = useState<[number, number]>([8, 9]);
  const [geometryPreview, setGeometryPreview] = useState<GeometryPreview | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Cell[]>([]);
  const [fillPattern, setFillPattern] = useState<FillPatternId>('solid');
  const [selection, setSelection] = useState<LcdSelection | null>(null);
  const [clipboardBitmap, setClipboardBitmap] = useState<string[] | null>(null);
  const [bitmap, setBitmap] = useState(INITIAL_BITMAP);
  const [bitmapOffsetCells, setBitmapOffsetCells] = useState<[number, number]>(INITIAL_BITMAP_OFFSET);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [past, setPast] = useState<BitmapFrame[]>([]);
  const [future, setFuture] = useState<BitmapFrame[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importingImage, setImportingImage] = useState(false);
  const [actionStatus, setActionStatus] = useState('Ready');
  const [hiddenGestureHintContext, setHiddenGestureHintContext] = useState<string | null>(null);
  const [gestureHintRevision, setGestureHintRevision] = useState(0);
  const gestureHintContext = `${mode}:${editTool}:${gestureHintRevision}`;
  const showGestureHint = hiddenGestureHintContext !== gestureHintContext;
  const stampBitmap = useMemo(() => {
    const source = selectedSpriteId === CLIPBOARD_SPRITE_ID
      ? clipboardBitmap ?? ['0']
      : SPRITE_BITMAPS.find((sprite) => sprite.id === selectedSpriteId)?.rows ?? SPRITE_BITMAPS[0].rows;
    return scaleBitmap(source, stampScalePercent);
  }, [clipboardBitmap, selectedSpriteId, stampScalePercent]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setHiddenGestureHintContext(`${mode}:${editTool}:${gestureHintRevision}`), 10_000);
    return () => window.clearTimeout(timeout);
  }, [editTool, gestureHintRevision, mode]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const firstGlyph = rasterizePixelText('M', selectedFontId, textPixelSize);
      setTextCursorSize([firstGlyph[0]?.length ?? 1, firstGlyph.length]);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedFontId, textPixelSize]);

  useEffect(() => {
    liveElementsRef.current = liveElements;
  }, [liveElements]);

  useEffect(() => {
    livePausedRef.current = livePaused;
    if (!livePaused) liveDisplayTimeRef.current = Date.now();
  }, [livePaused]);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const bounds = {
        width: bitmapRef.current[0]?.length ?? 1,
        height: bitmapRef.current.length || 1,
      };
      const deltaSeconds = livePausedRef.current
        ? 0
        : Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      if (!livePausedRef.current) liveDisplayTimeRef.current = Date.now();
      const displayDate = new Date(liveDisplayTimeRef.current);
      const elements = liveElementsRef.current.filter((element) => element.enabled);
      const nextFrames: LiveSpriteFrame[] = [];

      for (const element of elements) {
        if (element.type === 'ball') continue;
        let rows: string[];
        let row = element.row;
        let column = element.column;
        if (element.type === 'clock' || element.type === 'calendar') {
          rows = liveTextRows(element, displayDate, liveTextCacheRef.current);
          const frameWidth = rows[0]?.length ?? 1;
          row = rows.length > bounds.height ? Math.round((bounds.height - rows.length) / 2) : row;
          column = frameWidth > bounds.width ? Math.round((bounds.width - frameWidth) / 2) : column;
          if (rows.length <= bounds.height && frameWidth <= bounds.width) {
            ({ row, column } = clampFramePosition(rows, row, column, bounds));
          }
        } else {
          rows = CURSOR_SHAPES.find((shape) => shape.id === element.shape)?.rows ?? CURSOR_SHAPES[0].rows;
          let motion = liveMotionRef.current.get(element.id)
            ?? createMotionState(element.row, element.column, nextLiveIdRef.current);
          if (liveDraggingRef.current.has(element.id)) {
            motion = { ...motion, row: element.row, column: element.column };
          } else if (!livePausedRef.current) {
            motion = stepMouse(element, motion, rows, deltaSeconds, bounds);
          }
          liveMotionRef.current.set(element.id, motion);
          row = Math.round(motion.row);
          column = Math.round(motion.column);
        }
        nextFrames.push({ id: element.id, rows, row, column });
      }

      const ballFrames = elements.filter((element) => element.type === 'ball').map((element) => {
        const rows = ballBitmap(element.size);
        const motion = liveMotionRef.current.get(element.id)
          ?? createMotionState(element.row, element.column, nextLiveIdRef.current);
        return { id: element.id, rows, row: Math.round(motion.row), column: Math.round(motion.column) };
      });

      for (const element of elements) {
        if (element.type !== 'ball') continue;
        const rows = ballBitmap(element.size);
        let motion = liveMotionRef.current.get(element.id)
          ?? createMotionState(element.row, element.column, nextLiveIdRef.current);
        if (liveDraggingRef.current.has(element.id)) {
          motion = { ...motion, row: element.row, column: element.column };
        } else if (!livePausedRef.current) {
          const obstacles = [...nextFrames, ...ballFrames.filter((frame) => frame.id !== element.id)];
          const isBlocked = (row: number, column: number) => (
            bitmapRef.current[row]?.[column] === '1'
            || obstacles.some((frame) => frameContains(frame, row, column))
          );
          if (frameCollides(rows, motion.row, motion.column, bounds, isBlocked)) {
            const free = findNearestFreePosition(
              rows,
              motion.row,
              motion.column,
              bounds,
              isBlocked,
            );
            if (free) motion = { ...motion, ...free };
          }
          motion = stepBall(element, motion, rows, deltaSeconds, bounds, isBlocked);
        }
        liveMotionRef.current.set(element.id, motion);
        const frame = {
          id: element.id,
          rows,
          row: Math.round(motion.row),
          column: Math.round(motion.column),
        };
        const index = ballFrames.findIndex((item) => item.id === element.id);
        if (index >= 0) ballFrames[index] = frame;
      }

      const frames = [...nextFrames, ...ballFrames];
      liveFramesRef.current = frames;
      canvasRef.current?.setLiveFrames(frames);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const stopTextSession = useCallback(() => {
    textSessionRef.current = null;
    setTextAnchor(null);
    setTextValue('');
    setTextPreviewBitmap(['0']);
    setTextCursorOffset({ row: 0, column: 0 });
    textInputRef.current?.blur();
  }, []);

  const chooseMode = useCallback((nextMode: LcdMode) => {
    if (nextMode !== 'edit') stopTextSession();
    if (nextMode !== 'edit') {
      setGeometryPreview(null);
      setPolygonPoints([]);
    }
    setMode(nextMode);
  }, [stopTextSession]);

  const clearLiveElements = useCallback(() => {
    liveElementsRef.current = [];
    liveMotionRef.current.clear();
    liveFramesRef.current = [];
    liveDraggingRef.current.clear();
    setLiveElements([]);
    setSelectedLiveElementId(null);
    canvasRef.current?.setLiveFrames([]);
  }, []);

  const updateLiveElement = useCallback((id: string, patch: Partial<LiveElement>) => {
    setLiveElements((elements) => {
      const next = elements.map((element) => (
        element.id === id ? { ...element, ...patch } as LiveElement : element
      ));
      liveElementsRef.current = next;
      return next;
    });
  }, []);

  const expandForLiveFrame = useCallback((rows: string[], row: number, column: number) => {
    const expansion = expandBitmapForFrame(
      { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current },
      rows,
      Math.round(row),
      Math.round(column),
    );
    if (!expansion) {
      setActionStatus(`Live element exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return null;
    }

    const { frame, leftPad, topPad } = expansion;
    if (leftPad > 0 || topPad > 0 || frame.rows !== bitmapRef.current) {
      bitmapRef.current = frame.rows;
      bitmapOffsetRef.current = frame.offsetCells;
      setBitmap(frame.rows);
      setBitmapOffsetCells(frame.offsetCells);

      if (leftPad > 0 || topPad > 0) {
        const shifted = liveElementsRef.current.map((element) => ({
          ...element,
          row: element.row + topPad,
          column: element.column + leftPad,
        }));
        liveElementsRef.current = shifted;
        setLiveElements(shifted);
        liveFramesRef.current = liveFramesRef.current.map((liveFrame) => ({
          ...liveFrame,
          row: liveFrame.row + topPad,
          column: liveFrame.column + leftPad,
        }));
        canvasRef.current?.setLiveFrames(liveFramesRef.current);
        liveMotionRef.current.forEach((motion, id) => {
          liveMotionRef.current.set(id, {
            ...motion,
            row: motion.row + topPad,
            column: motion.column + leftPad,
          });
        });
      }
      setActionStatus(`LCD expanded to ${frame.rows[0].length} × ${frame.rows.length}`);
    }
    return {
      row: Math.round(row) + topPad,
      column: Math.round(column) + leftPad,
    };
  }, []);

  const moveLiveElement = useCallback((id: string, row: number, column: number) => {
    if (!Number.isFinite(row) || !Number.isFinite(column)) return;
    const frame = liveFramesRef.current.find((item) => item.id === id);
    const element = liveElementsRef.current.find((item) => item.id === id);
    if (!element) return;
    const rows = frame?.rows ?? (element.type === 'clock' || element.type === 'calendar'
      ? liveTextRows(element, new Date(liveDisplayTimeRef.current || Date.now()), liveTextCacheRef.current)
      : element.type === 'mouse'
        ? CURSOR_SHAPES.find((shape) => shape.id === element.shape)?.rows ?? CURSOR_SHAPES[0].rows
        : ballBitmap(element.size));
    const position = expandForLiveFrame(rows, row, column);
    if (!position) return;
    updateLiveElement(id, position);
    const motion = liveMotionRef.current.get(id);
    if (motion) liveMotionRef.current.set(id, { ...motion, ...position });
  }, [expandForLiveFrame, updateLiveElement]);

  const setLiveDragState = useCallback((id: string, dragging: boolean) => {
    if (dragging) liveDraggingRef.current.add(id);
    else liveDraggingRef.current.delete(id);
  }, []);

  const addLiveElement = useCallback((type: LiveElement['type']) => {
    const id = `${type}-${nextLiveIdRef.current++}`;
    const width = bitmapRef.current[0]?.length ?? 1;
    const height = bitmapRef.current.length || 1;
    const date = new Date();
    let element: LiveElement;
    let rows: string[];

    if (type === 'clock') {
      const format: ClockFormat = '24-short';
      const text = formatLiveClock(date, format);
      const size = autoFitLiveText(text, 'tiny', width, height);
      rows = rasterizePixelText(text, 'tiny', size);
      element = { id, type, enabled: true, format, fontId: 'tiny', size, row: 0, column: 0 };
      void loadPixelFont('tiny', size).then(() => liveTextCacheRef.current.clear());
    } else if (type === 'calendar') {
      const format: CalendarFormat = 'iso';
      const text = formatLiveCalendar(date, format);
      const size = autoFitLiveText(text, 'tiny', width, height);
      rows = rasterizePixelText(text, 'tiny', size);
      element = { id, type, enabled: true, format, fontId: 'tiny', size, row: 0, column: 0 };
      void loadPixelFont('tiny', size).then(() => liveTextCacheRef.current.clear());
    } else if (type === 'mouse') {
      rows = CURSOR_SHAPES[0].rows;
      element = { id, type, enabled: true, shape: 'arrow', pattern: 'bounce', speed: 4, row: 0, column: 0 };
    } else {
      rows = ballBitmap(3);
      element = { id, type, enabled: true, size: 3, speed: 4, row: 0, column: 0 };
    }

    const preferred = {
      row: Math.round((height - rows.length) / 2),
      column: Math.round((width - (rows[0]?.length ?? 1)) / 2),
    };
    const expandedPosition = expandForLiveFrame(rows, preferred.row, preferred.column);
    if (!expandedPosition) return;
    const expandedWidth = bitmapRef.current[0]?.length ?? 1;
    const expandedHeight = bitmapRef.current.length || 1;
    const existingFrames = liveFramesRef.current;
    const position = type === 'ball'
      ? findNearestFreePosition(
          rows,
          expandedPosition.row,
          expandedPosition.column,
          { width: expandedWidth, height: expandedHeight },
          (row, column) => bitmapRef.current[row]?.[column] === '1'
            || existingFrames.some((frame) => frameContains(frame, row, column)),
        ) ?? expandedPosition
      : expandedPosition;
    element = { ...element, ...position } as LiveElement;
    const next = [...liveElementsRef.current, element];
    liveElementsRef.current = next;
    liveMotionRef.current.set(id, createMotionState(position.row, position.column, nextLiveIdRef.current));
    setLiveElements(next);
    setSelectedLiveElementId(id);
    setLiveAddOpen(false);
    setMode('live');
    setActionStatus(`${type[0].toUpperCase()}${type.slice(1)} added`);
  }, [expandForLiveFrame]);

  const removeLiveElement = useCallback((id: string) => {
    const next = liveElementsRef.current.filter((element) => element.id !== id);
    liveElementsRef.current = next;
    liveMotionRef.current.delete(id);
    liveDraggingRef.current.delete(id);
    setLiveElements(next);
    setSelectedLiveElementId((selected) => selected === id ? next.at(-1)?.id ?? null : selected);
    setActionStatus('Live element removed');
  }, []);

  const selectedLiveElement = useMemo(
    () => liveElements.find((element) => element.id === selectedLiveElementId) ?? null,
    [liveElements, selectedLiveElementId],
  );
  const selectedLiveTextOverflow = selectedLiveElement
    && (selectedLiveElement.type === 'clock' || selectedLiveElement.type === 'calendar')
    && liveOverflowIds.has(selectedLiveElement.id);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const date = new Date();
      const overflowIds = new Set<string>();
      liveElements.forEach((element) => {
        if (element.type !== 'clock' && element.type !== 'calendar') return;
        const rows = liveTextRows(element, date, liveTextCacheRef.current);
        if (rows.length > bitmap.length || (rows[0]?.length ?? 0) > (bitmap[0]?.length ?? 1)) {
          overflowIds.add(element.id);
        }
      });
      setLiveOverflowIds(overflowIds);
    });
    return () => cancelAnimationFrame(frame);
  }, [bitmap, liveElements]);

  const chooseEditTool = (nextTool: LcdEditTool) => {
    if (nextTool !== 'text') stopTextSession();
    setSelection(null);
    setGeometryPreview(null);
    setPolygonPoints([]);
    setEditTool(nextTool);
  };

  const changeStampScale = useCallback((nextScale: number) => {
    const scale = Math.min(400, Math.max(25, Math.round(nextScale / 25) * 25));
    stampScaleRef.current = scale;
    setStampScalePercent(scale);
    setActionStatus(`Stamp scale: ${scale}%`);
  }, []);

  const nudgeStampScale = useCallback((steps: number) => {
    changeStampScale(stampScaleRef.current + steps * 25);
  }, [changeStampScale]);

  const replaceBitmap = useCallback((next: string[], recordHistory = true, nextOffsetCells = bitmapOffsetRef.current) => {
    const current = bitmapRef.current;
    const currentOffsetCells = bitmapOffsetRef.current;
    if (bitmapsMatch(current, next)
      && currentOffsetCells[0] === nextOffsetCells[0]
      && currentOffsetCells[1] === nextOffsetCells[1]) {
      return false;
    }
    if (recordHistory) {
      setPast((items) => [...items, { rows: current, offsetCells: currentOffsetCells }].slice(-80));
      setFuture([]);
    }
    bitmapRef.current = next;
    bitmapOffsetRef.current = nextOffsetCells;
    setBitmap(next);
    setBitmapOffsetCells(nextOffsetCells);
    return true;
  }, []);

  const placeGeometry = useCallback((preview: GeometryPreview, label: string) => {
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    const next = overlayBitmapFrame(current, preview.rows, preview.row, preview.column);
    if (!next) {
      setActionStatus(`${label} exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return false;
    }
    const changed = replaceBitmap(next.rows, true, next.offsetCells);
    if (changed) setActionStatus(`${label} drawn`);
    return changed;
  }, [replaceBitmap]);

  const previewGeometry = (start: Cell, end: Cell, constrain: boolean) => {
    if (editTool !== 'line' && editTool !== 'rectangle' && editTool !== 'ellipse') return;
    const preview = rasterizeGeometry(editTool, start, end, constrain);
    setGeometryPreview(preview);
    if (!preview) setActionStatus(`Shape exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
  };

  const commitGeometry = (start: Cell, end: Cell, constrain: boolean) => {
    if (editTool !== 'line' && editTool !== 'rectangle' && editTool !== 'ellipse') return;
    const preview = rasterizeGeometry(editTool, start, end, constrain);
    setGeometryPreview(null);
    if (preview) placeGeometry(preview, editTool === 'ellipse' ? 'Ellipse' : editTool[0].toUpperCase() + editTool.slice(1));
  };

  const cancelPolygon = useCallback(() => {
    setPolygonPoints([]);
    setGeometryPreview(null);
  }, []);

  const cancelGeometryPreview = useCallback(() => {
    setGeometryPreview(null);
  }, []);

  const commitPolygon = useCallback(() => {
    if (polygonPoints.length < 3) {
      setActionStatus('A polygon needs at least 3 points');
      return;
    }
    const preview = rasterizePolygon(polygonPoints, true);
    if (preview) placeGeometry(preview, 'Polygon');
    cancelPolygon();
  }, [cancelPolygon, placeGeometry, polygonPoints]);

  const fillAt = (row: number, column: number) => {
    const current = bitmapRef.current;
    const width = current[0].length;
    const height = current.length;
    if (row < 0 || column < 0 || row >= height || column >= width) {
      setActionStatus('Pattern fill starts inside the current bitmap');
      return;
    }
    const target = current[row][column];
    const visited = new Uint8Array(width * height);
    const region: number[] = [row * width + column];
    visited[region[0]] = 1;
    for (let cursor = 0; cursor < region.length; cursor += 1) {
      if (region.length > 1_000_000) {
        setActionStatus('Fill region is too large');
        return;
      }
      const index = region[cursor];
      const currentRow = Math.floor(index / width);
      const neighbours = [index - width, index + width, index - 1, index + 1];
      neighbours.forEach((nextIndex, direction) => {
        if (nextIndex < 0 || nextIndex >= width * height || visited[nextIndex]) return;
        const nextRow = Math.floor(nextIndex / width);
        const nextColumn = nextIndex % width;
        if (direction >= 2 && nextRow !== currentRow) return;
        if (current[nextRow][nextColumn] !== target) return;
        visited[nextIndex] = 1;
        region.push(nextIndex);
      });
    }
    const next = current.map((bitmapRow) => bitmapRow.split(''));
    region.forEach((index) => {
      const fillRow = Math.floor(index / width);
      const fillColumn = index % width;
      next[fillRow][fillColumn] = patternValue(fillPattern, fillRow, fillColumn);
    });
    const changed = replaceBitmap(next.map((bitmapRow) => bitmapRow.join('')), true);
    setActionStatus(changed ? `${FILL_PATTERNS.find((pattern) => pattern.id === fillPattern)?.label} fill applied` : 'Region already matches pattern');
  };

  const addPolygonPoint = (row: number, column: number) => {
    if (editTool === 'fill') {
      fillAt(row, column);
      return;
    }
    if (editTool !== 'polygon') return;
    if (polygonPoints.length >= 3
      && row === polygonPoints[0].row
      && column === polygonPoints[0].column) {
      commitPolygon();
      return;
    }
    const nextPoints = [...polygonPoints, { row, column }];
    setPolygonPoints(nextPoints);
    setGeometryPreview(rasterizePolygon(nextPoints, false));
    setActionStatus(`${nextPoints.length} point${nextPoints.length === 1 ? '' : 's'} · Enter closes polygon`);
  };

  const hoverPolygon = (cell: Cell | null) => {
    if (editTool !== 'polygon' || polygonPoints.length === 0) return;
    setGeometryPreview(rasterizePolygon(cell ? [...polygonPoints, cell] : polygonPoints, false));
  };

  const setPixel = (row: number, column: number, value: 0 | 1) => {
    const current = bitmapRef.current;
    const width = current[0].length;
    const height = current.length;
    const isOutside = row < 0 || column < 0 || row >= height || column >= width;
    if (isOutside && value === 0) return;
    if (!isOutside && current[row][column] === String(value)) return;

    const leftPad = Math.max(0, -column);
    const rightPad = Math.max(0, column - width + 1);
    const topPad = Math.max(0, -row);
    const bottomPad = Math.max(0, row - height + 1);
    const nextWidth = width + leftPad + rightPad;
    const nextHeight = height + topPad + bottomPad;
    if (nextWidth > MAX_BITMAP_DIMENSION || nextHeight > MAX_BITMAP_DIMENSION) {
      setActionStatus(`Edit exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return;
    }

    const leftZeros = '0'.repeat(leftPad);
    const rightZeros = '0'.repeat(rightPad);
    const blankRow = '0'.repeat(nextWidth);
    const next = [
      ...Array<string>(topPad).fill(blankRow),
      ...current.map((currentRow) => `${leftZeros}${currentRow}${rightZeros}`),
      ...Array<string>(bottomPad).fill(blankRow),
    ];
    const nextRow = row + topPad;
    const nextColumn = column + leftPad;
    next[nextRow] = `${next[nextRow].slice(0, nextColumn)}${value}${next[nextRow].slice(nextColumn + 1)}`;
    const currentOffset = bitmapOffsetRef.current;
    replaceBitmap(next, false, [currentOffset[0] - leftPad, currentOffset[1] - topPad]);
  };

  const placeBitmapAt = (source: string[], label: string, row: number, column: number) => {
    const current = bitmapRef.current;
    const width = current[0].length;
    const height = current.length;
    const sourceWidth = source[0].length;
    const sourceHeight = source.length;
    const sourceLeft = column - Math.floor(sourceWidth / 2);
    const sourceTop = row - Math.floor(sourceHeight / 2);
    const leftPad = Math.max(0, -sourceLeft);
    const rightPad = Math.max(0, sourceLeft + sourceWidth - width);
    const topPad = Math.max(0, -sourceTop);
    const bottomPad = Math.max(0, sourceTop + sourceHeight - height);
    const nextWidth = width + leftPad + rightPad;
    const nextHeight = height + topPad + bottomPad;

    if (nextWidth > MAX_BITMAP_DIMENSION || nextHeight > MAX_BITMAP_DIMENSION) {
      setActionStatus(`${label} exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return;
    }

    const blankRow = '0'.repeat(nextWidth);
    const rows = [
      ...Array<string>(topPad).fill(blankRow),
      ...current.map((currentRow) => `${'0'.repeat(leftPad)}${currentRow}${'0'.repeat(rightPad)}`),
      ...Array<string>(bottomPad).fill(blankRow),
    ].map((currentRow) => currentRow.split(''));
    const targetTop = sourceTop + topPad;
    const targetLeft = sourceLeft + leftPad;

    source.forEach((sourceRow, sourceRowIndex) => {
      for (let sourceColumn = 0; sourceColumn < sourceWidth; sourceColumn += 1) {
        if (sourceRow[sourceColumn] === '1') {
          rows[targetTop + sourceRowIndex][targetLeft + sourceColumn] = '1';
        }
      }
    });

    const currentOffset = bitmapOffsetRef.current;
    const changed = replaceBitmap(
      rows.map((nextRow) => nextRow.join('')),
      true,
      [currentOffset[0] - leftPad, currentOffset[1] - topPad],
    );
    if (changed) setActionStatus(`${label} placed`);
  };

  const stampAt = (row: number, column: number) => {
    if (selectedSpriteId === CLIPBOARD_SPRITE_ID) {
      if (clipboardBitmap) placeBitmapAt(stampBitmap, 'Selection', row, column);
      return;
    }
    const sprite = SPRITE_BITMAPS.find((item) => item.id === selectedSpriteId);
    if (sprite) placeBitmapAt(stampBitmap, sprite.label, row, column);
  };

  const bitmapFromSelection = useCallback((selectedArea: LcdSelection) => (
    Array.from({ length: selectedArea.height }, (_, rowOffset) => (
      Array.from({ length: selectedArea.width }, (_, columnOffset) => (
        bitmapRef.current[selectedArea.row + rowOffset]?.[selectedArea.column + columnOffset] ?? '0'
      )).join('')
    ))
  ), []);

  const copySelectionToBuffer = useCallback((selectedArea: LcdSelection) => {
    if (selectedArea.width > MAX_BITMAP_DIMENSION || selectedArea.height > MAX_BITMAP_DIMENSION) {
      setActionStatus(`Selection exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return;
    }
    setClipboardBitmap(bitmapFromSelection(selectedArea));
    setSelectedSpriteId(CLIPBOARD_SPRITE_ID);
    setActionStatus(`Copied ${selectedArea.width} × ${selectedArea.height} cells`);
  }, [bitmapFromSelection]);

  const updateTextPreviewBitmap = (
    value: string,
    fontId = selectedFontId,
    pixelSize = textPixelSize,
  ) => {
    const layout = rasterizePixelTextLayout(value, fontId, pixelSize);
    setTextPreviewBitmap(layout.rows);
    setTextCursorOffset(layout.cursorOffset);
    const lineCount = value.split('\n').length;
    setActionStatus(value
      ? `${lineCount} line${lineCount === 1 ? '' : 's'} ready · Shift+Enter new line · Enter stamp`
      : 'Type text');
  };

  const beginTextAt = (row: number, column: number) => {
    if (textSessionRef.current) {
      textInputRef.current?.focus({ preventScroll: true });
      return;
    }
    textSessionRef.current = { row, column };
    setTextAnchor({ row, column });
    setTextValue('');
    setTextPreviewBitmap(['0']);
    setTextCursorOffset({ row: 0, column: 0 });
    setSelection(null);
    setActionStatus('Type text');
    textInputRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => textInputRef.current?.focus());
  };

  const updateText = (value: string) => {
    setTextValue(value);
    updateTextPreviewBitmap(value);
  };

  const moveTextTo = (row: number, column: number) => {
    const session = textSessionRef.current;
    if (!session) return;
    session.row = row;
    session.column = column;
    setTextAnchor({ row, column });
    setActionStatus(textValue ? 'Position text · Enter to stamp' : 'Type text');
    textInputRef.current?.focus({ preventScroll: true });
  };

  const commitText = () => {
    const session = textSessionRef.current;
    if (!session) return;
    if (!textValue) {
      stopTextSession();
      setActionStatus('Text insertion cancelled');
      return;
    }
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    const next = overlayBitmapFrame(current, textPreviewBitmap, session.row, session.column);
    if (!next) {
      setActionStatus(`Text exceeds the ${MAX_BITMAP_DIMENSION} × ${MAX_BITMAP_DIMENSION} technical limit`);
      return;
    }
    replaceBitmap(next.rows, true, next.offsetCells);
    stopTextSession();
    setActionStatus('Text stamped');
  };

  const chooseTextFont = (fontId: PixelFontId) => {
    setSelectedFontId(fontId);
    void loadPixelFont(fontId, textPixelSize).then(() => {
      updateTextPreviewBitmap(textValue, fontId, textPixelSize);
      if (textSessionRef.current) requestAnimationFrame(() => textInputRef.current?.focus());
    });
  };

  const chooseTextSize = (pixelSize: number) => {
    if (!Number.isFinite(pixelSize)) return;
    const nextSize = Math.min(MAX_TEXT_PIXEL_SIZE, Math.max(MIN_TEXT_PIXEL_SIZE, Math.round(pixelSize)));
    setTextPixelSize(nextSize);
    updateTextPreviewBitmap(textValue, selectedFontId, nextSize);
  };

  const beginPaint = () => {
    paintBaseRef.current = {
      rows: bitmapRef.current,
      offsetCells: bitmapOffsetRef.current,
    };
  };

  const finishPaint = () => {
    const original = paintBaseRef.current;
    paintBaseRef.current = null;
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    if (!original || bitmapFramesMatch(original, current)) return;
    setPast((items) => [...items, original].slice(-80));
    setFuture([]);
    setActionStatus('Bitmap edited');
  };

  const undo = useCallback(() => {
    if (past.length === 0) return;
    stopTextSession();
    cancelPolygon();
    const previous = past.at(-1)!;
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 80));
    replaceBitmap(previous.rows, false, previous.offsetCells);
    setActionStatus('Undid edit');
  }, [cancelPolygon, past, replaceBitmap, stopTextSession]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    stopTextSession();
    cancelPolygon();
    const next = future[0];
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, current].slice(-80));
    replaceBitmap(next.rows, false, next.offsetCells);
    setActionStatus('Redid edit');
  }, [cancelPolygon, future, replaceBitmap, stopTextSession]);

  const exportPng = async () => {
    setExporting(true);
    setActionStatus('Preparing PNG…');
    try {
      const blob = await canvasRef.current?.exportPng();
      if (!blob) throw new Error('No canvas image was produced.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `retro-lcd-studio-${bitmapRef.current[0].length}x${bitmapRef.current.length}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionStatus('PNG saved');
    } catch (error) {
      console.error('Unable to export the LCD image.', error);
      setActionStatus('PNG export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('textarea, input, [contenteditable="true"]');
      const hasSpecialKeyHint = editTool === 'stamp'
        || editTool === 'line'
        || editTool === 'rectangle'
        || editTool === 'ellipse'
        || editTool === 'polygon';
      if (!event.repeat && mode === 'edit' && hasSpecialKeyHint
        && (event.key === 'Shift' || event.key === 'Enter' || event.key === 'Escape')) {
        setGestureHintRevision((revision) => revision + 1);
      }
      if (event.key === 'Escape' && mode !== 'view') {
        event.preventDefault();
        setSelection(null);
        chooseMode('view');
        setActionStatus('Returned to view');
        return;
      }
      if (event.key === 'Enter' && editTool === 'polygon' && polygonPoints.length > 0) {
        event.preventDefault();
        commitPolygon();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'v') chooseMode('view');
      if (event.key.toLowerCase() === 'e') chooseMode('edit');
      if (event.key.toLowerCase() === 'l') chooseMode('live');
      if (event.key.toLowerCase() === 'r') canvasRef.current?.resetView();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chooseMode, commitPolygon, editTool, mode, polygonPoints.length, redo, undo]);

  const loadBitmapAction = useCallback(async (source: string) => {
    const parsed = parseBitmap(source);
    if (!parsed.rows) throw new Error(parsed.error);
    clearLiveElements();
    replaceBitmap(parsed.rows, true, centeredBitmapOffset(parsed.rows));
    canvasRef.current?.resetView();
    setActionStatus('Bitmap loaded by browser tool');
    await nextFrame();
    return {
      width: parsed.rows[0].length,
      height: parsed.rows.length,
      bitmap: parsed.rows.join('\n'),
    };
  }, [clearLiveElements, replaceBitmap]);

  const resetViewAction = useCallback(async () => {
    canvasRef.current?.resetView();
    await nextFrame();
    return { reset: true };
  }, []);

  useEffect(() => {
    const modelContext = (document as unknown as { modelContext?: BrowserModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: BrowserTool[] = [
      {
        name: 'get_bitmap',
        title: 'Read bitmap',
        description: 'Read the current monochrome bitmap and its dimensions without changing it.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({
          width: bitmapRef.current[0].length,
          height: bitmapRef.current.length,
          bitmap: bitmapRef.current.join('\n'),
        }),
      },
      {
        name: 'load_bitmap',
        title: 'Load bitmap',
        description: 'Replace the visible bitmap with equal-width rows containing only 0 and 1.',
        inputSchema: {
          type: 'object',
          properties: {
            bitmap: {
              type: 'string',
              description: 'Newline-separated rows containing only 0 and 1.',
            },
          },
          required: ['bitmap'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          if (!input || typeof input !== 'object' || typeof (input as { bitmap?: unknown }).bitmap !== 'string') {
            throw new Error('bitmap must be a newline-separated string.');
          }
          return loadBitmapAction((input as { bitmap: string }).bitmap);
        },
      },
      {
        name: 'reset_view',
        title: 'Reset view',
        description: 'Return the LCD surface to its centered front-facing view.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: resetViewAction,
      },
    ];

    for (const tool of tools) {
      try {
        void Promise.resolve(
          modelContext.registerTool(tool, { signal: lifecycle.signal }),
        ).catch((error) => console.error(`Unable to register ${tool.name}.`, error));
      } catch (error) {
        console.error(`Unable to register ${tool.name}.`, error);
      }
    }
    return () => lifecycle.abort();
  }, [loadBitmapAction, resetViewAction]);

  const importImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setImportingImage(true);
    setActionStatus(`Converting ${file.name}…`);
    try {
      const rows = await imageFileToBitmap(file);
      clearLiveElements();
      replaceBitmap(rows, true, centeredBitmapOffset(rows));
      canvasRef.current?.resetView();
      setActionStatus(`${file.name} imported · ${rows[0].length} × ${rows.length} · 1:1`);
    } catch (error) {
      console.error('Unable to import the image.', error);
      setActionStatus(error instanceof Error ? error.message : 'Image import failed');
    } finally {
      setImportingImage(false);
    }
  };

  const activeColorPreset = LCD_COLOR_PRESETS.find(
    (preset) => preset.background === appearance.background
      && preset.pixel === appearance.pixel,
  );

  const applyColorPreset = (presetId: string) => {
    const preset = LCD_COLOR_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setAppearance((current) => ({
      ...current,
      background: preset.background,
      pixel: preset.pixel,
    }));
    setActionStatus(`Color preset: ${preset.label}`);
  };

  const setInvertedRendering = (inverted: boolean) => {
    setAppearance((current) => ({ ...current, inverted }));
    setActionStatus(inverted ? 'Pixel states inverted' : 'Pixel states normal');
  };

  const setGridVisible = (gridVisible: boolean) => {
    setAppearance((current) => ({ ...current, gridVisible }));
    setActionStatus(gridVisible ? 'Pixel grid visible' : 'Pixel grid hidden');
  };

  return (
    <main className="lcd-app" style={{ background: appearance.background }}>
      <aside
        id="controls-panel"
        className="controls-panel"
      >
        <h1 className="sr-only">Retro LCD Studio</h1>
        <div className="panel-section appearance-section">
          <section className="control-group controls-group" aria-labelledby="controls-heading">
            <h2 id="controls-heading">Controls</h2>
            <header className="panel-toolbar" aria-label="View and editing controls">
              <fieldset className="mode-switch" aria-label="Interaction mode">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'view' ? 'default' : 'ghost'}
                  aria-pressed={mode === 'view'}
                  onClick={() => chooseMode('view')}
                >
                  <Rotate3D data-icon="inline-start" />
                  <span className="button-label">View</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'edit' ? 'default' : 'ghost'}
                  aria-pressed={mode === 'edit'}
                  onClick={() => chooseMode('edit')}
                >
                  <Pencil data-icon="inline-start" />
                  <span className="button-label">Edit</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'live' ? 'default' : 'ghost'}
                  aria-pressed={mode === 'live'}
                  onClick={() => chooseMode('live')}
                >
                  <Play data-icon="inline-start" />
                  <span className="button-label">Live</span>
                </Button>
              </fieldset>

              <span className="bar-divider" aria-hidden="true" />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Open image"
                title="Open image"
                disabled={importingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                {importingImage ? <ImagePlus /> : <FolderOpen />}
              </Button>
              <input
                ref={imageInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                aria-label="Choose an image to convert to a bitmap"
                onChange={(event) => void importImage(event)}
              />
              {mode === 'edit' && (
                <>
                  <span className="bar-divider" aria-hidden="true" />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Undo" title="Undo" disabled={past.length === 0} onClick={undo}>
                    <Undo2 />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Redo" title="Redo" disabled={future.length === 0} onClick={redo}>
                    <Redo2 />
                  </Button>
                </>
              )}
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Reset view" title="Reset view" onClick={() => canvasRef.current?.resetView()}>
                <RotateCcw />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Export PNG" title="Export PNG" disabled={exporting} onClick={() => void exportPng()}>
                <Download />
              </Button>
            </header>

            {mode === 'edit' && (
              <div className="edit-tools" aria-label="Edit tools">
                <fieldset className="edit-tool-palette" aria-label="Edit tool">
                  <Button type="button" size="sm" variant={editTool === 'pen' ? 'default' : 'ghost'} aria-pressed={editTool === 'pen'} onClick={() => chooseEditTool('pen')}>
                    <Pencil /> <span>Pen</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'line' ? 'default' : 'ghost'} aria-pressed={editTool === 'line'} onClick={() => chooseEditTool('line')}>
                    <Minus /> <span>Line</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'rectangle' ? 'default' : 'ghost'} aria-pressed={editTool === 'rectangle'} onClick={() => chooseEditTool('rectangle')}>
                    <Square /> <span>Rectangle</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'ellipse' ? 'default' : 'ghost'} aria-pressed={editTool === 'ellipse'} onClick={() => chooseEditTool('ellipse')}>
                    <Circle /> <span>Ellipse</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'polygon' ? 'default' : 'ghost'} aria-pressed={editTool === 'polygon'} onClick={() => chooseEditTool('polygon')}>
                    <Pentagon /> <span>Polygon</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'fill' ? 'default' : 'ghost'} aria-label="Pattern fill" aria-pressed={editTool === 'fill'} onClick={() => chooseEditTool('fill')}>
                    <PaintBucket /> <span>Fill</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'text' ? 'default' : 'ghost'} aria-pressed={editTool === 'text'} onClick={() => chooseEditTool('text')}>
                    <Type /> <span>Text</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'stamp' ? 'default' : 'ghost'} aria-pressed={editTool === 'stamp'} onClick={() => chooseEditTool('stamp')}>
                    <Stamp /> <span>Stamp</span>
                  </Button>
                  <Button type="button" size="sm" variant={editTool === 'select' ? 'default' : 'ghost'} aria-pressed={editTool === 'select'} onClick={() => chooseEditTool('select')}>
                    <BoxSelect /> <span>Select</span>
                  </Button>
                </fieldset>

                {editTool === 'text' && (
                  <div className="text-tool-panel tool-options">
                    <fieldset className="font-picker" aria-label="Pixel font">
                      {PIXEL_FONTS.map((font) => (
                        <button
                          type="button"
                          className="font-choice"
                          key={font.id}
                          aria-pressed={selectedFontId === font.id}
                          onClick={() => chooseTextFont(font.id)}
                        >
                          <PixelFontThumbnail fontId={font.id} background={appearance.background} pixel={appearance.pixel} />
                          <span>{font.label}</span>
                        </button>
                      ))}
                    </fieldset>
                    <div className="control-slider text-size-control">
                      <span>
                        <label htmlFor="text-size-input">Size</label>
                        <span className="text-size-value">
                          <input
                            id="text-size-input"
                            type="number"
                            min={MIN_TEXT_PIXEL_SIZE}
                            max={MAX_TEXT_PIXEL_SIZE}
                            step={1}
                            value={textPixelSize}
                            aria-label="Text size in pixels"
                            onChange={(event) => chooseTextSize(event.target.valueAsNumber)}
                            onBlur={() => textSessionRef.current && textInputRef.current?.focus()}
                          />
                          px
                        </span>
                      </span>
                      <Slider
                        id="text-size-slider"
                        aria-label="Text size"
                        value={[textPixelSize]}
                        min={MIN_TEXT_PIXEL_SIZE}
                        max={MAX_TEXT_PIXEL_SIZE}
                        step={1}
                        onValueChange={(value) => chooseTextSize(firstSliderValue(value))}
                        onValueCommitted={() => {
                          if (textSessionRef.current) textInputRef.current?.focus({ preventScroll: true });
                        }}
                      />
                    </div>
                    <textarea
                      ref={textInputRef}
                      className="pixel-text-capture"
                      value={textValue}
                      maxLength={120}
                      disabled={!textAnchor}
                      aria-label="Text to place"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(event) => updateText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        if (event.shiftKey) return;
                        event.preventDefault();
                        commitText();
                      }}
                    />
                  </div>
                )}

                {editTool === 'stamp' && (
                  <div className="sprite-library tool-options" aria-label="Sprite library">
                    <div className="stamp-scale-control">
                      <ControlSlider
                        id="stamp-scale"
                        label="Scale"
                        value={stampScalePercent}
                        formattedValue={`${stampScalePercent}%`}
                        min={25}
                        max={400}
                        step={25}
                        onChange={changeStampScale}
                      />
                    </div>
                    <div className="sprite-grid clipboard-sprite-grid">
                      <button
                        type="button"
                        className="sprite-choice"
                        aria-label={clipboardBitmap ? 'Copied selection' : 'Copied selection unavailable'}
                        aria-pressed={selectedSpriteId === CLIPBOARD_SPRITE_ID}
                        disabled={!clipboardBitmap}
                        onClick={() => {
                          setSelectedSpriteId(CLIPBOARD_SPRITE_ID);
                          setActionStatus('Copied selection stamp selected');
                        }}
                      >
                        <BitmapThumbnail
                          rows={clipboardBitmap ?? ['0']}
                          background={appearance.background}
                          pixel={appearance.pixel}
                          inverted={false}
                        />
                      </button>
                    </div>
                    {SPRITE_CATEGORIES.map((category) => (
                      <section className="sprite-category" key={category.id} aria-labelledby={`sprite-category-${category.id}`}>
                        <h3 id={`sprite-category-${category.id}`}>{category.label}</h3>
                        <div className="sprite-grid">
                          {SPRITE_BITMAPS.filter((sprite) => sprite.category === category.id).map((sprite) => (
                            <button
                              type="button"
                              className="sprite-choice"
                              key={sprite.id}
                              aria-label={sprite.label}
                              title={sprite.label}
                              aria-pressed={selectedSpriteId === sprite.id}
                              onClick={() => {
                                setSelectedSpriteId(sprite.id);
                                setActionStatus(`${sprite.label} stamp selected`);
                              }}
                            >
                              <BitmapThumbnail rows={sprite.rows} background={appearance.background} pixel={appearance.pixel} inverted={false} />
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {editTool === 'fill' && (
                  <fieldset className="fill-pattern-picker tool-options" aria-label="Fill pattern">
                    {FILL_PATTERNS.map((pattern) => (
                      <button
                        type="button"
                        className="pattern-choice"
                        key={pattern.id}
                        aria-pressed={fillPattern === pattern.id}
                        onClick={() => {
                          setFillPattern(pattern.id);
                          setActionStatus(`${pattern.label} pattern selected`);
                        }}
                      >
                        <BitmapThumbnail rows={pattern.rows} background={appearance.background} pixel={appearance.pixel} inverted={false} />
                        <span>{pattern.label}</span>
                      </button>
                    ))}
                  </fieldset>
                )}

                {editTool === 'polygon' && polygonPoints.length > 0 && (
                  <div className="polygon-actions tool-options">
                    <span>{polygonPoints.length} point{polygonPoints.length === 1 ? '' : 's'}</span>
                    <Button type="button" size="sm" variant="default" disabled={polygonPoints.length < 3} onClick={commitPolygon}>
                      Close
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      cancelPolygon();
                      setActionStatus('Polygon cancelled');
                    }}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          {mode === 'live' && (
            <section className="control-group live-workspace" aria-labelledby="live-heading">
              <div className="live-heading-row">
                <h2 id="live-heading">Live elements</h2>
                <div className="live-master-actions">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={livePaused ? 'outline' : 'ghost'}
                    aria-label={livePaused ? 'Resume all live elements' : 'Pause all live elements'}
                    title={livePaused ? 'Resume all' : 'Pause all'}
                    onClick={() => setLivePaused((paused) => !paused)}
                  >
                    {livePaused ? <Play /> : <Pause />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    aria-expanded={liveAddOpen}
                    onClick={() => setLiveAddOpen((open) => !open)}
                  >
                    <Plus /> Add
                  </Button>
                </div>
              </div>

              {liveAddOpen && (
                <div className="live-add-menu" aria-label="Add live element">
                  <button type="button" onClick={() => addLiveElement('clock')}><Clock3 /><span>Clock</span></button>
                  <button type="button" onClick={() => addLiveElement('calendar')}><CalendarDays /><span>Calendar</span></button>
                  <button type="button" onClick={() => addLiveElement('mouse')}><MousePointer2 /><span>Mouse</span></button>
                  <button type="button" onClick={() => addLiveElement('ball')}><Circle /><span>Ball</span></button>
                </div>
              )}

              {liveElements.length === 0 ? (
                <div className="live-empty">
                  <span className="live-empty-pixels" aria-hidden="true">● ● ●</span>
                  <p>Add a clock, cursor, or moving object.</p>
                </div>
              ) : (
                <div className="live-element-list" aria-label="Live elements">
                  {liveElements.map((element) => {
                    const number = liveElements.filter((item) => item.type === element.type)
                      .findIndex((item) => item.id === element.id) + 1;
                    const label = `${element.type[0].toUpperCase()}${element.type.slice(1)} ${number}`;
                    const Icon = element.type === 'clock' ? Clock3
                      : element.type === 'calendar' ? CalendarDays
                      : element.type === 'mouse' ? MousePointer2
                      : Circle;
                    return (
                      <div className="live-element-row" data-selected={selectedLiveElementId === element.id} key={element.id}>
                        <button type="button" className="live-element-select" onClick={() => setSelectedLiveElementId(element.id)}>
                          <Icon /> <span>{label}</span>
                        </button>
                        <Switch
                          checked={element.enabled}
                          aria-label={`${element.enabled ? 'Disable' : 'Enable'} ${label}`}
                          onCheckedChange={(enabled) => updateLiveElement(element.id, { enabled })}
                        />
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${label}`} onClick={() => removeLiveElement(element.id)}>
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedLiveElement && (
                <div className="live-settings" aria-label={`${selectedLiveElement.type} settings`}>
                  {(selectedLiveElement.type === 'clock' || selectedLiveElement.type === 'calendar') && (
                    <>
                      <label className="live-field">
                        <span>Format</span>
                        <select
                          value={selectedLiveElement.format}
                          onChange={(event) => updateLiveElement(selectedLiveElement.id, {
                            format: event.target.value as ClockFormat | CalendarFormat,
                          } as Partial<LiveElement>)}
                        >
                          {(selectedLiveElement.type === 'clock' ? CLOCK_FORMATS : CALENDAR_FORMATS).map((format) => (
                            <option value={format.id} key={format.id}>{format.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="live-field">
                        <span>Font</span>
                        <select
                          value={selectedLiveElement.fontId}
                          onChange={(event) => {
                            const fontId = event.target.value as PixelFontId;
                            void loadPixelFont(fontId, selectedLiveElement.size)
                              .then(() => liveTextCacheRef.current.clear());
                            updateLiveElement(selectedLiveElement.id, { fontId } as Partial<LiveElement>);
                          }}
                        >
                          {PIXEL_FONTS.map((font) => <option value={font.id} key={font.id}>{font.label}</option>)}
                        </select>
                      </label>
                      <ControlSlider
                        id="live-text-size"
                        label="Size"
                        value={selectedLiveElement.size}
                        formattedValue={`${selectedLiveElement.size}px`}
                        min={MIN_TEXT_PIXEL_SIZE}
                        max={MAX_TEXT_PIXEL_SIZE}
                        step={1}
                        onChange={(size) => updateLiveElement(selectedLiveElement.id, { size } as Partial<LiveElement>)}
                      />
                      {selectedLiveTextOverflow && <p className="live-warning">This text is larger than the bitmap and will be centered and clipped.</p>}
                    </>
                  )}

                  {selectedLiveElement.type === 'mouse' && (
                    <>
                      <fieldset className="live-cursor-picker" aria-label="Cursor shape">
                        {CURSOR_SHAPES.map((shape) => (
                          <button
                            type="button"
                            key={shape.id}
                            aria-label={shape.label}
                            title={shape.label}
                            aria-pressed={selectedLiveElement.shape === shape.id}
                            onClick={() => updateLiveElement(selectedLiveElement.id, { shape: shape.id } as Partial<LiveElement>)}
                          >
                            <BitmapThumbnail rows={shape.rows} background={appearance.background} pixel={appearance.pixel} inverted={false} />
                          </button>
                        ))}
                      </fieldset>
                      <label className="live-field">
                        <span>Motion</span>
                        <select value={selectedLiveElement.pattern} onChange={(event) => updateLiveElement(selectedLiveElement.id, { pattern: event.target.value as CursorPatternId } as Partial<LiveElement>)}>
                          {CURSOR_PATTERNS.map((pattern) => <option value={pattern.id} key={pattern.id}>{pattern.label}</option>)}
                        </select>
                      </label>
                      <ControlSlider id="live-mouse-speed" label="Speed" value={selectedLiveElement.speed} formattedValue={`${selectedLiveElement.speed.toFixed(1)} cells/s`} min={0.5} max={30} step={0.5} onChange={(speed) => updateLiveElement(selectedLiveElement.id, { speed } as Partial<LiveElement>)} />
                    </>
                  )}

                  {selectedLiveElement.type === 'ball' && (
                    <>
                      <ControlSlider id="live-ball-size" label="Diameter" value={selectedLiveElement.size} formattedValue={`${selectedLiveElement.size} cells`} min={1} max={15} step={2} onChange={(size) => updateLiveElement(selectedLiveElement.id, { size } as Partial<LiveElement>)} />
                      <ControlSlider id="live-ball-speed" label="Speed" value={selectedLiveElement.speed} formattedValue={`${selectedLiveElement.speed.toFixed(1)} cells/s`} min={0.5} max={30} step={0.5} onChange={(speed) => updateLiveElement(selectedLiveElement.id, { speed } as Partial<LiveElement>)} />
                    </>
                  )}

                  <div className="live-position">
                    <label><span>Column</span><input type="number" value={selectedLiveElement.column} onChange={(event) => moveLiveElement(selectedLiveElement.id, selectedLiveElement.row, event.target.valueAsNumber)} /></label>
                    <label><span>Row</span><input type="number" value={selectedLiveElement.row} onChange={(event) => moveLiveElement(selectedLiveElement.id, event.target.valueAsNumber, selectedLiveElement.column)} /></label>
                  </div>
                </div>
              )}
            </section>
          )}

          {mode === 'view' && (
            <>
              <section className="control-group" aria-labelledby="style-heading">
              <h2 id="style-heading">Style</h2>
              <div className="preset-block">
                <RadioGroup
                  className="preset-grid"
                  value={activeColorPreset?.id ?? ''}
                  aria-label="LCD color preset"
                  onValueChange={applyColorPreset}
                >
                  {LCD_COLOR_PRESETS.map((preset) => (
                    <div className="preset-option" key={preset.id}>
                      <RadioGroupItem
                        className="preset-radio"
                        value={preset.id}
                        aria-label={preset.label}
                      />
                      <span
                        className="preset-swatch"
                        style={{ backgroundColor: preset.background }}
                        aria-hidden="true"
                      >
                        <i style={{ backgroundColor: preset.pixel }} />
                        <i style={{ backgroundColor: preset.pixel }} />
                        <i style={{ backgroundColor: preset.pixel }} />
                      </span>
                      <strong>{preset.label}</strong>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="color-controls">
                <ColorControl label="Pixel" value={appearance.pixel} onChange={(pixel) => setAppearance((current) => ({ ...current, pixel }))} />
                <ColorControl label="Background" value={appearance.background} onChange={(background) => setAppearance((current) => ({ ...current, background }))} />
              </div>

              <div className="style-toggles">
                <div className="toggle-control">
                  <label htmlFor="inverted-rendering">Invert pixels</label>
                  <Switch
                    id="inverted-rendering"
                    checked={appearance.inverted}
                    aria-label="Invert pixels"
                    onCheckedChange={setInvertedRendering}
                  />
                </div>
                <div className="toggle-control">
                  <label htmlFor="pixel-grid">Pixel grid</label>
                  <Switch
                    id="pixel-grid"
                    checked={appearance.gridVisible ?? false}
                    aria-label="Show pixel grid"
                    onCheckedChange={setGridVisible}
                  />
                </div>
              </div>
              </section>

              <section className="control-group geometry-group" aria-labelledby="geometry-heading">
              <h2 id="geometry-heading">Pixel geometry</h2>
              <GeometryGuide appearance={appearance} />
              <div className="geometry-controls">
                <ControlSlider id="pixel-width" label="Width" value={appearance.pixelWidthMm} formattedValue={formatMillimetres(appearance.pixelWidthMm)} min={0.25} max={5} step={0.05} onChange={(pixelWidthMm) => setAppearance((current) => ({ ...current, pixelWidthMm }))} />
                <ControlSlider id="pixel-height" label="Height" value={appearance.pixelHeightMm} formattedValue={formatMillimetres(appearance.pixelHeightMm)} min={0.25} max={5} step={0.05} onChange={(pixelHeightMm) => setAppearance((current) => ({ ...current, pixelHeightMm }))} />
                <ControlSlider id="pixel-gap" label="Gap" value={appearance.gapMm} formattedValue={formatMillimetres(appearance.gapMm)} min={0} max={1} step={0.01} onChange={(gapMm) => setAppearance((current) => ({ ...current, gapMm }))} />
              </div>
              </section>

              <section className="control-group" aria-labelledby="shadow-heading">
              <h2 id="shadow-heading">Shadow</h2>
              <ShadowGuide appearance={appearance} />
              <ControlSlider id="shadow-x" label="X offset" value={appearance.shadowOffsetMm[0]} formattedValue={formatMillimetres(appearance.shadowOffsetMm[0])} min={-1} max={1} step={0.01} onChange={(value) => setAppearance((current) => ({ ...current, shadowOffsetMm: [value, current.shadowOffsetMm[1]] }))} />
              <ControlSlider id="shadow-y" label="Y offset" value={appearance.shadowOffsetMm[1]} formattedValue={formatMillimetres(appearance.shadowOffsetMm[1])} min={-1} max={1} step={0.01} onChange={(value) => setAppearance((current) => ({ ...current, shadowOffsetMm: [current.shadowOffsetMm[0], value] }))} />
              <ControlSlider id="shadow-softness" label="Softness" value={appearance.shadowSoftnessMm} formattedValue={formatMillimetres(appearance.shadowSoftnessMm)} min={0} max={1} step={0.01} onChange={(shadowSoftnessMm) => setAppearance((current) => ({ ...current, shadowSoftnessMm }))} />
              <ControlSlider id="shadow-opacity" label="Opacity" value={appearance.shadowOpacity} formattedValue={`${Math.round(appearance.shadowOpacity * 100)}%`} min={0} max={0.6} step={0.01} onChange={(shadowOpacity) => setAppearance((current) => ({ ...current, shadowOpacity }))} />
              </section>

              <Button type="button" variant="outline" className="reset-appearance" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
                <Settings2 data-icon="inline-start" /> Reset
              </Button>
            </>
          )}
          </div>

        <output className="status-announcer" aria-live="polite">{actionStatus}</output>
      </aside>

      <section className="render-pane" aria-label="LCD render">
        <LcdCanvas
          ref={canvasRef}
          bitmap={bitmap}
          bitmapOffsetCells={bitmapOffsetCells}
          mode={mode}
          editTool={editTool}
          textCursorSize={textCursorSize}
          textAnchor={textAnchor}
          geometryPreviewAnchor={geometryPreview
            ? { row: geometryPreview.row, column: geometryPreview.column }
            : null}
          textCursorAnchor={textAnchor
            ? {
                row: textAnchor.row + textCursorOffset.row,
                column: textAnchor.column + textCursorOffset.column,
              }
            : null}
          stampBitmap={editTool === 'text'
            ? textPreviewBitmap
            : geometryPreview
              ? geometryPreview.rows
              : stampBitmap}
          selection={mode === 'edit' && editTool === 'select' ? selection : null}
          selectedLiveElementId={mode === 'live' ? selectedLiveElementId : null}
          onPixelChange={setPixel}
          onStamp={stampAt}
          onStampScale={nudgeStampScale}
          onLiveSelect={setSelectedLiveElementId}
          onLiveMove={moveLiveElement}
          onLiveDragState={setLiveDragState}
          onTextStart={beginTextAt}
          onTextMove={moveTextTo}
          onGeometryPreview={previewGeometry}
          onGeometryCommit={commitGeometry}
          onGeometryCancel={cancelGeometryPreview}
          onGeometryPoint={addPolygonPoint}
          onGeometryHover={hoverPolygon}
          onSelectionChange={setSelection}
          onSelectionEnd={copySelectionToBuffer}
          onPaintStart={beginPaint}
          onPaintEnd={finishPaint}
          appearance={appearance}
        />

        {showGestureHint && <div className="gesture-hint" aria-live="polite">
          <MousePointer2 aria-hidden="true" />
          {mode === 'view' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> tilt · <strong>Shift</strong> pan · <strong>Option</strong> rotate · <strong>Scroll</strong> zoom</span>
              <span className="touch-gesture-hint"><strong>1 finger</strong> tilts · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          ) : mode === 'live' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag an element</strong> move · <strong>Drag empty space</strong> tilt · <strong>Shift</strong> pan · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Drag an element</strong> move · <strong>2 fingers</strong> navigate · <strong>Esc</strong> view</span>
            </>
          ) : editTool === 'pen' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> paint · <strong>Shift</strong> pan · <strong>Scroll</strong> zoom · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>1 finger</strong> paints · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          ) : editTool === 'text' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Click</strong> to type · <strong>Shift+Enter</strong> line · <strong>Enter</strong> stamp · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Tap</strong> to type · <strong>Drag</strong> position · <strong>Enter</strong> stamp</span>
            </>
          ) : editTool === 'stamp' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Click</strong> stamp · <strong>Shift+Scroll</strong> scale · <strong>Scroll</strong> zoom · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Tap</strong> stamp · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          ) : editTool === 'line' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> line · <strong>Shift</strong> snap · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Drag</strong> line · <strong>2 fingers</strong> navigate</span>
            </>
          ) : editTool === 'rectangle' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> rectangle · <strong>Shift</strong> square · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Drag</strong> rectangle · <strong>2 fingers</strong> navigate</span>
            </>
          ) : editTool === 'ellipse' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> ellipse · <strong>Shift</strong> circle · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Drag</strong> ellipse · <strong>2 fingers</strong> navigate</span>
            </>
          ) : editTool === 'polygon' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Click</strong> points · <strong>Enter</strong> close · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Tap</strong> points · tap first point or <strong>Close</strong></span>
            </>
          ) : editTool === 'fill' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Click</strong> connected region to fill · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Tap</strong> connected region to fill</span>
            </>
          ) : (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> select · <strong>Shift</strong> pan · <strong>Scroll</strong> zoom · <strong>Esc</strong> view</span>
              <span className="touch-gesture-hint"><strong>Drag</strong> select · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          )}
        </div>}
      </section>
    </main>
  );
}
