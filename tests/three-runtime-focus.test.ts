import assert from 'node:assert/strict';
import test from 'node:test';
import type { ThreeRuntimeEnvironment, ThreeRuntimeHandle } from '../src/index.js';
import { createManagedThreeRuntime } from '../src/index.js';

type FixtureOptions = { reducedMotion?: boolean; width?: number; height?: number; dpr?: number };

function fixture(options: FixtureOptions = {}) {
  const calls = { renders: 0, setSize: [] as Array<[number, number, boolean]>, pixelRatios: [] as number[], ownerDisposals: 0 };
  const frames = new Map<number, (time: number) => void>();
  let nextHandle = 1;
  const camera = {
    aspect: 1, near: 0.1, far: 1000,
    lastLookAt: [0, 0, 0] as number[],
    lastPosition: [0, 0, 0] as number[],
    projectionUpdates: 0,
    position: { set(x: number, y: number, z: number): void { camera.lastPosition = [x, y, z]; } },
    lookAt(x: number, y: number, z: number): void { camera.lastLookAt = [x, y, z]; },
    updateProjectionMatrix(): void { camera.projectionUpdates += 1; }
  };
  const size = { width: options.width ?? 800, height: options.height ?? 600, dpr: options.dpr ?? 2 };
  const handle: ThreeRuntimeHandle = {
    renderer: {
      setPixelRatio(value: number): void { calls.pixelRatios.push(value); },
      setSize(width: number, height: number, updateStyle: boolean): void { calls.setSize.push([width, height, updateStyle]); },
      render(): void { calls.renders += 1; },
      dispose(): void {}
    },
    scene: {},
    camera,
    bounds: { minX: -8, maxX: 8, minY: -3, maxY: 3, minZ: -2, maxZ: 2 },
    dispose(): void { calls.ownerDisposals += 1; }
  };
  const environment: ThreeRuntimeEnvironment = {
    measure: () => ({ width: size.width, height: size.height }),
    devicePixelRatio: () => size.dpr,
    requestFrame(callback: (time: number) => void): number { const id = nextHandle++; frames.set(id, callback); return id; },
    cancelFrame(id: number): void { frames.delete(id); },
    prefersReducedMotion: () => options.reducedMotion ?? true
  };
  const flush = (): void => { for (const [id, callback] of [...frames.entries()]) { frames.delete(id); callback(16); } };
  return { calls, camera, size, handle, environment, frames, flush };
}

const NEAR_BOUNDS = { minX: 1, maxX: 2, minY: 1, maxY: 2, minZ: 1, maxZ: 2 };

// --- regression guards for behaviour that already existed ---

test('regression: preserves the zoom ratio across a resize', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const before = runtime.state();
  runtime.setZoomDistance(before.distance * 0.6);
  const ratio = runtime.state().distance / before.distance;
  f.size.width = 500; f.size.height = 500;
  runtime.resize();
  const after = runtime.state();
  const rebasedDistance = after.maxDistance / 3;
  assert.ok(Math.abs(after.distance / rebasedDistance - ratio) < 1e-9);
  runtime.dispose();
});

test('regression: zoom stays bounded and fit restores the framed distance', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const base = runtime.state();
  assert.equal(runtime.setZoomDistance(0), base.minDistance);
  assert.equal(runtime.setZoomDistance(1e9), base.maxDistance);
  runtime.fit();
  assert.equal(runtime.state().distance, base.distance);
  runtime.dispose();
});

// --- new focus behaviour ---

test('focusing a sub-volume moves the camera closer and recentres it', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const whole = runtime.state();
  assert.equal(whole.focused, false);
  assert.equal(runtime.focusBounds(NEAR_BOUNDS), true);
  const focused = runtime.state();
  assert.equal(focused.focused, true);
  assert.ok(focused.distance < whole.distance);
  assert.deepEqual({ ...focused.center }, { x: 1.5, y: 1.5, z: 1.5 });
  assert.deepEqual(f.camera.lastLookAt, [1.5, 1.5, 1.5]);
  runtime.dispose();
});

test('focusing resets the zoom ratio so the requested volume is fully framed', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  runtime.setZoomDistance(runtime.state().maxDistance);
  runtime.focusBounds(NEAR_BOUNDS);
  const state = runtime.state();
  assert.ok(Math.abs(state.distance - state.maxDistance / 3) < 1e-9);
  runtime.dispose();
});

test('clearing the focus restores the whole-scene framing exactly', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const whole = runtime.state();
  runtime.focusBounds(NEAR_BOUNDS);
  assert.equal(runtime.focusBounds(null), true);
  const restored = runtime.state();
  assert.equal(restored.focused, false);
  assert.equal(restored.distance, whole.distance);
  assert.deepEqual({ ...restored.center }, { ...whole.center });
  assert.equal(runtime.focusBounds(null), false);
  runtime.dispose();
});

test('a focus survives a resize and stays centred on the focused volume', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  runtime.focusBounds(NEAR_BOUNDS);
  f.size.width = 400; f.size.height = 900;
  assert.equal(runtime.resize(), true);
  const state = runtime.state();
  assert.equal(state.focused, true);
  assert.deepEqual({ ...state.center }, { x: 1.5, y: 1.5, z: 1.5 });
  runtime.dispose();
});

test('rejects unusable bounds without throwing and without changing the view', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const before = runtime.state();
  assert.equal(runtime.focusBounds({ ...NEAR_BOUNDS, maxX: Number.NaN }), false);
  assert.equal(runtime.focusBounds({ ...NEAR_BOUNDS, minX: 5, maxX: 1 }), false);
  assert.equal(runtime.focusBounds(undefined as unknown as null), false);
  const after = runtime.state();
  assert.equal(after.focused, false);
  assert.equal(after.distance, before.distance);
  runtime.dispose();
});

test('focusing requests exactly one frame under reduced motion', () => {
  const f = fixture({ reducedMotion: true });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  f.flush();
  const renders = f.calls.renders;
  assert.equal(f.frames.size, 0);
  runtime.focusBounds(NEAR_BOUNDS);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.calls.renders, renders + 1);
  assert.equal(f.frames.size, 0);
  runtime.dispose();
});

test('a disposed runtime ignores focus requests', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  runtime.dispose();
  assert.equal(runtime.focusBounds(NEAR_BOUNDS), false);
  assert.equal(runtime.state().focused, false);
});

test('a zero-sized container still accepts a focus without throwing', () => {
  const f = fixture({ width: 0, height: 0 });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.equal(runtime.state().viewport, null);
  assert.equal(runtime.focusBounds(NEAR_BOUNDS), true);
  assert.equal(runtime.state().focused, true);
  runtime.dispose();
});
