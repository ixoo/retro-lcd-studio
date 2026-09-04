'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { LiveSpriteFrame } from '@/app/live-elements';

export type LcdMode = 'view' | 'edit' | 'live';
export type LcdEditTool = 'pen' | 'text' | 'stamp' | 'select' | 'line' | 'rectangle' | 'ellipse' | 'polygon' | 'fill';

export type LcdSelection = {
  row: number;
  column: number;
  width: number;
  height: number;
};

export type LcdAppearance = {
  background: string;
  pixel: string;
  inverted: boolean;
  gridVisible: boolean;
  /** Active pixel dimensions in millimetres. */
  pixelWidthMm: number;
  pixelHeightMm: number;
  /** Physical separation between adjacent active pixels in millimetres. */
  gapMm: number;
  shadowOffsetMm: [number, number];
  shadowSoftnessMm: number;
  shadowOpacity: number;
};

export type LcdCanvasHandle = {
  resetView: () => void;
  exportPng: () => Promise<Blob | null>;
  setLiveFrames: (frames: LiveSpriteFrame[]) => void;
};

type LcdCanvasProps = {
  bitmap: string[];
  bitmapOffsetCells: [number, number];
  mode: LcdMode;
  editTool: LcdEditTool;
  geometryConstrained: boolean;
  stampBitmap: string[];
  geometryPreviewAnchor: { row: number; column: number } | null;
  textCursorSize: [number, number];
  textAnchor: { row: number; column: number } | null;
  textCursorAnchor: { row: number; column: number } | null;
  selection: LcdSelection | null;
  selectedLiveElementId: string | null;
  appearance: LcdAppearance;
  onPixelChange: (row: number, column: number, value: 0 | 1) => void;
  onStamp: (row: number, column: number) => void;
  onStampScale: (steps: number) => void;
  onLiveSelect: (id: string | null) => void;
  onLiveMove: (id: string, row: number, column: number) => void;
  onLiveDragState: (id: string, dragging: boolean) => void;
  onTextStart: (row: number, column: number) => void;
  onTextMove: (row: number, column: number) => void;
  onGeometryPreview: (start: { row: number; column: number }, end: { row: number; column: number }, constrain: boolean) => void;
  onGeometryCommit: (start: { row: number; column: number }, end: { row: number; column: number }, constrain: boolean) => void;
  onGeometryCancel: () => void;
  onGeometryPoint: (row: number, column: number) => void;
  onGeometryHover: (cell: { row: number; column: number } | null) => void;
  onSelectionChange: (selection: LcdSelection) => void;
  onSelectionEnd: (selection: LcdSelection) => void;
  onPaintStart?: () => void;
  onPaintEnd?: () => void;
};

type Camera = {
  yaw: number;
  pitch: number;
  roll: number;
  zoom: number;
  panX: number;
  panY: number;
  fitted: boolean;
};

type LocalGpuShaderModule = {
  getCompilationInfo: () => Promise<{
    messages: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      lineNum: number;
      linePos: number;
    }>;
  }>;
};
type LocalGpuBindGroup = object;
type LocalGpuBindGroupLayout = object;

type LocalGpuBuffer = {
  destroy: () => void;
};

type LocalGpuTexture = {
  createView: () => object;
  destroy: () => void;
};

type LocalGpuRenderPass = {
  setPipeline: (pipeline: LocalGpuPipeline) => void;
  setBindGroup: (index: number, bindGroup: LocalGpuBindGroup) => void;
  draw: (vertexCount: number) => void;
  end: () => void;
};

type LocalGpuCommandEncoder = {
  beginRenderPass: (descriptor: object) => LocalGpuRenderPass;
  finish: () => object;
};

type LocalGpuPipeline = {
  getBindGroupLayout: (index: number) => LocalGpuBindGroupLayout;
};

type LocalGpuDevice = {
  queue: {
    writeTexture: (
      destination: { texture: LocalGpuTexture; origin?: [number, number, number] },
      data: Uint8Array,
      layout: { bytesPerRow: number; rowsPerImage: number },
      size: { width: number; height: number; depthOrArrayLayers: number },
    ) => void;
    writeBuffer: (buffer: LocalGpuBuffer, offset: number, data: Float32Array) => void;
    submit: (commands: object[]) => void;
  };
  createShaderModule: (descriptor: { code: string }) => LocalGpuShaderModule;
  createRenderPipeline: (descriptor: object) => LocalGpuPipeline;
  createBuffer: (descriptor: { size: number; usage: number }) => LocalGpuBuffer;
  createTexture: (descriptor: object) => LocalGpuTexture;
  createBindGroup: (descriptor: object) => LocalGpuBindGroup;
  createCommandEncoder: () => LocalGpuCommandEncoder;
  pushErrorScope: (filter: 'validation') => void;
  popErrorScope: () => Promise<{ message: string } | null>;
  addEventListener: (
    type: 'uncapturederror',
    listener: (event: { error: { message: string } }) => void,
  ) => void;
};

type LocalGpuApi = {
  requestAdapter: () => Promise<{
    requestDevice: () => Promise<LocalGpuDevice>;
  } | null>;
  getPreferredCanvasFormat: () => string;
};

type LocalGpuCanvasContext = {
  configure: (configuration: object) => void;
  getCurrentTexture: () => LocalGpuTexture;
};

type GpuRuntime = {
  device: LocalGpuDevice;
  context: LocalGpuCanvasContext;
  pipeline: LocalGpuPipeline;
  uniformBuffer: LocalGpuBuffer;
  bitmapTexture: LocalGpuTexture | null;
  liveTexture: LocalGpuTexture | null;
  bindGroup: LocalGpuBindGroup | null;
  bitmapWidth: number;
  bitmapHeight: number;
  resize: () => void;
  draw: () => void;
  replaceBitmap: (bitmap: string[]) => void;
  replaceStamp: (bitmap: string[]) => void;
  replaceLiveFrames: (frames: LiveSpriteFrame[]) => void;
  destroy: () => void;
};

const MAX_TILT_RADIANS = 1.38;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 180;

