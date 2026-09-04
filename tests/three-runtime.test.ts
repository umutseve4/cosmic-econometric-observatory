import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserThreeRuntime, BrowserThreeRuntimeHandle, SceneIR, ThreeRuntimeEnvironment, ThreeRuntimeHandle } from '../src/index.js';
import { createBrowserThreePort, createManagedThreeRuntime, project, renderProjection } from '../src/index.js';

type FixtureOptions = { reducedMotion?: boolean; width?: number; height?: number; dpr?: number };

function fixture(options: FixtureOptions = {}) {
  const calls = {
    renders: 0,
    setSize: [] as Array<[number, number, boolean]>,
    pixelRatios: [] as number[],
    ownerDisposals: 0
  };
  const frames = new Map<number, (time: number) => void>();
  let nextHandle = 1;
  const camera = {
    aspect: 1,
    near: 0.1,
    far: 1000,
    lastLookAt: [0, 0, 0] as number[],
    lastPosition: [0, 0, 0] as number[],
    projectionUpdates: 0,
    position: { set(x: number, y: number, z: number): void { camera.lastPosition = [x, y, z]; } },
    lookAt(x: number, y: number, z: number): void { camera.lastLookAt = [x, y, z]; },
    updateProjectionMatrix(): void { camera.projectionUpdates += 1; }
  };
  const size = { width: options.width ?? 800, height: options.height ?? 600, dpr: options.dpr ?? 2 };
  let resizeListener: (() => void) | null = null;
  let motionListener: ((reduced: boolean) => void) | null = null;
  let resizeStopped = 0;
  let motionStopped = 0;
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
    observeResize(listener: () => void): () => void { resizeListener = listener; return () => { resizeStopped += 1; }; },
    prefersReducedMotion: () => options.reducedMotion ?? true,
    observeReducedMotion(listener: (reduced: boolean) => void): () => void { motionListener = listener; return () => { motionStopped += 1; }; }
  };
  const flush = (): void => {
    for (const [id, callback] of [...frames.entries()]) { frames.delete(id); callback(16); }
  };
  return {
    calls, camera, size, handle, environment, frames, flush,
    fireResize: (): void => { resizeListener?.(); },
    fireMotion: (reduced: boolean): void => { motionListener?.(reduced); },
    stops: () => ({ resizeStopped, motionStopped })
  };
}

test('sizes the renderer from the container and bounds DPR to [1, 2]', () => {
  const f = fixture({ width: 1024.7, height: 768.9, dpr: 3 });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.deepEqual(f.calls.setSize, [[1024, 768, false]]);
  assert.deepEqual(f.calls.pixelRatios, [2]);
  assert.equal(f.camera.aspect, 1024 / 768);
  assert.ok(f.camera.projectionUpdates >= 1);
  assert.deepEqual(f.camera.lastLookAt, [0, 0, 0]);
  const state = runtime.state();
  assert.deepEqual(state.viewport, { width: 1024, height: 768, aspect: 1024 / 768, dpr: 2 });
  assert.ok(state.distance >= state.minDistance && state.distance <= state.maxDistance);
  runtime.dispose();
});

test('places the camera on the fitted orbit ray at the fitted distance', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const { distance } = runtime.state();
  const [x, y, z] = f.camera.lastPosition as [number, number, number];
  assert.equal(x, 0);
  assert.ok(Math.abs(Math.hypot(x, y, z) - distance) < 1e-9);
  assert.ok(z > y && y > 0);
  runtime.dispose();
});

test('resize is idempotent for identical measurements and recomputes on change', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.equal(f.calls.setSize.length, 1);
  assert.equal(runtime.resize(), false);
  assert.equal(f.calls.setSize.length, 1);
  f.size.width = 400; f.size.height = 900; f.size.dpr = 1;
  assert.equal(runtime.resize(), true);
  assert.deepEqual(f.calls.setSize[1], [400, 900, false]);
  assert.deepEqual(f.calls.pixelRatios, [2, 1]);
  assert.equal(f.camera.aspect, 400 / 900);
  runtime.dispose();
});

test('zero-sized containers never size the renderer and never throw', () => {
  const f = fixture({ width: 0, height: 0 });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.deepEqual(f.calls.setSize, []);
  assert.equal(runtime.state().viewport, null);
  assert.equal(runtime.resize(), false);
  assert.ok(f.camera.projectionUpdates >= 1);
  runtime.dispose();
});

test('reduced motion renders one frame while continuous motion keeps exactly one pending', () => {
  const f = fixture({ reducedMotion: true });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.calls.renders, 1);
  assert.equal(f.frames.size, 0);
  runtime.setReducedMotion(false);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.calls.renders, 2);
  assert.equal(f.frames.size, 1);
  runtime.dispose();
  assert.equal(f.frames.size, 0);
});

test('honours reduced-motion changes reported by the environment', () => {
  const f = fixture({ reducedMotion: false });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  assert.equal(runtime.state().reducedMotion, false);
  f.fireMotion(true);
  assert.equal(runtime.state().reducedMotion, true);
  f.flush();
  assert.equal(f.frames.size, 0);
  runtime.dispose();
});

test('observed resize events reach the renderer', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  f.size.width = 640; f.size.height = 480;
  f.fireResize();
  assert.deepEqual(f.calls.setSize[1], [640, 480, false]);
  runtime.dispose();
});

