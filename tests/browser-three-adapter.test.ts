import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserThreeRuntime, SceneIR } from '../src/index.js';
import { createBrowserThreePort, project, renderProjection } from '../src/index.js';

const scene: SceneIR = {
  schemaVersion: '0.1.0', layoutVersion: 'm3f', seed: 'm3f', inputHash: `sha256:${'f'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 1, y: 0, z: 1 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: 0, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

function fixtureRuntime(options: { throwOnRender?: boolean } = {}) {
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
    render(_scene: Scene, _camera: Camera): void { counters.renders += 1; if (options.throwOnRender) throw new Error('render-failed'); }
    dispose(): void { counters.rendererDisposals += 1; }
  }
  const runtime = {
    Scene, PerspectiveCamera: Camera, WebGLRenderer: Renderer, SphereGeometry: Resource,
    MeshBasicMaterial: Resource, Mesh: Object3D, BufferGeometry, Vector3: class {},
    LineBasicMaterial: Resource, Line: Object3D
  } as unknown as BrowserThreeRuntime;
  return { runtime, counters };
}
function fakeDocument() {
  return { createElement() { return { dataset: {}, setAttribute() {} } as unknown as HTMLCanvasElement; } };
}
const unusedDom = { prepareHtml() { throw new Error('unused'); }, prepareSvg() { throw new Error('unused'); } };

test('prepares one deterministic rendered canvas and disposes transient GPU resources', () => {
  const manifest = project(scene, 'three');
  const fixture = fixtureRuntime();
  let commits = 0;
  let root: HTMLCanvasElement | undefined;
  const receipt = renderProjection(manifest, { replaceChildren(value) { commits += 1; root = value; } }, {
    dom: unusedDom, three: createBrowserThreePort(fakeDocument(), fixture.runtime)
  });
  assert.equal(commits, 1);
  assert.equal(receipt.committedRootCount, 1);
  assert.equal(root?.dataset.frame, 'rendered');
  assert.equal(root?.dataset.nodeCount, '2');
  assert.equal(root?.dataset.edgeCount, '1');
  assert.equal(fixture.counters.renders, 1);
  assert.equal(fixture.counters.rendererDisposals, 1);
  assert.equal(fixture.counters.resourceDisposals, 6);
});

test('render failure disposes resources and never reaches the mount target', () => {
  const manifest = project(scene, 'three');
  const fixture = fixtureRuntime({ throwOnRender: true });
  let commits = 0;
  assert.throws(() => renderProjection(manifest, { replaceChildren() { commits += 1; } }, {
    dom: unusedDom, three: createBrowserThreePort(fakeDocument(), fixture.runtime)
  }), (error: unknown) => {
    assert.equal((error as Error).message, 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed');
    assert.equal(((error as Error).cause as Error).message, 'BROWSER_THREE_PREPARE_FAILED');
    return true;
  });
  assert.equal(commits, 0);
  assert.equal(fixture.counters.renders, 1);
  assert.equal(fixture.counters.rendererDisposals, 1);
  assert.equal(fixture.counters.resourceDisposals, 6);
});