const SHADER = /* wgsl */ `
struct Uniforms {
  viewport: vec2<f32>,
  bitmapSize: vec2<f32>,
  invRow0: vec2<f32>,
  invRow1: vec2<f32>,
  pan: vec2<f32>,
  scale: f32,
  shadowOpacity: f32,
  geometryMm: vec4<f32>,
  shadowOffsetMm: vec2<f32>,
  bitmapOffsetCells: vec2<f32>,
  background: vec4<f32>,
  pixelColor: vec4<f32>,
  stampPreview: vec4<f32>,
  selection: vec4<f32>,
  textCursor: vec4<f32>,
  liveSelection: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var bitmapTexture: texture_2d<u32>;
@group(0) @binding(2) var stampTexture: texture_2d<u32>;
@group(0) @binding(3) var liveTexture: texture_2d<u32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var output: VertexOutput;
  output.position = vec4<f32>(positions[index], 0.0, 1.0);
  return output;
}

fn gridCoordinates(local: vec2<f32>) -> vec2<f32> {
  let pixelSizeMm = uniforms.geometryMm.xy;
  let pitchMm = pixelSizeMm + vec2<f32>(uniforms.geometryMm.z);
  return vec2<f32>(
    local.x / pitchMm.x - uniforms.bitmapOffsetCells.x,
    -local.y / pitchMm.y - uniforms.bitmapOffsetCells.y
  );
}

fn cellPixelDistance(grid: vec2<f32>) -> f32 {
  let pixelSizeMm = uniforms.geometryMm.xy;
  let pitchMm = pixelSizeMm + vec2<f32>(uniforms.geometryMm.z);
  let withinCell = fract(grid);
  let fromCenterMm = (withinCell - vec2<f32>(0.5)) * pitchMm;
  let edgeDistanceMm = abs(fromCenterMm) - 0.5 * pixelSizeMm;
  return max(edgeDistanceMm.x, edgeDistanceMm.y);
}

fn activePixelDistance(local: vec2<f32>) -> f32 {
  let dimensions = uniforms.bitmapSize;
  let grid = gridCoordinates(local);
  let cell = floor(grid);
  let insideBitmap = cell.x >= 0.0 && cell.y >= 0.0
    && cell.x < dimensions.x && cell.y < dimensions.y;
  var pixelValue = 0u;
  var liveValue = 0u;

  if (insideBitmap) {
    pixelValue = textureLoad(bitmapTexture, vec2<i32>(cell), 0).r;
    liveValue = textureLoad(liveTexture, vec2<i32>(cell), 0).r;
  }

  let appearanceFlags = u32(uniforms.background.a + 0.5);
  let isInverted = (appearanceFlags & 1u) != 0u;
  var compositeIsOn = pixelValue == 1u || (liveValue & 1u) != 0u;
  if ((liveValue & 2u) != 0u) {
    compositeIsOn = !compositeIsOn;
  }
  let isRenderedOn = select(compositeIsOn, !compositeIsOn, isInverted);
  if (!isRenderedOn) {
    return 1000.0;
  }

  return cellPixelDistance(grid);
}

fn stampPreviewDistance(local: vec2<f32>) -> f32 {
  let grid = gridCoordinates(local);
  let cell = floor(grid);
  let origin = uniforms.stampPreview.xy;
  let dimensions = uniforms.stampPreview.zw;
  let stampCell = cell - origin;
  let insideStamp = stampCell.x >= 0.0 && stampCell.y >= 0.0
    && stampCell.x < dimensions.x && stampCell.y < dimensions.y;

  if (!insideStamp) {
    return 1000.0;
  }

  let stampValue = textureLoad(stampTexture, vec2<i32>(stampCell), 0).r;
  if (stampValue != 1u) {
    return 1000.0;
  }

  return cellPixelDistance(grid);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let centeredScreen = vec2<f32>(
    input.position.x - uniforms.viewport.x * 0.5 - uniforms.pan.x,
    uniforms.viewport.y * 0.5 - input.position.y - uniforms.pan.y
  );
  let local = vec2<f32>(
    dot(uniforms.invRow0, centeredScreen),
    dot(uniforms.invRow1, centeredScreen)
  ) / uniforms.scale;

  let footprint = max(fwidth(local.x), fwidth(local.y));
  let antialias = max(footprint * 0.72, 0.001);
  let pixelDistance = activePixelDistance(local);
  let shadowDistance = activePixelDistance(local - uniforms.shadowOffsetMm);
  let stampDistance = stampPreviewDistance(local);
  let gridDistance = cellPixelDistance(gridCoordinates(local));
  let selectionGrid = gridCoordinates(local);
  let selectionOrigin = uniforms.selection.xy;
  let selectionSize = uniforms.selection.zw;
  let selectionEnd = selectionOrigin + selectionSize;
  let selectionCell = floor(selectionGrid);
  let insideSelection = selectionSize.x > 0.0 && selectionSize.y > 0.0
    && selectionCell.x >= selectionOrigin.x && selectionCell.y >= selectionOrigin.y
    && selectionCell.x < selectionEnd.x && selectionCell.y < selectionEnd.y;
  let selectionCellDistance = cellPixelDistance(selectionGrid);
  let selectionCoverage = (1.0 - smoothstep(-antialias, antialias, selectionCellDistance))
    * select(0.0, 1.0, insideSelection);
  let insideBitmapForSelection = selectionCell.x >= 0.0 && selectionCell.y >= 0.0
    && selectionCell.x < uniforms.bitmapSize.x && selectionCell.y < uniforms.bitmapSize.y;
  var selectedPixelValue = 0u;
  if (insideBitmapForSelection) {
    selectedPixelValue = textureLoad(bitmapTexture, vec2<i32>(selectionCell), 0).r;
  }
  let pixelCoverage = 1.0 - smoothstep(-antialias, antialias, pixelDistance);
  let stampCoverage = 1.0 - smoothstep(-antialias, antialias, stampDistance);
  let shadowFeather = max(uniforms.geometryMm.w, antialias);
  var shadowCoverage = (1.0 - smoothstep(-shadowFeather, shadowFeather, shadowDistance))
    * uniforms.shadowOpacity;

  let appearanceFlags = u32(uniforms.background.a + 0.5);
  let isInverted = (appearanceFlags & 1u) != 0u;
  let gridVisible = (appearanceFlags & 2u) != 0u;
  let selectedPixelWasOn = select(
    selectedPixelValue == 1u,
    selectedPixelValue == 0u,
    isInverted
  );
  let shadowSelectionCell = floor(gridCoordinates(local - uniforms.shadowOffsetMm));
  let shadowInsideSelection = selectionSize.x > 0.0 && selectionSize.y > 0.0
    && shadowSelectionCell.x >= selectionOrigin.x && shadowSelectionCell.y >= selectionOrigin.y
    && shadowSelectionCell.x < selectionEnd.x && shadowSelectionCell.y < selectionEnd.y;
  let shadowCellInsideBitmap = shadowSelectionCell.x >= 0.0 && shadowSelectionCell.y >= 0.0
    && shadowSelectionCell.x < uniforms.bitmapSize.x && shadowSelectionCell.y < uniforms.bitmapSize.y;
  var shadowPixelValue = 0u;
  if (shadowCellInsideBitmap) {
    shadowPixelValue = textureLoad(bitmapTexture, vec2<i32>(shadowSelectionCell), 0).r;
  }
  let selectedShadowWasOn = select(
    shadowPixelValue == 1u,
    shadowPixelValue == 0u,
    isInverted
  );
  if (shadowInsideSelection && selectedShadowWasOn) {
    shadowCoverage = 0.0;
  }
  let minimumPixelSize = min(uniforms.geometryMm.x, uniforms.geometryMm.y);
  let gridFade = 1.0 - smoothstep(minimumPixelSize * 0.25, minimumPixelSize * 0.55, footprint);
  let gridCoverage = (1.0 - smoothstep(0.0, antialias * 0.9, abs(gridDistance)))
    * gridFade * select(0.0, 0.07, gridVisible);
  let selectedOnMask = select(
    0.0,
    1.0,
    insideSelection && selectedPixelWasOn
  );
  let visiblePixelCoverage = pixelCoverage * (1.0 - selectedOnMask);

  var color = mix(uniforms.background.rgb, uniforms.pixelColor.rgb, gridCoverage);
  color = mix(color, vec3<f32>(0.0), shadowCoverage);
  color = mix(color, uniforms.pixelColor.rgb, visiblePixelCoverage * uniforms.pixelColor.a);
  var selectedLivePixel = false;
  if (insideBitmapForSelection) {
    selectedLivePixel = (textureLoad(liveTexture, vec2<i32>(selectionCell), 0).r & 4u) != 0u;
  }
  let selectedLivePixelCoverage = pixelCoverage * select(0.0, 1.0, selectedLivePixel);
  let selectedLivePixelColor = mix(uniforms.background.rgb, uniforms.pixelColor.rgb, 0.48);
  color = mix(color, selectedLivePixelColor, selectedLivePixelCoverage * 0.82);
  var stampTarget = uniforms.pixelColor.rgb;
  if (isInverted) {
    stampTarget = uniforms.background.rgb;
  }
  color = mix(color, stampTarget, stampCoverage * 0.42);
  let selectionColor = mix(
    uniforms.background.rgb,
    uniforms.pixelColor.rgb,
    0.46
  );
  let selectedOffMask = select(
    0.0,
    1.0,
    insideSelection && !selectedPixelWasOn
  );
  color = mix(color, selectionColor, selectionCoverage * selectedOffMask * 0.96);
  let liveSelectionOrigin = uniforms.liveSelection.xy;
  let liveSelectionSize = uniforms.liveSelection.zw;
  let liveSelectionEnd = liveSelectionOrigin + liveSelectionSize;
  let insideLiveSelection = liveSelectionSize.x > 0.0 && liveSelectionSize.y > 0.0
    && selectionCell.x >= liveSelectionOrigin.x && selectionCell.y >= liveSelectionOrigin.y
    && selectionCell.x < liveSelectionEnd.x && selectionCell.y < liveSelectionEnd.y;
  let liveSelectionCell = selectionCell - liveSelectionOrigin;
  let liveSelectionEdge = insideLiveSelection && (
    liveSelectionCell.x < 1.0 || liveSelectionCell.y < 1.0
    || liveSelectionCell.x >= liveSelectionSize.x - 1.0
    || liveSelectionCell.y >= liveSelectionSize.y - 1.0
  );
  let liveSelectionColor = mix(uniforms.background.rgb, uniforms.pixelColor.rgb, 0.52);
  let liveSelectionCoverage = (1.0 - smoothstep(-antialias, antialias, selectionCellDistance))
    * select(0.0, 1.0, insideLiveSelection);
  color = mix(
    color,
    liveSelectionColor,
    liveSelectionCoverage * select(0.0, 0.34, liveSelectionEdge)
  );
  let textCursorOrigin = uniforms.textCursor.xy;
  let textCursorSize = uniforms.textCursor.zw;
  let textCursorEnd = textCursorOrigin + textCursorSize;
  let insideTextCursor = textCursorSize.x > 0.0 && textCursorSize.y > 0.0
    && selectionGrid.x >= textCursorOrigin.x && selectionGrid.y >= textCursorOrigin.y
    && selectionGrid.x < textCursorEnd.x && selectionGrid.y < textCursorEnd.y;
  let textCursorCell = floor(selectionGrid) - textCursorOrigin;
  let textCursorOutline = insideTextCursor && (
    textCursorCell.x < 1.0 || textCursorCell.y < 1.0
    || textCursorCell.x >= textCursorSize.x - 1.0
    || textCursorCell.y >= textCursorSize.y - 1.0
  );
  let textCursorPixelCoverage = 1.0 - smoothstep(
    -antialias,
    antialias,
    cellPixelDistance(selectionGrid)
  );
  let textCursorColor = mix(uniforms.background.rgb, uniforms.pixelColor.rgb, 0.72);
  color = mix(
    color,
    textCursorColor,
    textCursorPixelCoverage * select(0.0, 0.62, textCursorOutline)
  );
  return vec4<f32>(color, 1.0);
}
`;

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split('').map((character) => character + character).join('')
    : normalized, 16);

  if (!Number.isFinite(value)) return [0, 0, 0, 1];
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    1,
  ];
}

