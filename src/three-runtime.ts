import { clampThreeZoom, createSingleFrameScheduler, deriveThreeViewport, fitThreeCamera } from './three-viewport-lifecycle.js';
import type { SingleFrameScheduler, ThreeBounds, ThreeViewport } from './three-viewport-lifecycle.js';

export interface ThreeRuntimeRenderer {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
  render(scene: unknown, camera: unknown): void;
  dispose(): void;
}

export interface ThreeRuntimeCamera {
  aspect: number;
  near: number;
  far: number;
  readonly position: { set(x: number, y: number, z: number): void };
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
}

export interface ThreeRuntimeHandle {
  readonly renderer: ThreeRuntimeRenderer;
  readonly scene: unknown;
  readonly camera: ThreeRuntimeCamera;
  readonly bounds: ThreeBounds;
  dispose(): void;
}

export interface ThreeRuntimeEnvironment {
  measure(): { width: number; height: number };
  devicePixelRatio(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  observeResize?(listener: () => void): () => void;
  prefersReducedMotion?(): boolean;
  observeReducedMotion?(listener: (reduced: boolean) => void): () => void;
}

export interface ThreeRuntimeOptions {
  readonly fieldOfViewDegrees?: number;
  readonly padding?: number;
  readonly minZoomFactor?: number;
  readonly maxZoomFactor?: number;
}

export interface ThreeRuntimeState {
  readonly viewport: ThreeViewport | null;
  readonly distance: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly frames: number;
  readonly reducedMotion: boolean;
  readonly disposed: boolean;
}

export interface ManagedThreeRuntime {
  resize(): boolean;
  fit(): void;
  setZoomDistance(distance: number): number;
  zoomBy(factor: number): number;
  invalidate(): void;
  setReducedMotion(reduced: boolean): void;
  state(): ThreeRuntimeState;
  dispose(): void;
}

const DEFAULT_FIELD_OF_VIEW_DEGREES = 50;
const DEFAULT_PADDING = 1.2;
const DEFAULT_MIN_ZOOM_FACTOR = 0.4;
const DEFAULT_MAX_ZOOM_FACTOR = 3;
const ORBIT_DIRECTION = Object.freeze({ x: 0, y: 1 / Math.sqrt(5), z: 2 / Math.sqrt(5) });

export function createManagedThreeRuntime(
  handle: ThreeRuntimeHandle,
  environment: ThreeRuntimeEnvironment,
  options: ThreeRuntimeOptions = {}
): ManagedThreeRuntime {
  validateHandle(handle);
  validateEnvironment(environment);
  const fieldOfViewDegrees = options.fieldOfViewDegrees ?? DEFAULT_FIELD_OF_VIEW_DEGREES;
  const padding = options.padding ?? DEFAULT_PADDING;
  const minZoomFactor = options.minZoomFactor ?? DEFAULT_MIN_ZOOM_FACTOR;
  const maxZoomFactor = options.maxZoomFactor ?? DEFAULT_MAX_ZOOM_FACTOR;
  if (![fieldOfViewDegrees, padding, minZoomFactor, maxZoomFactor].every(Number.isFinite) ||
      fieldOfViewDegrees <= 0 || fieldOfViewDegrees >= 180 || padding < 1 ||
      minZoomFactor <= 0 || minZoomFactor > maxZoomFactor) {
    throw new Error('THREE_RUNTIME_INVALID_INPUT:options');
  }

  let disposed = false;
  let frames = 0;
  let viewport: ThreeViewport | null = null;
  let fit = fitThreeCamera(handle.bounds, fieldOfViewDegrees, 4 / 3, padding);
  let baseDistance = fit.distance;
  let distance = fit.distance;

  const scheduler: SingleFrameScheduler = createSingleFrameScheduler({
    requestFrame: (callback) => environment.requestFrame(callback),
    cancelFrame: (frameHandle) => environment.cancelFrame(frameHandle),
    render: () => {
      frames += 1;
      handle.renderer.render(handle.scene, handle.camera);
    }
  }, environment.prefersReducedMotion?.() ?? true);

  const applyCamera = (): void => {
    handle.camera.near = fit.near;
    handle.camera.far = Math.max(fit.far, distance * 4);
    handle.camera.position.set(
      fit.center.x + ORBIT_DIRECTION.x * distance,
      fit.center.y + ORBIT_DIRECTION.y * distance,
      fit.center.z + ORBIT_DIRECTION.z * distance
    );
    handle.camera.lookAt(fit.center.x, fit.center.y, fit.center.z);
    handle.camera.updateProjectionMatrix();
  };

  const recompute = (aspect: number): void => {
    const ratio = baseDistance === 0 ? 1 : distance / baseDistance;
    fit = fitThreeCamera(handle.bounds, fieldOfViewDegrees, aspect, padding);
    baseDistance = fit.distance;
    distance = clampThreeZoom(baseDistance * ratio, baseDistance * minZoomFactor, baseDistance * maxZoomFactor);
    applyCamera();
  };

  const resize = (): boolean => {
    if (disposed) return false;
    const measured = environment.measure();
    const next = deriveThreeViewport(measured.width, measured.height, environment.devicePixelRatio());
    if (next === null) return false;
    if (viewport !== null && viewport.width === next.width && viewport.height === next.height && viewport.dpr === next.dpr) return false;
    viewport = next;
    handle.renderer.setPixelRatio(next.dpr);
    handle.renderer.setSize(next.width, next.height, false);
    handle.camera.aspect = next.aspect;
    recompute(next.aspect);
    scheduler.invalidate();
    return true;
  };

  const setZoomDistance = (value: number): number => {
    if (disposed) return distance;
    if (!Number.isFinite(value)) throw new Error('THREE_RUNTIME_INVALID_INPUT:zoom');
    distance = clampThreeZoom(value, baseDistance * minZoomFactor, baseDistance * maxZoomFactor);
    applyCamera();
    scheduler.invalidate();
    return distance;
  };

  const stopResize = environment.observeResize?.(() => { resize(); });
  const stopReducedMotion = environment.observeReducedMotion?.((reduced) => {
    if (disposed) return;
    scheduler.setReducedMotion(reduced);
    scheduler.invalidate();
  });

  resize();
  if (viewport === null) applyCamera();
  scheduler.start();

  return Object.freeze({
    resize,
    fit(): void {
      if (disposed) return;
      distance = baseDistance;
      applyCamera();
      scheduler.invalidate();
    },
    setZoomDistance,
    zoomBy(factor: number): number {
      if (disposed) return distance;
      if (!Number.isFinite(factor) || factor <= 0) throw new Error('THREE_RUNTIME_INVALID_INPUT:zoom');
      return setZoomDistance(distance * factor);
    },
    invalidate(): void { if (!disposed) scheduler.invalidate(); },
    setReducedMotion(reduced: boolean): void {
      if (disposed) return;
      scheduler.setReducedMotion(reduced);
      scheduler.invalidate();
    },
    state(): ThreeRuntimeState {
      return Object.freeze({
        viewport,
        distance,
        minDistance: baseDistance * minZoomFactor,
        maxDistance: baseDistance * maxZoomFactor,
        frames,
        reducedMotion: scheduler.state().reducedMotion,
        disposed
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scheduler.dispose();
      stopResize?.();
      stopReducedMotion?.();
      handle.dispose();
    }
  });
}

function validateHandle(handle: ThreeRuntimeHandle): void {
  if (handle === null || typeof handle !== 'object' || typeof handle.dispose !== 'function' ||
      handle.renderer === null || typeof handle.renderer !== 'object' ||
      typeof handle.renderer.render !== 'function' || typeof handle.renderer.dispose !== 'function' ||
      typeof handle.renderer.setSize !== 'function' || typeof handle.renderer.setPixelRatio !== 'function' ||
      handle.camera === null || typeof handle.camera !== 'object' ||
      typeof handle.camera.lookAt !== 'function' || typeof handle.camera.updateProjectionMatrix !== 'function' ||
      handle.bounds === null || typeof handle.bounds !== 'object') {
    throw new Error('THREE_RUNTIME_INVALID_INPUT:handle');
  }
}

function validateEnvironment(environment: ThreeRuntimeEnvironment): void {
  if (environment === null || typeof environment !== 'object' ||
      typeof environment.measure !== 'function' || typeof environment.devicePixelRatio !== 'function' ||
      typeof environment.requestFrame !== 'function' || typeof environment.cancelFrame !== 'function') {
    throw new Error('THREE_RUNTIME_INVALID_INPUT:environment');
  }
}