test('zoom is bounded and fit restores the framed distance', () => {
  const f = fixture();
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  const base = runtime.state();
  assert.equal(runtime.setZoomDistance(0), base.minDistance);
  assert.equal(runtime.setZoomDistance(1e9), base.maxDistance);
  assert.equal(runtime.zoomBy(0.5), base.maxDistance * 0.5);
  runtime.fit();
  assert.equal(runtime.state().distance, base.distance);
  assert.throws(() => runtime.zoomBy(0), /THREE_RUNTIME_INVALID_INPUT:zoom/);
  assert.throws(() => runtime.setZoomDistance(Number.NaN), /THREE_RUNTIME_INVALID_INPUT:zoom/);
  runtime.dispose();
});

test('preserves the zoom ratio across a resize', () => {
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

test('dispose is idempotent, releases owner resources and stops every observer', () => {
  const f = fixture({ reducedMotion: false });
  const runtime = createManagedThreeRuntime(f.handle, f.environment);
  runtime.dispose();
  runtime.dispose();
  assert.equal(f.calls.ownerDisposals, 1);
  assert.deepEqual(f.stops(), { resizeStopped: 1, motionStopped: 1 });
  assert.equal(f.frames.size, 0);
  assert.equal(runtime.state().disposed, true);
  const renders = f.calls.renders;
  runtime.invalidate();
  runtime.fit();
  runtime.setReducedMotion(true);
  assert.equal(runtime.resize(), false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.calls.renders, renders);
});

test('rejects malformed handles, environments and options', () => {
  const f = fixture();
  assert.throws(() => createManagedThreeRuntime({ ...f.handle, camera: null } as unknown as ThreeRuntimeHandle, f.environment), /THREE_RUNTIME_INVALID_INPUT:handle/);
  assert.throws(() => createManagedThreeRuntime(f.handle, { measure: f.environment.measure } as unknown as ThreeRuntimeEnvironment), /THREE_RUNTIME_INVALID_INPUT:environment/);
  assert.throws(() => createManagedThreeRuntime(f.handle, f.environment, { padding: 0.5 }), /THREE_RUNTIME_INVALID_INPUT:options/);
  assert.throws(() => createManagedThreeRuntime(f.handle, f.environment, { minZoomFactor: 4, maxZoomFactor: 2 }), /THREE_RUNTIME_INVALID_INPUT:options/);
});

const scene: SceneIR = {
  schemaVersion: '0.1.0', layoutVersion: 'm3f', seed: 'm3f', inputHash: `sha256:${'f'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 1, y: 2, z: 3 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: -1, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

function portFixture() {
  const counters = { renders: 0, rendererDisposals: 0, resourceDisposals: 0 };
  class Position { set(_x: number, _y: number, _z: number): void {} }
  class Object3D { name = ''; userData: Record<string, unknown> = {}; readonly position = new Position(); }
  class Scene { add(..._objects: Object3D[]): void {} }
  class Camera extends Object3D { lookAt(_x: number, _y: number, _z: number): void {} }
  class Resource { dispose(): void { counters.resourceDisposals += 1; } }
  class BufferGeometry extends Resource { setFromPoints(_points: readonly unknown[]): BufferGeometry { return this; } }
  class Renderer {
    constructor(_options: unknown) {}
    setPixelRatio(_value: number): void {}
    setSize(_width: number, _height: number, _updateStyle: boolean): void {}
    render(_scene: Scene, _camera: Camera): void { counters.renders += 1; }
    dispose(): void { counters.rendererDisposals += 1; }
  }
  const runtime = {
    Scene, PerspectiveCamera: Camera, WebGLRenderer: Renderer, SphereGeometry: Resource,
    MeshBasicMaterial: Resource, Mesh: Object3D, BufferGeometry, Vector3: class {},
    LineBasicMaterial: Resource, Line: Object3D
  } as unknown as BrowserThreeRuntime;
  const documentLike = { createElement(): HTMLCanvasElement { return { dataset: {}, setAttribute(): void {} } as unknown as HTMLCanvasElement; } };
  return { runtime, documentLike, counters };
}

test('transfers renderer ownership to onRuntimeReady instead of disposing it', () => {
  const f = portFixture();
  let received: BrowserThreeRuntimeHandle | undefined;
  const manifest = project(scene, 'three');
  const receipt = renderProjection(manifest, { replaceChildren(): void {} }, {
    dom: { prepareHtml() { throw new Error('unused'); }, prepareSvg() { throw new Error('unused'); } },
    three: createBrowserThreePort(f.documentLike, f.runtime, { onRuntimeReady(handle) { received = handle; } })
  });
  assert.equal(receipt.committedRootCount, 1);
  assert.equal(f.counters.renders, 1);
  assert.equal(f.counters.rendererDisposals, 0);
  assert.equal(f.counters.resourceDisposals, 0);
  assert.ok(received);
  assert.deepEqual(received.bounds, { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 0, maxZ: 3 });
  received.dispose();
  received.dispose();
  assert.equal(f.counters.rendererDisposals, 1);
  assert.equal(f.counters.resourceDisposals, 6);
});

test('a throwing ownership hook fails closed and disposes everything', () => {
  const f = portFixture();
  const manifest = project(scene, 'three');
  let commits = 0;
  assert.throws(() => renderProjection(manifest, { replaceChildren(): void { commits += 1; } }, {
    dom: { prepareHtml() { throw new Error('unused'); }, prepareSvg() { throw new Error('unused'); } },
    three: createBrowserThreePort(f.documentLike, f.runtime, { onRuntimeReady() { throw new Error('handoff-failed'); } })
  }), (error: unknown) => {
    assert.equal((error as Error).message, 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed');
    assert.equal(((error as Error).cause as Error).message, 'BROWSER_THREE_PREPARE_FAILED');
    return true;
  });
  assert.equal(commits, 0);
  assert.equal(f.counters.rendererDisposals, 1);
  assert.equal(f.counters.resourceDisposals, 6);
});