function inverseProjection(camera: Camera) {
  const cosineYaw = Math.cos(camera.yaw);
  const sineYaw = Math.sin(camera.yaw);
  const cosinePitch = Math.cos(camera.pitch);
  const sinePitch = Math.sin(camera.pitch);
  const cosineRoll = Math.cos(camera.roll);
  const sineRoll = Math.sin(camera.roll);
  const m00 = cosineRoll * cosineYaw;
  const m01 = cosineRoll * sineYaw * sinePitch - sineRoll * cosinePitch;
  const m10 = sineRoll * cosineYaw;
  const m11 = sineRoll * sineYaw * sinePitch + cosineRoll * cosinePitch;
  const determinant = m00 * m11 - m01 * m10;

  return {
    inv00: m11 / determinant,
    inv01: -m01 / determinant,
    inv10: -m10 / determinant,
    inv11: m00 / determinant,
    m00,
    m01,
    m10,
    m11,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isDragGeometryTool(tool: LcdEditTool) {
  return tool === 'line' || tool === 'rectangle' || tool === 'ellipse';
}

export const LcdCanvas = forwardRef<LcdCanvasHandle, LcdCanvasProps>(
  function LcdCanvas(
    {
      bitmap,
      bitmapOffsetCells,
      mode,
      editTool,
      geometryConstrained,
      stampBitmap,
      geometryPreviewAnchor,
      textCursorSize,
      textAnchor,
      textCursorAnchor,
      selection,
      selectedLiveElementId,
      appearance,
      onPixelChange,
      onStamp,
      onStampScale,
      onLiveSelect,
      onLiveMove,
      onLiveDragState,
      onTextStart,
      onTextMove,
      onGeometryPreview,
      onGeometryCommit,
      onGeometryCancel,
      onGeometryPoint,
      onGeometryHover,
      onSelectionChange,
      onSelectionEnd,
      onPaintStart,
      onPaintEnd,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const runtimeRef = useRef<GpuRuntime | null>(null);
    const bitmapRef = useRef(bitmap);
    const stampBitmapRef = useRef(stampBitmap);
    const geometryPreviewAnchorRef = useRef(geometryPreviewAnchor);
    const textCursorSizeRef = useRef(textCursorSize);
    const textAnchorRef = useRef(textAnchor);
    const textCursorAnchorRef = useRef(textCursorAnchor);
    const selectionRef = useRef(selection);
    const selectedLiveElementIdRef = useRef(selectedLiveElementId);
    const liveFramesRef = useRef<LiveSpriteFrame[]>([]);
    const bitmapOffsetRef = useRef(bitmapOffsetCells);
    const appearanceRef = useRef(appearance);
    const onPixelChangeRef = useRef(onPixelChange);
    const onStampRef = useRef(onStamp);
    const onStampScaleRef = useRef(onStampScale);
    const onLiveSelectRef = useRef(onLiveSelect);
    const onLiveMoveRef = useRef(onLiveMove);
    const onLiveDragStateRef = useRef(onLiveDragState);
    const onTextStartRef = useRef(onTextStart);
    const onTextMoveRef = useRef(onTextMove);
    const onGeometryPreviewRef = useRef(onGeometryPreview);
    const onGeometryCommitRef = useRef(onGeometryCommit);
    const onGeometryCancelRef = useRef(onGeometryCancel);
    const onGeometryPointRef = useRef(onGeometryPoint);
    const onGeometryHoverRef = useRef(onGeometryHover);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onSelectionEndRef = useRef(onSelectionEnd);
    const onPaintStartRef = useRef(onPaintStart);
    const onPaintEndRef = useRef(onPaintEnd);
    const modeRef = useRef(mode);
    const editToolRef = useRef(editTool);
    const geometryConstrainedRef = useRef(geometryConstrained);
    const stampPreviewCellRef = useRef<{ row: number; column: number } | null>(null);
    const textCursorCellRef = useRef<{ row: number; column: number } | null>(null);
    const textCursorVisibleRef = useRef(true);
    const frameRef = useRef<number | null>(null);
    const [rendererState, setRendererState] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
    const cameraRef = useRef<Camera>({
      yaw: 0,
      pitch: 0,
      roll: 0,
      zoom: 40,
      panX: 0,
      panY: 0,
      fitted: false,
    });
    const dragRef = useRef<null | {
      pointerId: number;
      kind: 'rotate' | 'roll' | 'pan' | 'paint' | 'text' | 'text-move' | 'stamp' | 'select' | 'geometry' | 'polygon' | 'fill' | 'live';
      x: number;
      y: number;
      paintValue?: 0 | 1;
      lastCell?: string;
      selectionAnchor?: { row: number; column: number };
      textDragCell?: { row: number; column: number };
      textDragAnchor?: { row: number; column: number };
      geometryAnchor?: { row: number; column: number };
      geometryConstrain?: boolean;
      liveElementId?: string;
      liveDragOffset?: { row: number; column: number };
    }>(null);
    const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
    const stampScaleWheelDeltaRef = useRef(0);
    const touchGestureRef = useRef<null | {
      pointerIds: [number, number];
      initialDistance: number;
      initialAngle: number;
      initialRoll: number;
      initialZoom: number;
      localX: number;
      localY: number;
    }>(null);

    const scheduleDraw = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        runtimeRef.current?.draw();
      });
    };

    const fitView = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(bitmapRef.current[0]?.length ?? 1, 1);
      const height = Math.max(bitmapRef.current.length, 1);
      const pitchXMm = appearanceRef.current.pixelWidthMm + appearanceRef.current.gapMm;
      const pitchYMm = appearanceRef.current.pixelHeightMm + appearanceRef.current.gapMm;
      const offset = bitmapOffsetRef.current;
      const centerXMm = (offset[0] + width * 0.5) * pitchXMm;
      const centerYMm = -(offset[1] + height * 0.5) * pitchYMm;
      const horizontalPadding = Math.min(96, bounds.width * 0.2);
      const verticalPadding = Math.min(180, bounds.height * 0.28);
      const zoom = clamp(Math.min(
        (bounds.width - horizontalPadding) / (width * pitchXMm),
        (bounds.height - verticalPadding) / (height * pitchYMm),
      ) * 0.82, MIN_ZOOM, MAX_ZOOM);
      cameraRef.current = {
        yaw: 0,
        pitch: 0,
        roll: 0,
        zoom,
        panX: -centerXMm * zoom,
        panY: -centerYMm * zoom,
        fitted: true,
      };
      scheduleDraw();
    };

    useImperativeHandle(forwardedRef, () => ({
      resetView: fitView,
      setLiveFrames: (frames) => {
        liveFramesRef.current = frames;
        runtimeRef.current?.replaceLiveFrames(frames.map((frame) => ({
          ...frame,
          selected: frame.id === selectedLiveElementIdRef.current,
        })));
      },
      exportPng: async () => {
        scheduleDraw();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return await new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob(resolve, 'image/png');
        });
      },
    }));

    useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      async function initialize() {
        const gpu = (navigator as unknown as { gpu?: LocalGpuApi }).gpu;
        if (!gpu) {
          setRendererState('unsupported');
          return;
        }

        try {
          const adapter = await gpu.requestAdapter();
          if (!adapter || cancelled) {
            if (!cancelled) setRendererState('unsupported');
            return;
          }
          const device = await adapter.requestDevice();
          if (cancelled) return;

          device.addEventListener('uncapturederror', (event) => {
            console.error('WebGPU validation error:', event.error.message);
          });

          const context = canvas!.getContext('webgpu') as unknown as LocalGpuCanvasContext | null;
          if (!context) {
            setRendererState('unsupported');
            return;
          }

          const format = gpu.getPreferredCanvasFormat();
          context.configure({
            device,
            format,
            alphaMode: 'opaque',
            usage: 0x10 | 0x01,
          });

          const shaderModule = device.createShaderModule({ code: SHADER });
          const compilationInfo = await shaderModule.getCompilationInfo();
          const shaderErrors = compilationInfo.messages.filter(
            (message) => message.type === 'error',
          );
          if (shaderErrors.length > 0) {
            throw new Error(shaderErrors.map((message) =>
              `WGSL ${message.lineNum}:${message.linePos} ${message.message}`,
            ).join('\n'));
          }

          device.pushErrorScope('validation');
          const pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: shaderModule, entryPoint: 'vertexMain' },
            fragment: {
              module: shaderModule,
              entryPoint: 'fragmentMain',
              targets: [{ format }],
            },
            primitive: { topology: 'triangle-list' },
          });
          const pipelineError = await device.popErrorScope();
          if (pipelineError) throw new Error(pipelineError.message);
          const uniformBuffer = device.createBuffer({
            size: 176,
            usage: 0x40 | 0x08,
          });

          let bitmapTexture: LocalGpuTexture | null = null;
          let stampTexture: LocalGpuTexture | null = null;
          let liveTexture: LocalGpuTexture | null = null;
          let bindGroup: LocalGpuBindGroup | null = null;
          let bitmapWidth = 1;
          let bitmapHeight = 1;
          let liveCounts = new Uint16Array(1);
          let liveInvertCounts = new Uint16Array(1);
          let liveSelectedCounts = new Uint16Array(1);
          let currentLiveFrames = new Map<string, LiveSpriteFrame>();

          const rebuildBindGroup = () => {
            if (!bitmapTexture || !stampTexture || !liveTexture) return;
            bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: bitmapTexture.createView() },
                { binding: 2, resource: stampTexture.createView() },
                { binding: 3, resource: liveTexture.createView() },
              ],
            });
          };

          const frameKey = (frame: LiveSpriteFrame) =>
            `${frame.row}:${frame.column}:${frame.rows.join('/')}:${frame.invertedRows?.join('/') ?? ''}:${frame.selected ? 1 : 0}`;

          const applyLiveFrame = (
            frame: LiveSpriteFrame,
            direction: 1 | -1,
            dirty: { minRow: number; minColumn: number; maxRow: number; maxColumn: number },
          ) => {
            const frameHeight = Math.max(frame.rows.length, frame.invertedRows?.length ?? 0);
            for (let localRow = 0; localRow < frameHeight; localRow += 1) {
              const frameWidth = Math.max(
                frame.rows[localRow]?.length ?? 0,
                frame.invertedRows?.[localRow]?.length ?? 0,
              );
              for (let localColumn = 0; localColumn < frameWidth; localColumn += 1) {
                const isSolid = frame.rows[localRow]?.[localColumn] === '1';
                const isInverted = frame.invertedRows?.[localRow]?.[localColumn] === '1';
                if (!isSolid && !isInverted) continue;
                const targetRow = frame.row + localRow;
                const targetColumn = frame.column + localColumn;
                if (targetRow < 0 || targetColumn < 0 || targetRow >= bitmapHeight || targetColumn >= bitmapWidth) continue;
                const index = targetRow * bitmapWidth + targetColumn;
                if (isSolid) liveCounts[index] = Math.max(0, liveCounts[index] + direction);
                if (isInverted) liveInvertCounts[index] = Math.max(0, liveInvertCounts[index] + direction);
                if (frame.selected) {
                  liveSelectedCounts[index] = Math.max(0, liveSelectedCounts[index] + direction);
                }
                dirty.minRow = Math.min(dirty.minRow, targetRow);
                dirty.minColumn = Math.min(dirty.minColumn, targetColumn);
                dirty.maxRow = Math.max(dirty.maxRow, targetRow);
                dirty.maxColumn = Math.max(dirty.maxColumn, targetColumn);
              }
            }
          };

          const uploadLiveRect = (dirty: { minRow: number; minColumn: number; maxRow: number; maxColumn: number }) => {
            if (!liveTexture || dirty.maxRow < dirty.minRow || dirty.maxColumn < dirty.minColumn) return;
            const width = dirty.maxColumn - dirty.minColumn + 1;
            const height = dirty.maxRow - dirty.minRow + 1;
            const bytesPerRow = Math.ceil(width / 256) * 256;
            const data = new Uint8Array(bytesPerRow * height);
            for (let row = 0; row < height; row += 1) {
              for (let column = 0; column < width; column += 1) {
                const index = (dirty.minRow + row) * bitmapWidth + dirty.minColumn + column;
                data[row * bytesPerRow + column] = (liveCounts[index] > 0 ? 1 : 0)
                  | (liveInvertCounts[index] > 0 ? 2 : 0)
                  | (liveSelectedCounts[index] > 0 ? 4 : 0);
              }
            }
            device.queue.writeTexture(
              { texture: liveTexture, origin: [dirty.minColumn, dirty.minRow, 0] },
              data,
              { bytesPerRow, rowsPerImage: height },
              { width, height, depthOrArrayLayers: 1 },
            );
          };

          const runtime: GpuRuntime = {
            device,
            context,
            pipeline,
            uniformBuffer,
            bitmapTexture,
            liveTexture,
            bindGroup,
            bitmapWidth,
            bitmapHeight,
            resize: () => {
              const bounds = canvas!.getBoundingClientRect();
              const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
              const width = Math.max(1, Math.round(bounds.width * pixelRatio));
              const height = Math.max(1, Math.round(bounds.height * pixelRatio));
              if (canvas!.width !== width || canvas!.height !== height) {
                canvas!.width = width;
                canvas!.height = height;
              }
              if (!cameraRef.current.fitted) fitView();
            },
            replaceBitmap: (nextBitmap) => {
              bitmapWidth = Math.max(nextBitmap[0]?.length ?? 1, 1);
              bitmapHeight = Math.max(nextBitmap.length, 1);
              const bytesPerRow = Math.ceil(bitmapWidth / 256) * 256;
              const data = new Uint8Array(bytesPerRow * bitmapHeight);
              nextBitmap.forEach((row, rowIndex) => {
                for (let column = 0; column < bitmapWidth; column += 1) {
                  data[rowIndex * bytesPerRow + column] = row[column] === '1' ? 1 : 0;
                }
              });

              bitmapTexture?.destroy();
              bitmapTexture = device.createTexture({
                size: [bitmapWidth, bitmapHeight, 1],
                format: 'r8uint',
                usage: 0x04 | 0x02,
              });
              device.queue.writeTexture(
                { texture: bitmapTexture },
                data,
                { bytesPerRow, rowsPerImage: bitmapHeight },
                { width: bitmapWidth, height: bitmapHeight, depthOrArrayLayers: 1 },
              );
              liveTexture?.destroy();
              liveTexture = device.createTexture({
                size: [bitmapWidth, bitmapHeight, 1],
                format: 'r8uint',
                usage: 0x04 | 0x02,
              });
              liveCounts = new Uint16Array(bitmapWidth * bitmapHeight);
              liveInvertCounts = new Uint16Array(bitmapWidth * bitmapHeight);
              liveSelectedCounts = new Uint16Array(bitmapWidth * bitmapHeight);
              currentLiveFrames = new Map();
              const liveBytesPerRow = Math.ceil(bitmapWidth / 256) * 256;
              device.queue.writeTexture(
                { texture: liveTexture },
                new Uint8Array(liveBytesPerRow * bitmapHeight),
                { bytesPerRow: liveBytesPerRow, rowsPerImage: bitmapHeight },
                { width: bitmapWidth, height: bitmapHeight, depthOrArrayLayers: 1 },
              );
              rebuildBindGroup();
              runtime.bitmapTexture = bitmapTexture;
              runtime.liveTexture = liveTexture;
              runtime.bindGroup = bindGroup;
              runtime.bitmapWidth = bitmapWidth;
              runtime.bitmapHeight = bitmapHeight;
              runtime.replaceLiveFrames(liveFramesRef.current.map((frame) => ({
                ...frame,
                selected: frame.id === selectedLiveElementIdRef.current,
              })));
              scheduleDraw();
            },
            replaceStamp: (nextStamp) => {
              const stampWidth = Math.max(nextStamp[0]?.length ?? 1, 1);
              const stampHeight = Math.max(nextStamp.length, 1);
              const bytesPerRow = Math.ceil(stampWidth / 256) * 256;
              const data = new Uint8Array(bytesPerRow * stampHeight);
              nextStamp.forEach((row, rowIndex) => {
                for (let column = 0; column < stampWidth; column += 1) {
                  data[rowIndex * bytesPerRow + column] = row[column] === '1' ? 1 : 0;
                }
              });

              stampTexture?.destroy();
              stampTexture = device.createTexture({
                size: [stampWidth, stampHeight, 1],
                format: 'r8uint',
                usage: 0x04 | 0x02,
              });
              device.queue.writeTexture(
                { texture: stampTexture },
                data,
                { bytesPerRow, rowsPerImage: stampHeight },
                { width: stampWidth, height: stampHeight, depthOrArrayLayers: 1 },
              );
              rebuildBindGroup();
              runtime.bindGroup = bindGroup;
              scheduleDraw();
            },
            replaceLiveFrames: (nextFrames) => {
              if (!liveTexture) return;
              const nextById = new Map(nextFrames.map((frame) => [frame.id, frame]));
              const dirty = {
                minRow: Number.POSITIVE_INFINITY,
                minColumn: Number.POSITIVE_INFINITY,
                maxRow: -1,
                maxColumn: -1,
              };
              currentLiveFrames.forEach((previous, id) => {
                const next = nextById.get(id);
                if (!next || frameKey(next) !== frameKey(previous)) applyLiveFrame(previous, -1, dirty);
              });
              nextById.forEach((next, id) => {
                const previous = currentLiveFrames.get(id);
                if (!previous || frameKey(next) !== frameKey(previous)) applyLiveFrame(next, 1, dirty);
              });
              currentLiveFrames = nextById;
              uploadLiveRect(dirty);
              scheduleDraw();
            },
            draw: () => {
              runtime.resize();
              if (!bindGroup || canvas!.width === 0 || canvas!.height === 0) return;

              const camera = cameraRef.current;
              const projection = inverseProjection(camera);
              const pixelRatio = canvas!.width / Math.max(canvas!.getBoundingClientRect().width, 1);
              const background = hexToRgba(appearanceRef.current.background);
              const pixel = hexToRgba(appearanceRef.current.pixel);
              const stampPreviewCell = stampPreviewCellRef.current;
              const activeTextAnchor = editToolRef.current === 'text' ? textAnchorRef.current : null;
              const activeGeometryAnchor = isDragGeometryTool(editToolRef.current) || editToolRef.current === 'polygon'
                ? geometryPreviewAnchorRef.current
                : null;
              const stampWidth = stampBitmapRef.current[0]?.length ?? 0;
              const stampHeight = stampBitmapRef.current.length;
              const stampPreview = activeTextAnchor
                ? [activeTextAnchor.column, activeTextAnchor.row, stampWidth, stampHeight]
                : activeGeometryAnchor
                ? [activeGeometryAnchor.column, activeGeometryAnchor.row, stampWidth, stampHeight]
                : stampPreviewCell
                ? [
                    stampPreviewCell.column - Math.floor(stampWidth / 2),
                    stampPreviewCell.row - Math.floor(stampHeight / 2),
                    stampWidth,
                    stampHeight,
                  ]
                : [0, 0, 0, 0];
              const currentSelection = selectionRef.current;
              const selectionValues = currentSelection
                ? [currentSelection.column, currentSelection.row, currentSelection.width, currentSelection.height]
                : [0, 0, 0, 0];
              const textCursorCell = textCursorAnchorRef.current ?? textCursorCellRef.current;
              const textCursorValues = textCursorCell && textCursorVisibleRef.current
                ? [textCursorCell.column, textCursorCell.row, ...textCursorSizeRef.current]
                : [0, 0, 0, 0];
              const selectedLiveFrame = liveFramesRef.current.find(
                (frame) => frame.id === selectedLiveElementIdRef.current,
              );
              const liveSelectionValues = selectedLiveFrame
                ? [
                    selectedLiveFrame.column,
                    selectedLiveFrame.row,
                    Math.max(0, ...selectedLiveFrame.rows.map((row) => row.length)),
                    selectedLiveFrame.rows.length,
                  ]
                : [0, 0, 0, 0];
              background[3] = (appearanceRef.current.inverted ? 1 : 0)
                + (appearanceRef.current.gridVisible ? 2 : 0);
              const values = new Float32Array([
                canvas!.width, canvas!.height, bitmapWidth, bitmapHeight,
                projection.inv00, projection.inv01, projection.inv10, projection.inv11,
                camera.panX * pixelRatio, camera.panY * pixelRatio, camera.zoom * pixelRatio, appearanceRef.current.shadowOpacity,
                appearanceRef.current.pixelWidthMm, appearanceRef.current.pixelHeightMm, appearanceRef.current.gapMm, appearanceRef.current.shadowSoftnessMm,
                appearanceRef.current.shadowOffsetMm[0], appearanceRef.current.shadowOffsetMm[1], bitmapOffsetRef.current[0], bitmapOffsetRef.current[1],
                ...background,
                ...pixel,
                ...stampPreview,
                ...selectionValues,
                ...textCursorValues,
                ...liveSelectionValues,
              ]);
              device.queue.writeBuffer(uniformBuffer, 0, values);

              const encoder = device.createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [{
                  view: context.getCurrentTexture().createView(),
                  clearValue: { r: background[0], g: background[1], b: background[2], a: 1 },
                  loadOp: 'clear',
                  storeOp: 'store',
                }],
              });
              pass.setPipeline(pipeline);
              pass.setBindGroup(0, bindGroup);
              pass.draw(3);
              pass.end();
              device.queue.submit([encoder.finish()]);
            },
            destroy: () => {
              bitmapTexture?.destroy();
              stampTexture?.destroy();
              liveTexture?.destroy();
              uniformBuffer.destroy();
            },
          };

          runtimeRef.current = runtime;
          runtime.resize();
          runtime.replaceStamp(stampBitmapRef.current);
          runtime.replaceBitmap(bitmapRef.current);
          setRendererState('ready');
        } catch (error) {
          console.error('Unable to start the WebGPU renderer.', error);
          if (!cancelled) setRendererState('error');
        }
      }

      const resizeObserver = new ResizeObserver(() => {
        runtimeRef.current?.resize();
        scheduleDraw();
      });
      resizeObserver.observe(canvas);
      void initialize();

      return () => {
        cancelled = true;
        resizeObserver.disconnect();
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        runtimeRef.current?.destroy();
        runtimeRef.current = null;
      };
    }, []);

    useEffect(() => {
      bitmapRef.current = bitmap;
      runtimeRef.current?.replaceBitmap(bitmap);
      scheduleDraw();
    }, [bitmap]);

    useEffect(() => {
      stampBitmapRef.current = stampBitmap;
      runtimeRef.current?.replaceStamp(stampBitmap);
      scheduleDraw();
    }, [stampBitmap]);

    useEffect(() => {
      geometryPreviewAnchorRef.current = geometryPreviewAnchor;
      scheduleDraw();
    }, [geometryPreviewAnchor]);

    useEffect(() => {
      textCursorSizeRef.current = textCursorSize;
      scheduleDraw();
    }, [textCursorSize]);

    useEffect(() => {
      textAnchorRef.current = textAnchor;
      scheduleDraw();
    }, [textAnchor]);

    useEffect(() => {
      textCursorAnchorRef.current = textCursorAnchor;
      scheduleDraw();
    }, [textCursorAnchor]);

    useEffect(() => {
      bitmapOffsetRef.current = bitmapOffsetCells;
      scheduleDraw();
    }, [bitmapOffsetCells]);

    useEffect(() => {
      selectionRef.current = selection;
      scheduleDraw();
    }, [selection]);

    useEffect(() => {
      selectedLiveElementIdRef.current = selectedLiveElementId;
      runtimeRef.current?.replaceLiveFrames(liveFramesRef.current.map((frame) => ({
        ...frame,
        selected: frame.id === selectedLiveElementId,
      })));
      scheduleDraw();
    }, [selectedLiveElementId]);

    useEffect(() => {
      appearanceRef.current = appearance;
      scheduleDraw();
    }, [appearance]);

    useEffect(() => {
      onPixelChangeRef.current = onPixelChange;
      onStampRef.current = onStamp;
      onStampScaleRef.current = onStampScale;
      onLiveSelectRef.current = onLiveSelect;
      onLiveMoveRef.current = onLiveMove;
      onLiveDragStateRef.current = onLiveDragState;
      onTextStartRef.current = onTextStart;
      onTextMoveRef.current = onTextMove;
      onGeometryPreviewRef.current = onGeometryPreview;
      onGeometryCommitRef.current = onGeometryCommit;
      onGeometryCancelRef.current = onGeometryCancel;
      onGeometryPointRef.current = onGeometryPoint;
      onGeometryHoverRef.current = onGeometryHover;
      onSelectionChangeRef.current = onSelectionChange;
      onSelectionEndRef.current = onSelectionEnd;
      onPaintStartRef.current = onPaintStart;
      onPaintEndRef.current = onPaintEnd;
      modeRef.current = mode;
      editToolRef.current = editTool;
      geometryConstrainedRef.current = geometryConstrained;
      if (mode !== 'live' && dragRef.current?.kind === 'live') {
        if (dragRef.current.liveElementId) {
          onLiveDragStateRef.current(dragRef.current.liveElementId, false);
        }
        dragRef.current = null;
      }
      if (mode !== 'edit' || editTool !== 'stamp') {
        stampPreviewCellRef.current = null;
        scheduleDraw();
      }
      if (mode !== 'edit' || editTool !== 'text') {
        textCursorCellRef.current = null;
        scheduleDraw();
      }
    }, [editTool, geometryConstrained, mode, onGeometryCancel, onGeometryCommit, onGeometryHover, onGeometryPoint, onGeometryPreview, onLiveDragState, onLiveMove, onLiveSelect, onPaintEnd, onPaintStart, onPixelChange, onSelectionChange, onSelectionEnd, onStamp, onStampScale, onTextMove, onTextStart]);

    useEffect(() => {
      if (mode !== 'edit' || editTool !== 'text') {
        textCursorVisibleRef.current = false;
        return;
      }
      textCursorVisibleRef.current = true;
      const interval = window.setInterval(() => {
        textCursorVisibleRef.current = !textCursorVisibleRef.current;
        runtimeRef.current?.draw();
      }, 780);
      return () => window.clearInterval(interval);
    }, [editTool, mode]);

    const cellAtPointer = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const bounds = canvas.getBoundingClientRect();
      const camera = cameraRef.current;
      const projection = inverseProjection(camera);
      const screenX = clientX - bounds.left - bounds.width * 0.5 - camera.panX;
      const screenY = bounds.height * 0.5 - (clientY - bounds.top) - camera.panY;
      const localX = (projection.inv00 * screenX + projection.inv01 * screenY) / camera.zoom;
      const localY = (projection.inv10 * screenX + projection.inv11 * screenY) / camera.zoom;
      const pitchXMm = appearanceRef.current.pixelWidthMm + appearanceRef.current.gapMm;
      const pitchYMm = appearanceRef.current.pixelHeightMm + appearanceRef.current.gapMm;
      const column = Math.floor(localX / pitchXMm - bitmapOffsetRef.current[0]);
      const row = Math.floor(-localY / pitchYMm - bitmapOffsetRef.current[1]);
      if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) return null;
      return { row, column };
    };

    const paintAtPointer = (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== 'paint' || drag.paintValue === undefined) return;
      const cell = cellAtPointer(clientX, clientY);
      if (!cell) return;
      const key = `${cell.row}:${cell.column}`;
      if (key === drag.lastCell) return;
      drag.lastCell = key;
      onPixelChangeRef.current(cell.row, cell.column, drag.paintValue);
    };

    const placeAtPointer = (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== 'stamp' || drag.lastCell) return;
      const cell = cellAtPointer(clientX, clientY);
      if (!cell) return;
      drag.lastCell = `${cell.row}:${cell.column}`;
      onStampRef.current(cell.row, cell.column);
      stampPreviewCellRef.current = null;
      scheduleDraw();
    };

    const startTextAtPointer = (clientX: number, clientY: number) => {
      const cell = cellAtPointer(clientX, clientY);
      if (cell) {
        textCursorCellRef.current = cell;
        textCursorVisibleRef.current = true;
        scheduleDraw();
        onTextStartRef.current(cell.row, cell.column);
      }
    };

    const updateStampPreview = (clientX: number, clientY: number) => {
      if (modeRef.current !== 'edit' || editToolRef.current !== 'stamp') return;
      const cell = cellAtPointer(clientX, clientY);
      if (!cell) return;
      const previous = stampPreviewCellRef.current;
      if (previous?.row === cell.row && previous.column === cell.column) return;
      stampPreviewCellRef.current = cell;
      scheduleDraw();
    };

    const updateTextPreview = (clientX: number, clientY: number) => {
      if (modeRef.current !== 'edit' || editToolRef.current !== 'text' || textAnchorRef.current) return;
      const cell = cellAtPointer(clientX, clientY);
      if (!cell) return;
      const previous = textCursorCellRef.current;
      if (previous?.row === cell.row && previous.column === cell.column) return;
      textCursorCellRef.current = cell;
      textCursorVisibleRef.current = true;
      scheduleDraw();
    };

    const selectionBetween = (anchor: { row: number; column: number }, cell: { row: number; column: number }): LcdSelection => {
      const row = Math.min(anchor.row, cell.row);
      const column = Math.min(anchor.column, cell.column);
      return {
        row,
        column,
        width: Math.abs(cell.column - anchor.column) + 1,
        height: Math.abs(cell.row - anchor.row) + 1,
      };
    };

    const updateSelection = (anchor: { row: number; column: number }, cell: { row: number; column: number }) => {
      onSelectionChangeRef.current(selectionBetween(anchor, cell));
    };

    const clearPointerPreviews = () => {
      const hadPreview = stampPreviewCellRef.current || textCursorCellRef.current;
      stampPreviewCellRef.current = null;
      textCursorCellRef.current = null;
      if (editToolRef.current === 'polygon') onGeometryHoverRef.current(null);
      if (hadPreview) scheduleDraw();
    };

    const beginTouchGesture = () => {
      const canvas = canvasRef.current;
      const pointers = [...touchPointersRef.current.entries()].slice(0, 2);
      if (!canvas || pointers.length < 2) return;

      const [[firstId, first], [secondId, second]] = pointers;
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const bounds = canvas.getBoundingClientRect();
      const camera = cameraRef.current;
      const projection = inverseProjection(camera);
      const screenX = centerX - bounds.left - bounds.width * 0.5;
      const screenY = bounds.height * 0.5 - (centerY - bounds.top);

      touchGestureRef.current = {
        pointerIds: [firstId, secondId],
        initialDistance: Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1),
        initialAngle: Math.atan2(second.y - first.y, second.x - first.x),
        initialRoll: camera.roll,
        initialZoom: camera.zoom,
        localX: (projection.inv00 * (screenX - camera.panX) + projection.inv01 * (screenY - camera.panY)) / camera.zoom,
        localY: (projection.inv10 * (screenX - camera.panX) + projection.inv11 * (screenY - camera.panY)) / camera.zoom,
      };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      if (event.pointerType === 'touch') {
        touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPointersRef.current.size >= 2) {
          if (dragRef.current?.kind === 'paint') onPaintEndRef.current?.();
          if (dragRef.current?.kind === 'geometry') onGeometryCancelRef.current();
          if (dragRef.current?.kind === 'live' && dragRef.current.liveElementId) {
            onLiveDragStateRef.current(dragRef.current.liveElementId, false);
          }
          dragRef.current = null;
          beginTouchGesture();
          return;
        }
      }

      const shouldConstrainGeometry = modeRef.current === 'edit'
        && isDragGeometryTool(editToolRef.current)
        && (event.shiftKey || geometryConstrainedRef.current);
      const shouldPan = (event.shiftKey && !shouldConstrainGeometry) || event.button === 1 || event.button === 2;
      const shouldRoll = event.altKey && !shouldPan;
      let kind: 'rotate' | 'roll' | 'pan' | 'paint' | 'text' | 'text-move' | 'stamp' | 'select' | 'geometry' | 'polygon' | 'fill' | 'live' = shouldPan
        ? 'pan'
        : shouldRoll
          ? 'roll'
          : 'rotate';
      let paintValue: 0 | 1 | undefined;
      let liveElementId: string | undefined;
      let liveDragOffset: { row: number; column: number } | undefined;

      if (modeRef.current === 'edit' && !shouldPan && !shouldRoll) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (!cell) return;
        if (editToolRef.current === 'stamp') {
          kind = 'stamp';
        } else if (editToolRef.current === 'text') {
          kind = textAnchorRef.current ? 'text-move' : 'text';
        } else if (editToolRef.current === 'select') {
          kind = 'select';
        } else if (isDragGeometryTool(editToolRef.current)) {
          kind = 'geometry';
        } else if (editToolRef.current === 'polygon') {
          kind = 'polygon';
        } else if (editToolRef.current === 'fill') {
          kind = 'fill';
        } else {
          kind = 'paint';
          paintValue = bitmapRef.current[cell.row]?.[cell.column] === '1' ? 0 : 1;
        }
      } else if (modeRef.current === 'live' && !shouldPan && !shouldRoll) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (!cell) return;
        const hit = [...liveFramesRef.current].reverse().find((frame) => {
          const width = Math.max(0, ...frame.rows.map((row) => row.length));
          return cell.row >= frame.row && cell.row < frame.row + frame.rows.length
            && cell.column >= frame.column && cell.column < frame.column + width;
        });
        if (hit) {
          kind = 'live';
          liveElementId = hit.id;
          liveDragOffset = {
            row: cell.row - hit.row,
            column: cell.column - hit.column,
          };
          onLiveSelectRef.current(hit.id);
          onLiveDragStateRef.current(hit.id, true);
        } else {
          onLiveSelectRef.current(null);
        }
      }

      dragRef.current = {
        pointerId: event.pointerId,
        kind,
        x: event.clientX,
        y: event.clientY,
        paintValue,
        selectionAnchor: kind === 'select' ? cellAtPointer(event.clientX, event.clientY) ?? undefined : undefined,
        textDragCell: kind === 'text-move' ? cellAtPointer(event.clientX, event.clientY) ?? undefined : undefined,
        textDragAnchor: kind === 'text-move' ? textAnchorRef.current ?? undefined : undefined,
        geometryAnchor: kind === 'geometry' ? cellAtPointer(event.clientX, event.clientY) ?? undefined : undefined,
        geometryConstrain: kind === 'geometry' ? shouldConstrainGeometry : undefined,
        liveElementId,
        liveDragOffset,
      };
      if (kind === 'paint') {
        onPaintStartRef.current?.();
        // Delay touch paint until movement or release so a second finger can
        // begin navigation without toggling the first pixel accidentally.
        if (event.pointerType !== 'touch') {
          paintAtPointer(event.clientX, event.clientY);
        }
      } else if (kind === 'stamp' && event.pointerType !== 'touch') {
        placeAtPointer(event.clientX, event.clientY);
      } else if (kind === 'text' && event.pointerType !== 'touch') {
        startTextAtPointer(event.clientX, event.clientY);
        dragRef.current.lastCell = 'started';
      } else if (kind === 'select' && dragRef.current.selectionAnchor) {
        updateSelection(dragRef.current.selectionAnchor, dragRef.current.selectionAnchor);
      } else if (kind === 'geometry' && dragRef.current.geometryAnchor) {
        onGeometryPreviewRef.current(dragRef.current.geometryAnchor, dragRef.current.geometryAnchor, shouldConstrainGeometry);
      }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType !== 'touch') {
        updateStampPreview(event.clientX, event.clientY);
        updateTextPreview(event.clientX, event.clientY);
        if (editToolRef.current === 'polygon' && !dragRef.current) {
          onGeometryHoverRef.current(cellAtPointer(event.clientX, event.clientY));
        }
      }

      if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
        touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const gesture = touchGestureRef.current;
        if (gesture) {
          const first = touchPointersRef.current.get(gesture.pointerIds[0]);
          const second = touchPointersRef.current.get(gesture.pointerIds[1]);
          const canvas = canvasRef.current;
          if (!first || !second || !canvas) return;

          const distance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
          const angle = Math.atan2(second.y - first.y, second.x - first.x);
          const centerX = (first.x + second.x) / 2;
          const centerY = (first.y + second.y) / 2;
          const bounds = canvas.getBoundingClientRect();
          const screenX = centerX - bounds.left - bounds.width * 0.5;
          const screenY = bounds.height * 0.5 - (centerY - bounds.top);
          const camera = cameraRef.current;
          const nextZoom = clamp(
            gesture.initialZoom * distance / gesture.initialDistance,
            MIN_ZOOM,
            MAX_ZOOM,
          );

          camera.zoom = nextZoom;
          camera.roll = normalizeAngle(
            gesture.initialRoll + normalizeAngle(angle - gesture.initialAngle),
          );
          const projection = inverseProjection(camera);
          camera.panX = screenX - nextZoom * (
            projection.m00 * gesture.localX + projection.m01 * gesture.localY
          );
          camera.panY = screenY - nextZoom * (
            projection.m10 * gesture.localX + projection.m11 * gesture.localY
          );
          scheduleDraw();
          return;
        }
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;

      if (drag.kind === 'rotate') {
        cameraRef.current.yaw = clamp(cameraRef.current.yaw + deltaX * 0.0065, -MAX_TILT_RADIANS, MAX_TILT_RADIANS);
        cameraRef.current.pitch = clamp(cameraRef.current.pitch + deltaY * 0.0065, -MAX_TILT_RADIANS, MAX_TILT_RADIANS);
        scheduleDraw();
      } else if (drag.kind === 'roll') {
        cameraRef.current.roll = normalizeAngle(cameraRef.current.roll + deltaX * 0.009);
        scheduleDraw();
      } else if (drag.kind === 'pan') {
        cameraRef.current.panX += deltaX;
        cameraRef.current.panY -= deltaY;
        scheduleDraw();
      } else if (drag.kind === 'paint') {
        paintAtPointer(event.clientX, event.clientY);
      } else if (drag.kind === 'text-move' && drag.textDragCell && drag.textDragAnchor) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) {
          const nextAnchor = {
            row: drag.textDragAnchor.row + cell.row - drag.textDragCell.row,
            column: drag.textDragAnchor.column + cell.column - drag.textDragCell.column,
          };
          textAnchorRef.current = nextAnchor;
          textCursorCellRef.current = nextAnchor;
          onTextMoveRef.current(nextAnchor.row, nextAnchor.column);
          scheduleDraw();
        }
      } else if (drag.kind === 'select' && drag.selectionAnchor) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) updateSelection(drag.selectionAnchor, cell);
      } else if (drag.kind === 'geometry' && drag.geometryAnchor) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) {
          const constrain = event.shiftKey || geometryConstrainedRef.current;
          drag.geometryConstrain = constrain;
          onGeometryPreviewRef.current(drag.geometryAnchor, cell, constrain);
        }
      } else if (drag.kind === 'live' && drag.liveElementId && drag.liveDragOffset) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) {
          onLiveMoveRef.current(
            drag.liveElementId,
            cell.row - drag.liveDragOffset.row,
            cell.column - drag.liveDragOffset.column,
          );
        }
      }
    };

    const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'touch') {
        touchPointersRef.current.delete(event.pointerId);
        if (touchGestureRef.current) {
          touchGestureRef.current = null;
          const remainingPointer = touchPointersRef.current.entries().next().value as
            | [number, { x: number; y: number }]
            | undefined;
          dragRef.current = remainingPointer
            ? {
                pointerId: remainingPointer[0],
                kind: 'pan',
                x: remainingPointer[1].x,
                y: remainingPointer[1].y,
              }
            : null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
      }

      if (dragRef.current?.pointerId !== event.pointerId) return;
      if (dragRef.current.kind === 'paint') {
        if (!dragRef.current.lastCell && event.type === 'pointerup') {
          paintAtPointer(event.clientX, event.clientY);
        }
        onPaintEndRef.current?.();
      } else if (dragRef.current.kind === 'stamp') {
        if (!dragRef.current.lastCell && event.type === 'pointerup') {
          placeAtPointer(event.clientX, event.clientY);
        }
      } else if (dragRef.current.kind === 'text' && !dragRef.current.lastCell && event.type === 'pointerup') {
        startTextAtPointer(event.clientX, event.clientY);
      } else if (dragRef.current.kind === 'select' && dragRef.current.selectionAnchor && event.type === 'pointerup') {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) onSelectionEndRef.current(selectionBetween(dragRef.current.selectionAnchor, cell));
      } else if (dragRef.current.kind === 'geometry' && dragRef.current.geometryAnchor && event.type === 'pointerup') {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) onGeometryCommitRef.current(dragRef.current.geometryAnchor, cell, dragRef.current.geometryConstrain ?? false);
      } else if (dragRef.current.kind === 'geometry') {
        onGeometryCancelRef.current();
      } else if ((dragRef.current.kind === 'polygon' || dragRef.current.kind === 'fill') && event.type === 'pointerup') {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (cell) onGeometryPointRef.current(cell.row, cell.column);
      } else if (dragRef.current.kind === 'live' && dragRef.current.liveElementId) {
        onLiveDragStateRef.current(dragRef.current.liveElementId, false);
      }
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (modeRef.current === 'edit' && editToolRef.current === 'stamp' && event.shiftKey) {
        const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1;
        const wheelDelta = rawDelta * deltaUnit;
        if (stampScaleWheelDeltaRef.current !== 0
          && Math.sign(stampScaleWheelDeltaRef.current) !== Math.sign(wheelDelta)) {
          stampScaleWheelDeltaRef.current = 0;
        }
        stampScaleWheelDeltaRef.current += wheelDelta;
        const steps = Math.trunc(Math.abs(stampScaleWheelDeltaRef.current) / 80);
        if (steps > 0) {
          onStampScaleRef.current((stampScaleWheelDeltaRef.current < 0 ? 1 : -1) * steps);
          stampScaleWheelDeltaRef.current %= 80;
        }
        return;
      }
      stampScaleWheelDeltaRef.current = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const camera = cameraRef.current;
      const bounds = canvas.getBoundingClientRect();
      const screenX = event.clientX - bounds.left - bounds.width * 0.5;
      const screenY = bounds.height * 0.5 - (event.clientY - bounds.top);
      const projection = inverseProjection(camera);
      const localX = (projection.inv00 * (screenX - camera.panX) + projection.inv01 * (screenY - camera.panY)) / camera.zoom;
      const localY = (projection.inv10 * (screenX - camera.panX) + projection.inv11 * (screenY - camera.panY)) / camera.zoom;
      const nextZoom = clamp(
        camera.zoom * Math.exp(-event.deltaY * 0.0012),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      camera.panX = screenX - nextZoom * (projection.m00 * localX + projection.m01 * localY);
      camera.panY = screenY - nextZoom * (projection.m10 * localX + projection.m11 * localY);
      camera.zoom = nextZoom;
      scheduleDraw();
    };

    return (
      <div className="lcd-canvas-wrap" data-mode={mode} data-edit-tool={editTool}>
        <canvas
          ref={canvasRef}
          className="lcd-canvas"
          aria-label="Interactive retro LCD bitmap surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={clearPointerPreviews}
          onWheel={handleWheel}
          onContextMenu={(event) => event.preventDefault()}
        />
        {rendererState !== 'ready' && (
          <output className="renderer-message">
            {rendererState === 'loading' && 'Warming up the display…'}
            {rendererState === 'unsupported' && 'WebGPU is not available in this browser.'}
            {rendererState === 'error' && 'The display could not start.'}
          </output>
        )}
      </div>
    );
  },
);
