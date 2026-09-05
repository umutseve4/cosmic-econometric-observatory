export const THREE_MIN_DPR = 1;
export const THREE_MAX_DPR = 2;

export interface ThreeViewport {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly dpr: number;
}

export interface ThreeBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ThreeFit {
  readonly center: Readonly<{ x: number; y: number; z: number }>;
  readonly distance: number;
  readonly near: number;
  readonly far: number;
}

export function deriveThreeViewport(width: number, height: number, devicePixelRatio: number): ThreeViewport | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const cssWidth = Math.max(1, Math.floor(width));
  const cssHeight = Math.max(1, Math.floor(height));
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : THREE_MIN_DPR;
  const dpr = Math.min(THREE_MAX_DPR, Math.max(THREE_MIN_DPR, ratio));
  return Object.freeze({ width: cssWidth, height: cssHeight, aspect: cssWidth / cssHeight, dpr });
}

export function fitThreeCamera(bounds: ThreeBounds, verticalFieldOfViewDegrees: number, aspect: number, padding = 1.2): ThreeFit {
  const values = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ, verticalFieldOfViewDegrees, aspect, padding];
  if (!values.every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ || verticalFieldOfViewDegrees <= 0 || verticalFieldOfViewDegrees >= 180 || aspect <= 0 || padding < 1) {
    throw new Error('THREE_VIEWPORT_INVALID_FIT_INPUT');
  }
  const center = Object.freeze({
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  });
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  const verticalRadians = verticalFieldOfViewDegrees * Math.PI / 180;
  const horizontalRadians = 2 * Math.atan(Math.tan(verticalRadians / 2) * aspect);
  const distance = Math.max(height / (2 * Math.tan(verticalRadians / 2)), width / (2 * Math.tan(horizontalRadians / 2))) * padding + depth / 2;
  return Object.freeze({ center, distance, near: Math.max(0.01, distance / 1000), far: Math.max(100, distance * 20 + depth) });
}

export function clampThreeZoom(distance: number, minimum: number, maximum: number): number {
  if (![distance, minimum, maximum].every(Number.isFinite) || minimum <= 0 || minimum > maximum) throw new Error('THREE_VIEWPORT_INVALID_ZOOM_INPUT');
  return Math.min(maximum, Math.max(minimum, distance));
}

export interface FrameSchedulerPorts {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  render(time: number): void;
}

export interface SingleFrameScheduler {
  start(): void;
  invalidate(): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
  state(): Readonly<{ running: boolean; reducedMotion: boolean; pending: boolean; disposed: boolean }>;
}

export function createSingleFrameScheduler(ports: FrameSchedulerPorts, initialReducedMotion = false): SingleFrameScheduler {
  let running = false;
  let reducedMotion = initialReducedMotion;
  let disposed = false;
  let pending: number | null = null;

  const schedule = () => {
    if (disposed || pending !== null || !running) return;
    pending = ports.requestFrame((time) => {
      pending = null;
      if (disposed || !running) return;
      ports.render(time);
      if (!reducedMotion) schedule();
    });
  };
  const cancelPending = () => {
    if (pending === null) return;
    ports.cancelFrame(pending);
    pending = null;
  };

  return Object.freeze({
    start() { if (disposed) return; running = true; schedule(); },
    invalidate() { schedule(); },
    setReducedMotion(reduced: boolean) {
      if (disposed || reducedMotion === reduced) return;
      reducedMotion = reduced;
      if (reduced) cancelPending();
      schedule();
    },
    dispose() { if (disposed) return; disposed = true; running = false; cancelPending(); },
    state() { return Object.freeze({ running, reducedMotion, pending: pending !== null, disposed }); }
  });
}
