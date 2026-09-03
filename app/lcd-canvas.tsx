'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export type LcdMode = 'view' | 'edit';

export type LcdAppearance = {
  background: string;
  pixel: string;
  inverted: boolean;
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
};

type LcdCanvasProps = {
  bitmap: string[];
  bitmapOffsetCells: [number, number];
  mode: LcdMode;
  appearance: LcdAppearance;
  onPixelChange: (row: number, column: number, value: 0 | 1) => void;
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
      destination: { texture: LocalGpuTexture },
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
  bindGroup: LocalGpuBindGroup | null;
  bitmapWidth: number;
  bitmapHeight: number;
  resize: () => void;
  draw: () => void;
  replaceBitmap: (bitmap: string[]) => void;
  destroy: () => void;
};

const MAX_TILT_RADIANS = 1.38;

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
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var bitmapTexture: texture_2d<u32>;

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

fn activePixelDistance(local: vec2<f32>) -> f32 {
  let dimensions = uniforms.bitmapSize;
  let pixelSizeMm = uniforms.geometryMm.xy;
  let pitchMm = pixelSizeMm + vec2<f32>(uniforms.geometryMm.z);
  let grid = vec2<f32>(
    local.x / pitchMm.x - uniforms.bitmapOffsetCells.x,
    -local.y / pitchMm.y - uniforms.bitmapOffsetCells.y
  );
  let cell = floor(grid);
  let insideBitmap = cell.x >= 0.0 && cell.y >= 0.0
    && cell.x < dimensions.x && cell.y < dimensions.y;
  var pixelValue = 0u;

  if (insideBitmap) {
    pixelValue = textureLoad(bitmapTexture, vec2<i32>(cell), 0).r;
  }

  let isInverted = uniforms.background.a > 0.5;
  let isRenderedOn = select(pixelValue == 1u, pixelValue == 0u, isInverted);
  if (!isRenderedOn) {
    return 1000.0;
  }

  let withinCell = fract(grid);
  let fromCenterMm = (withinCell - vec2<f32>(0.5)) * pitchMm;
  let edgeDistanceMm = abs(fromCenterMm) - 0.5 * pixelSizeMm;
  return max(edgeDistanceMm.x, edgeDistanceMm.y);
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
  let pixelCoverage = 1.0 - smoothstep(-antialias, antialias, pixelDistance);
  let shadowFeather = max(uniforms.geometryMm.w, antialias);
  let shadowCoverage = (1.0 - smoothstep(-shadowFeather, shadowFeather, shadowDistance))
    * uniforms.shadowOpacity;

  var color = mix(uniforms.background.rgb, vec3<f32>(0.0), shadowCoverage);
  color = mix(color, uniforms.pixelColor.rgb, pixelCoverage * uniforms.pixelColor.a);
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

export const LcdCanvas = forwardRef<LcdCanvasHandle, LcdCanvasProps>(
  function LcdCanvas(
    {
      bitmap,
      bitmapOffsetCells,
      mode,
      appearance,
      onPixelChange,
      onPaintStart,
      onPaintEnd,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const runtimeRef = useRef<GpuRuntime | null>(null);
    const bitmapRef = useRef(bitmap);
    const bitmapOffsetRef = useRef(bitmapOffsetCells);
    const appearanceRef = useRef(appearance);
    const onPixelChangeRef = useRef(onPixelChange);
    const onPaintStartRef = useRef(onPaintStart);
    const onPaintEndRef = useRef(onPaintEnd);
    const modeRef = useRef(mode);
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
      kind: 'rotate' | 'roll' | 'pan' | 'paint';
      x: number;
      y: number;
      paintValue?: 0 | 1;
      lastCell?: string;
    }>(null);
    const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
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
      ) * 0.82, 8, 180);
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
            size: 112,
            usage: 0x40 | 0x08,
          });

          let bitmapTexture: LocalGpuTexture | null = null;
          let bindGroup: LocalGpuBindGroup | null = null;
          let bitmapWidth = 1;
          let bitmapHeight = 1;

          const runtime: GpuRuntime = {
            device,
            context,
            pipeline,
            uniformBuffer,
            bitmapTexture,
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
              bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: { buffer: uniformBuffer } },
                  { binding: 1, resource: bitmapTexture.createView() },
                ],
              });
              runtime.bitmapTexture = bitmapTexture;
              runtime.bindGroup = bindGroup;
              runtime.bitmapWidth = bitmapWidth;
              runtime.bitmapHeight = bitmapHeight;
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
              background[3] = appearanceRef.current.inverted ? 1 : 0;
              const values = new Float32Array([
                canvas!.width, canvas!.height, bitmapWidth, bitmapHeight,
                projection.inv00, projection.inv01, projection.inv10, projection.inv11,
                camera.panX * pixelRatio, camera.panY * pixelRatio, camera.zoom * pixelRatio, appearanceRef.current.shadowOpacity,
                appearanceRef.current.pixelWidthMm, appearanceRef.current.pixelHeightMm, appearanceRef.current.gapMm, appearanceRef.current.shadowSoftnessMm,
                appearanceRef.current.shadowOffsetMm[0], appearanceRef.current.shadowOffsetMm[1], bitmapOffsetRef.current[0], bitmapOffsetRef.current[1],
                ...background,
                ...pixel,
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
              uniformBuffer.destroy();
            },
          };

          runtimeRef.current = runtime;
          runtime.resize();
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
      bitmapOffsetRef.current = bitmapOffsetCells;
      scheduleDraw();
    }, [bitmapOffsetCells]);

    useEffect(() => {
      appearanceRef.current = appearance;
      scheduleDraw();
    }, [appearance]);

    useEffect(() => {
      onPixelChangeRef.current = onPixelChange;
      onPaintStartRef.current = onPaintStart;
      onPaintEndRef.current = onPaintEnd;
      modeRef.current = mode;
    }, [mode, onPaintEnd, onPaintStart, onPixelChange]);

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
          dragRef.current = null;
          beginTouchGesture();
          return;
        }
      }

      const shouldPan = event.shiftKey || event.button === 1 || event.button === 2;
      const shouldRoll = event.altKey && !shouldPan;
      let kind: 'rotate' | 'roll' | 'pan' | 'paint' = shouldPan
        ? 'pan'
        : shouldRoll
          ? 'roll'
          : 'rotate';
      let paintValue: 0 | 1 | undefined;

      if (modeRef.current === 'edit' && !shouldPan && !shouldRoll) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (!cell) return;
        kind = 'paint';
        paintValue = bitmapRef.current[cell.row]?.[cell.column] === '1' ? 0 : 1;
      }

      dragRef.current = {
        pointerId: event.pointerId,
        kind,
        x: event.clientX,
        y: event.clientY,
        paintValue,
      };
      if (kind === 'paint') {
        onPaintStartRef.current?.();
        // Delay touch paint until movement or release so a second finger can
        // begin navigation without toggling the first pixel accidentally.
        if (event.pointerType !== 'touch') {
          paintAtPointer(event.clientX, event.clientY);
        }
      }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
            8,
            180,
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
      } else {
        paintAtPointer(event.clientX, event.clientY);
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
      }
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const camera = cameraRef.current;
      const bounds = canvas.getBoundingClientRect();
      const screenX = event.clientX - bounds.left - bounds.width * 0.5;
      const screenY = bounds.height * 0.5 - (event.clientY - bounds.top);
      const projection = inverseProjection(camera);
      const localX = (projection.inv00 * (screenX - camera.panX) + projection.inv01 * (screenY - camera.panY)) / camera.zoom;
      const localY = (projection.inv10 * (screenX - camera.panX) + projection.inv11 * (screenY - camera.panY)) / camera.zoom;
      const nextZoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.0012), 8, 180);
      camera.panX = screenX - nextZoom * (projection.m00 * localX + projection.m01 * localY);
      camera.panY = screenY - nextZoom * (projection.m10 * localX + projection.m11 * localY);
      camera.zoom = nextZoom;
      scheduleDraw();
    };

    return (
      <div className="lcd-canvas-wrap" data-mode={mode}>
        <canvas
          ref={canvasRef}
          className="lcd-canvas"
          aria-label="Interactive retro LCD bitmap surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
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
