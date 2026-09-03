'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  MousePointer2,
  Pencil,
  Redo2,
  Rotate3D,
  RotateCcw,
  Settings2,
  Undo2,
} from 'lucide-react';

import {
  LcdCanvas,
  type LcdAppearance,
  type LcdCanvasHandle,
  type LcdMode,
} from '@/app/lcd-canvas';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
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

const DEMO_BITMAPS = [
  {
    id: 'empty',
    label: 'Empty',
    rows: ['0'],
  },
  {
    id: 'lcd',
    label: 'LCD',
    rows: INITIAL_BITMAP,
  },
  {
    id: 'smile',
    label: 'Smile',
    rows: [
      '00111111100',
      '01000000010',
      '10010001001',
      '10010001001',
      '10000000001',
      '10100000101',
      '10011111001',
      '01000000010',
      '00111111100',
    ],
  },
  {
    id: 'invader',
    label: 'Invader',
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
    id: 'checker',
    label: 'Checker',
    rows: [
      '101010101010',
      '010101010101',
      '101010101010',
      '010101010101',
      '101010101010',
      '010101010101',
      '101010101010',
      '010101010101',
    ],
  },
];

const DEFAULT_APPEARANCE: LcdAppearance = {
  background: '#aeb5a7',
  pixel: '#111512',
  inverted: false,
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

function bitmapsMatch(first: string[], second: string[]) {
  return first.length === second.length && first.every((row, index) => row === second[index]);
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

export function LcdStudio() {
  const canvasRef = useRef<LcdCanvasHandle>(null);
  const bitmapRef = useRef(INITIAL_BITMAP);
  const bitmapOffsetRef = useRef<[number, number]>(INITIAL_BITMAP_OFFSET);
  const paintBaseRef = useRef<BitmapFrame | null>(null);

  const [mode, setMode] = useState<LcdMode>('view');
  const [bitmap, setBitmap] = useState(INITIAL_BITMAP);
  const [bitmapOffsetCells, setBitmapOffsetCells] = useState<[number, number]>(INITIAL_BITMAP_OFFSET);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [past, setPast] = useState<BitmapFrame[]>([]);
  const [future, setFuture] = useState<BitmapFrame[]>([]);
  const [exporting, setExporting] = useState(false);
  const [bitmapPickerOpen, setBitmapPickerOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState('Ready');

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
    const previous = past.at(-1)!;
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 80));
    replaceBitmap(previous.rows, false, previous.offsetCells);
    setActionStatus('Undid edit');
  }, [past, replaceBitmap]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const current = { rows: bitmapRef.current, offsetCells: bitmapOffsetRef.current };
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, current].slice(-80));
    replaceBitmap(next.rows, false, next.offsetCells);
    setActionStatus('Redid edit');
  }, [future, replaceBitmap]);

  const exportPng = async () => {
    setExporting(true);
    setActionStatus('Preparing PNG…');
    try {
      const blob = await canvasRef.current?.exportPng();
      if (!blob) throw new Error('No canvas image was produced.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `retro-lcd-${bitmapRef.current[0].length}x${bitmapRef.current.length}.png`;
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'v') setMode('view');
      if (event.key.toLowerCase() === 'e') setMode('edit');
      if (event.key.toLowerCase() === 'r') canvasRef.current?.resetView();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const loadBitmapAction = useCallback(async (source: string) => {
    const parsed = parseBitmap(source);
    if (!parsed.rows) throw new Error(parsed.error);
    replaceBitmap(parsed.rows, true, centeredBitmapOffset(parsed.rows));
    canvasRef.current?.resetView();
    setActionStatus('Bitmap loaded by browser tool');
    await nextFrame();
    return {
      width: parsed.rows[0].length,
      height: parsed.rows.length,
      bitmap: parsed.rows.join('\n'),
    };
  }, [replaceBitmap]);

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

  const activeBitmapDemo = DEMO_BITMAPS.find((demo) => {
    const centeredOffset = centeredBitmapOffset(demo.rows);
    return bitmapsMatch(bitmap, demo.rows)
      && bitmapOffsetCells[0] === centeredOffset[0]
      && bitmapOffsetCells[1] === centeredOffset[1];
  });

  const applyBitmapDemo = (demoId: string | null) => {
    const demo = DEMO_BITMAPS.find((item) => item.id === demoId);
    if (!demo) return;
    replaceBitmap(demo.rows, true, centeredBitmapOffset(demo.rows));
    canvasRef.current?.resetView();
    setBitmapPickerOpen(false);
    setActionStatus(`Bitmap loaded: ${demo.label}`);
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

  return (
    <main className="lcd-app" style={{ background: appearance.background }}>
      <aside
        id="controls-panel"
        className="controls-panel"
      >
        <h1 className="sr-only">Retro LCD studio</h1>
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
                  onClick={() => setMode('view')}
                >
                  <Rotate3D data-icon="inline-start" />
                  <span className="button-label">View</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'edit' ? 'default' : 'ghost'}
                  aria-pressed={mode === 'edit'}
                  onClick={() => setMode('edit')}
                >
                  <Pencil data-icon="inline-start" />
                  <span className="button-label">Edit</span>
                </Button>
              </fieldset>

              <span className="bar-divider" aria-hidden="true" />
              <Popover open={bitmapPickerOpen} onOpenChange={setBitmapPickerOpen}>
                <PopoverTrigger
                  render={(
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Open bitmap" title="Open bitmap" />
                  )}
                >
                  <FolderOpen />
                </PopoverTrigger>
                <PopoverContent className="bitmap-picker" align="start" sideOffset={8}>
                  <PopoverTitle className="bitmap-picker-title">Open bitmap</PopoverTitle>
                  <div className="bitmap-picker-grid">
                    {DEMO_BITMAPS.map((demo) => (
                      <button
                        type="button"
                        className="bitmap-choice"
                        key={demo.id}
                        aria-pressed={activeBitmapDemo?.id === demo.id}
                        onClick={() => applyBitmapDemo(demo.id)}
                      >
                        <BitmapThumbnail rows={demo.rows} background={appearance.background} pixel={appearance.pixel} inverted={appearance.inverted} />
                        <span>{demo.label}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Undo" title="Undo" disabled={past.length === 0} onClick={undo}>
                <Undo2 />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Redo" title="Redo" disabled={future.length === 0} onClick={redo}>
                <Redo2 />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Reset view" title="Reset view" onClick={() => canvasRef.current?.resetView()}>
                <RotateCcw />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Export PNG" title="Export PNG" disabled={exporting} onClick={() => void exportPng()}>
                <Download />
              </Button>
            </header>
          </section>

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

              <div className="toggle-control">
                <label htmlFor="inverted-rendering">Invert pixels</label>
                <Switch
                  id="inverted-rendering"
                  checked={appearance.inverted}
                  aria-label="Invert pixels"
                  onCheckedChange={setInvertedRendering}
                />
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
          </div>

        <output className="status-announcer" aria-live="polite">{actionStatus}</output>
      </aside>

      <section className="render-pane" aria-label="LCD render">
        <LcdCanvas
          ref={canvasRef}
          bitmap={bitmap}
          bitmapOffsetCells={bitmapOffsetCells}
          mode={mode}
          onPixelChange={setPixel}
          onPaintStart={beginPaint}
          onPaintEnd={finishPaint}
          appearance={appearance}
        />

        <div className="gesture-hint" aria-live="polite">
          <MousePointer2 aria-hidden="true" />
          {mode === 'view' ? (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> tilt · <strong>Shift</strong> pan · <strong>Option</strong> rotate · <strong>Scroll</strong> zoom</span>
              <span className="touch-gesture-hint"><strong>1 finger</strong> tilts · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          ) : (
            <>
              <span className="mouse-gesture-hint"><strong>Drag</strong> paint · <strong>Shift</strong> pan · <strong>Option</strong> rotate · <strong>Scroll</strong> zoom</span>
              <span className="touch-gesture-hint"><strong>1 finger</strong> paints · <strong>2 fingers</strong> move, zoom &amp; rotate</span>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
