'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Grid2X2,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
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

function formatMillimetreDimensions(width: number, height: number) {
  return `${width.toFixed(2)} × ${height.toFixed(2)} mm`;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function ControlSlider({
  label,
  value,
  formattedValue,
  min,
  max,
  step,
  onChange,
}: {
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
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(nextValue) => onChange(firstSliderValue(nextValue))}
      />
    </label>
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
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

      <header className="instrument-bar" aria-label="Retro LCD controls">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Grid2X2 /></span>
          <span className="brand-copy">
            <strong>LCD/01</strong>
            <small>BITMAP SURFACE</small>
          </span>
        </div>

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
        <Button
          type="button"
          size="icon-sm"
          variant={panelOpen ? 'secondary' : 'ghost'}
          aria-label={panelOpen ? 'Close settings' : 'Open settings'}
          aria-expanded={panelOpen}
          aria-controls="settings-panel"
          title={panelOpen ? 'Close settings' : 'Open settings'}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
        </Button>
      </header>

      <aside className="surface-readout" aria-label="Virtual LCD surface">
        <span>MONO</span>
        <strong>VIRTUAL ∞</strong>
        <i aria-hidden="true" />
      </aside>

      <aside
        id="settings-panel"
        className="settings-panel"
        data-open={panelOpen}
        aria-hidden={!panelOpen}
        inert={!panelOpen}
      >
        <div className="panel-heading">
          <h1>Appearance</h1>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Close appearance" onClick={() => setPanelOpen(false)}>
            <PanelRightClose />
          </Button>
        </div>

        <div className="panel-section appearance-section">
          <section className="control-group" aria-labelledby="palette-heading">
            <h2 id="palette-heading">Palette</h2>
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
              <ColorControl label="Surface" value={appearance.background} onChange={(background) => setAppearance((current) => ({ ...current, background }))} />
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

          <section className="control-group" aria-labelledby="geometry-heading">
            <h2 id="geometry-heading">Pixel geometry</h2>
            <ControlSlider label="Width" value={appearance.pixelWidthMm} formattedValue={formatMillimetres(appearance.pixelWidthMm)} min={0.25} max={5} step={0.05} onChange={(pixelWidthMm) => setAppearance((current) => ({ ...current, pixelWidthMm }))} />
            <ControlSlider label="Height" value={appearance.pixelHeightMm} formattedValue={formatMillimetres(appearance.pixelHeightMm)} min={0.25} max={5} step={0.05} onChange={(pixelHeightMm) => setAppearance((current) => ({ ...current, pixelHeightMm }))} />
            <ControlSlider label="Gap" value={appearance.gapMm} formattedValue={formatMillimetres(appearance.gapMm)} min={0} max={1} step={0.01} onChange={(gapMm) => setAppearance((current) => ({ ...current, gapMm }))} />
            <div className="derived-value">
              <span>Pitch</span>
              <output>{formatMillimetreDimensions(appearance.pixelWidthMm + appearance.gapMm, appearance.pixelHeightMm + appearance.gapMm)}</output>
            </div>
          </section>

          <section className="control-group" aria-labelledby="shadow-heading">
            <h2 id="shadow-heading">Shadow</h2>
            <ControlSlider label="X offset" value={appearance.shadowOffsetMm[0]} formattedValue={formatMillimetres(appearance.shadowOffsetMm[0])} min={-1} max={1} step={0.01} onChange={(value) => setAppearance((current) => ({ ...current, shadowOffsetMm: [value, current.shadowOffsetMm[1]] }))} />
            <ControlSlider label="Y offset" value={appearance.shadowOffsetMm[1]} formattedValue={formatMillimetres(appearance.shadowOffsetMm[1])} min={-1} max={1} step={0.01} onChange={(value) => setAppearance((current) => ({ ...current, shadowOffsetMm: [current.shadowOffsetMm[0], value] }))} />
            <ControlSlider label="Softness" value={appearance.shadowSoftnessMm} formattedValue={formatMillimetres(appearance.shadowSoftnessMm)} min={0} max={1} step={0.01} onChange={(shadowSoftnessMm) => setAppearance((current) => ({ ...current, shadowSoftnessMm }))} />
            <ControlSlider label="Opacity" value={appearance.shadowOpacity} formattedValue={`${Math.round(appearance.shadowOpacity * 100)}%`} min={0} max={0.6} step={0.01} onChange={(shadowOpacity) => setAppearance((current) => ({ ...current, shadowOpacity }))} />
          </section>

          <Button type="button" variant="outline" className="reset-appearance" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
            <Settings2 data-icon="inline-start" /> Reset
          </Button>
        </div>

        <output className="status-announcer" aria-live="polite">{actionStatus}</output>
      </aside>

      <div className="gesture-hint" aria-live="polite" data-panel-open={panelOpen}>
        <MousePointer2 aria-hidden="true" />
        {mode === 'view' ? (
          <span><strong>Drag</strong> to tilt · <strong>Shift-drag</strong> to pan · <strong>Scroll</strong> to zoom</span>
        ) : (
          <span><strong>Drag</strong> to paint · <strong>Shift-drag</strong> to pan · <strong>Scroll</strong> to zoom</span>
        )}
      </div>
    </main>
  );
}
