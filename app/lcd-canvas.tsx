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
  gap: number;
  shadowOffset: [number, number];
  shadowSoftness: number;
  shadowOpacity: number;
};

export type LcdCanvasHandle = {
  resetView: () => void;
  exportPng: () => Promise<Blob | null>;
};

type LcdCanvasProps = {
  bitmap: string[];
  mode: LcdMode;
  appearance: LcdAppearance;
  onPixelChange: (row: number, column: number, value: 0 | 1) => void;
  onPaintStart?: () => void;
  onPaintEnd?: () => void;
};

type Camera = {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
  fitted: boolean;
};

type LocalGpuShaderModule = object;
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

const SHADER = /* wgsl */ `
struct Uniforms {
  viewport: vec2<f32>,
  bitmapSize: vec2<f32>,
  invRow0: vec2<f32>,
  invRow1: vec2<f32>,
  pan: vec2<f32>,
  scale: f32,
  gap: f32,
  shadowOffset: vec2<f32>,
  shadowSoftness: f32,
  shadowOpacity: f32,
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
  let grid = vec2<f32>(local.x + dimensions.x * 0.5, dimensions.y * 0.5 - local.y);
  let cell = floor(grid);

  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= dimensions.x || cell.y >= dimensions.y) {
    return 1000.0;
  }

  let active = textureLoad(bitmapTexture, vec2<i32>(cell), 0).r;
  if (active == 0u) {
    return 1000.0;
  }

  let withinCell = fract(grid);
  let halfSize = 0.5 * (1.0 - uniforms.gap);
  return max(abs(withinCell.x - 0.5), abs(withinCell.y - 0.5)) - halfSize;
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
  let shadowDistance = activePixelDistance(local - uniforms.shadowOffset);
  let pixelCoverage = 1.0 - smoothstep(-antialias, antialias, pixelDistance);
  let shadowFeather = max(uniforms.shadowSoftness, antialias);
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
  const m00 = cosineYaw;
  const m01 = sineYaw * sinePitch;
  const m10 = 0;
  const m11 = cosinePitch;
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

export const LcdCanvas = forwardRef<LcdCanvasHandle, LcdCanvasProps>(
  function LcdCanvas(
    {
      bitmap,
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
      zoom: 40,
      panX: 0,
      panY: 0,
      fitted: false,
    });
    const dragRef = useRef<null | {
      pointerId: number;
      kind: 'rotate' | 'pan' | 'paint';
      x: number;
      y: number;
      paintValue?: 0 | 1;
      lastCell?: string;
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
      cameraRef.current = {
        yaw: 0,
        pitch: 0,
        zoom: clamp(Math.min((bounds.width - 96) / width, (bounds.height - 180) / height) * 0.82, 16, 64),
        panX: 0,
        panY: 0,
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
          const uniformBuffer = device.createBuffer({
            size: 96,
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
              const values = new Float32Array([
                canvas!.width, canvas!.height, bitmapWidth, bitmapHeight,
                projection.inv00, projection.inv01, projection.inv10, projection.inv11,
                camera.panX * pixelRatio, camera.panY * pixelRatio, camera.zoom * pixelRatio, appearanceRef.current.gap,
                appearanceRef.current.shadowOffset[0], appearanceRef.current.shadowOffset[1], appearanceRef.current.shadowSoftness, appearanceRef.current.shadowOpacity,
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
      const width = bitmapRef.current[0]?.length ?? 0;
      const height = bitmapRef.current.length;
      const column = Math.floor(localX + width * 0.5);
      const row = Math.floor(height * 0.5 - localY);
      if (column < 0 || row < 0 || column >= width || row >= height) return null;
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

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      const shouldPan = event.shiftKey || event.button === 1 || event.button === 2;
      let kind: 'rotate' | 'pan' | 'paint' = shouldPan ? 'pan' : 'rotate';
      let paintValue: 0 | 1 | undefined;

      if (modeRef.current === 'edit' && !shouldPan) {
        const cell = cellAtPointer(event.clientX, event.clientY);
        if (!cell) return;
        kind = 'paint';
        paintValue = bitmapRef.current[cell.row][cell.column] === '1' ? 0 : 1;
      }

      dragRef.current = {
        pointerId: event.pointerId,
        kind,
        x: event.clientX,
        y: event.clientY,
        paintValue,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (kind === 'paint') {
        onPaintStartRef.current?.();
        paintAtPointer(event.clientX, event.clientY);
      }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;

      if (drag.kind === 'rotate') {
        cameraRef.current.yaw = clamp(cameraRef.current.yaw + deltaX * 0.0065, -1.05, 1.05);
        cameraRef.current.pitch = clamp(cameraRef.current.pitch + deltaY * 0.0065, -1.05, 1.05);
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
      if (dragRef.current?.pointerId !== event.pointerId) return;
      if (dragRef.current.kind === 'paint') onPaintEndRef.current?.();
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
