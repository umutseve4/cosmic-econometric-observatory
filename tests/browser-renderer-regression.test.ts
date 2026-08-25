import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BrowserRendererPorts,
  PreparedBrowserProjection,
  ProjectionManifestV2,
  SceneIR
} from '../src/index.js';
import { project, renderProjection } from '../src/index.js';

const scene: SceneIR = {
  schemaVersion: '0.1.0',
  layoutVersion: 'browser-regression-v1',
  seed: 'browser-regression',
  inputHash: `sha256:${'b'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 2, y: 0, z: 2 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: 1, y: 0, z: 1 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

type FakeNode = { readonly kind: string };
type ProjectionKind = ProjectionManifestV2['projection'];

function prepared(kind: ProjectionKind): PreparedBrowserProjection<FakeNode> {
  const manifest = project(scene, kind);
  return {
    roots: [{ kind }],
    nodeIds: [...manifest.nodeIds],
    edgeIds: [...manifest.edgeIds],
    focusOrderNodeIds: [...manifest.focusOrderNodeIds],
    nodeDescriptors: manifest.nodeDescriptors.map((value) => ({ ...value })),
    edgeDescriptors: manifest.edgeDescriptors.map((value) => ({ ...value }))
  };
}

function ports(overrides: Partial<BrowserRendererPorts<FakeNode>> = {}): BrowserRendererPorts<FakeNode> {
  return {
    dom: { prepareHtml: () => prepared('html'), prepareSvg: () => prepared('svg') },
    three: { prepareThree: () => prepared('three') },
    ...overrides
  };
}

function target() {
  const calls: FakeNode[][] = [];
  return { calls, replaceChildren(...nodes: FakeNode[]) { calls.push(nodes); } };
}

for (const kind of ['html', 'svg', 'three'] as const) {
  test(`keeps ${kind} receipt deterministic, immutable, and single-commit`, () => {
    const manifest = project(scene, kind);
    const firstTarget = target();
    const secondTarget = target();
    const first = renderProjection(manifest, firstTarget, ports());
    const second = renderProjection(manifest, secondTarget, ports());
    assert.deepEqual(first, second);
    assert.equal(firstTarget.calls.length, 1);
    assert.equal(secondTarget.calls.length, 1);
    assert.equal(firstTarget.calls[0]?.[0]?.kind, kind);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.nodeIds));
  });
}

test('fails closed for missing Three port and malformed Three JSON', () => {
  const missing = target();
  assert.throws(() => renderProjection(project(scene, 'three'), missing, { dom: ports().dom }), /BROWSER_RENDER_THREE_PORT_REQUIRED/);
  assert.equal(missing.calls.length, 0);
  const malformed = target();
  assert.throws(() => renderProjection({ ...project(scene, 'three'), content: '{' }, malformed, ports()), /BROWSER_RENDER_INVALID_CONTENT:three:malformed-json/);
  assert.equal(malformed.calls.length, 0);
});

test('rejects unsupported schema and projection before mutation', () => {
  for (const [manifest, message] of [
    [{ ...project(scene, 'html'), schemaVersion: '9.0.0' } as unknown as ProjectionManifestV2, /BROWSER_RENDER_UNSUPPORTED_SCHEMA:9.0.0/],
    [{ ...project(scene, 'html'), projection: 'canvas' } as unknown as ProjectionManifestV2, /BROWSER_RENDER_UNSUPPORTED_PROJECTION:canvas/]
  ] as const) {
    const mount = target();
    assert.throws(() => renderProjection(manifest, mount, ports()), message);
    assert.equal(mount.calls.length, 0);
  }
});

const invalidManifestCases: readonly [string, (manifest: ProjectionManifestV2) => ProjectionManifestV2, string][] = [
  ['duplicate node IDs', (manifest) => ({ ...manifest, nodeIds: ['node:a', 'node:a'] }), 'BROWSER_RENDER_INVALID_MANIFEST:nodeIds:duplicate'],
  ['unsorted node IDs', (manifest) => ({ ...manifest, nodeIds: ['node:b', 'node:a'] }), 'BROWSER_RENDER_INVALID_MANIFEST:nodeIds:unsorted'],
  ['duplicate edge IDs', (manifest) => ({ ...manifest, edgeIds: ['edge:a-b', 'edge:a-b'] }), 'BROWSER_RENDER_INVALID_MANIFEST:edgeIds:duplicate'],
  ['focus duplicates', (manifest) => ({ ...manifest, focusOrderNodeIds: ['node:a', 'node:a'] }), 'BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:duplicate'],
  ['focus node-set drift', (manifest) => ({ ...manifest, focusOrderNodeIds: ['node:a', 'node:c'] }), 'BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:node-set']
];

for (const [name, mutate, message] of invalidManifestCases) {
  test(`fails closed on ${name}`, () => {
    const mount = target();
    assert.throws(() => renderProjection(mutate(project(scene, 'html')), mount, ports()), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(mount.calls.length, 0);
  });
}

const preparedCases: readonly [string, Partial<PreparedBrowserProjection<FakeNode>>, string][] = [
  ['missing node', { nodeIds: ['node:a'] }, 'BROWSER_RENDER_NODE_IDS_MISMATCH'],
  ['extra edge', { edgeIds: ['edge:a-b', 'edge:extra'] }, 'BROWSER_RENDER_EDGE_IDS_MISMATCH'],
  ['reordered focus', { focusOrderNodeIds: ['node:b', 'node:a'] }, 'BROWSER_RENDER_FOCUS_ORDER_MISMATCH'],
  ['empty roots', { roots: [] }, 'BROWSER_RENDER_INVALID_CONTENT:html:roots']
];

for (const [name, change, message] of preparedCases) {
  test(`rejects prepared-content ${name} before mutation`, () => {
    const value = { ...prepared('html'), ...change };
    const mount = target();
    assert.throws(() => renderProjection(project(scene, 'html'), mount, ports({ dom: { prepareHtml: () => value, prepareSvg: () => value } })), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(mount.calls.length, 0);
  });
}

test('redacts preparation failures, retains cause, and leaves target unchanged', () => {
  const secret = new Error('sensitive-parser-detail');
  const mount = target();
  assert.throws(() => renderProjection(project(scene, 'html'), mount, ports({ dom: {
    prepareHtml() { throw secret; },
    prepareSvg() { throw secret; }
  } })), (error: unknown) => {
    assert.equal((error as Error).message, 'BROWSER_RENDER_INVALID_CONTENT:html:prepare-failed');
    assert.equal((error as Error).cause, secret);
    return true;
  });
  assert.equal(mount.calls.length, 0);
});

test('rejects hostile prepared-port shapes with stable errors', () => {
  for (const [value, message] of [
    [null, 'BROWSER_RENDER_INVALID_CONTENT:html:prepared-shape'],
    [{ roots: [{}], nodeIds: null, edgeIds: [], focusOrderNodeIds: [], nodeDescriptors: [], edgeDescriptors: [] }, 'BROWSER_RENDER_INVALID_CONTENT:html:metadata']
  ] as const) {
    const mount = target();
    const hostile = ports({ dom: {
      prepareHtml: () => value as unknown as PreparedBrowserProjection<FakeNode>,
      prepareSvg: () => value as unknown as PreparedBrowserProjection<FakeNode>
    } });
    assert.throws(() => renderProjection(project(scene, 'html'), mount, hostile), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(mount.calls.length, 0);
  }
});

type ThreeFixture = {
  nodes: Array<{ id: string; focusOrder: number }>;
  edges: Array<{ source: string; target?: unknown }>;
};

const invalidThreeCases: readonly [string, (payload: ThreeFixture) => void, string][] = [
  ['zero focus order', (payload) => { payload.nodes[0]!.focusOrder = 0; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['fractional focus order', (payload) => { payload.nodes[0]!.focusOrder = 1.5; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['unsafe focus order', (payload) => { payload.nodes[0]!.focusOrder = Number.MAX_SAFE_INTEGER + 1; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['duplicate focus order', (payload) => { payload.nodes[1]!.focusOrder = payload.nodes[0]!.focusOrder; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['dangling source', (payload) => { payload.edges[0]!.source = 'node:missing'; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['missing target', (payload) => { delete payload.edges[0]!.target; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['malformed target', (payload) => { payload.edges[0]!.target = 42; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['dangling target', (payload) => { payload.edges[0]!.target = 'node:missing'; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges']
];

for (const [name, mutate, message] of invalidThreeCases) {
  test(`rejects Three ${name} before port or target call`, () => {
    const original = project(scene, 'three');
    const payload = JSON.parse(original.content) as ThreeFixture;
    mutate(payload);
    let portCalls = 0;
    const mount = target();
    assert.throws(() => renderProjection({ ...original, content: JSON.stringify(payload) }, mount, ports({
      three: { prepareThree() { portCalls += 1; return prepared('three'); } }
    })), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(portCalls, 0);
    assert.equal(mount.calls.length, 0);
  });
}

test('makes one commit attempt and does not claim rollback after target mutation throws', () => {
  const calls: FakeNode[][] = [];
  const throwing = { replaceChildren(...nodes: FakeNode[]) { calls.push(nodes); throw new Error('target-commit-failed'); } };
  assert.throws(() => renderProjection(project(scene, 'html'), throwing, ports()), /target-commit-failed/);
  assert.equal(calls.length, 1);
});

test('rejects Three identifier drift before port or target call', () => {
  const original = project(scene, 'three');
  const payload = JSON.parse(original.content) as ThreeFixture;
  payload.nodes[0]!.id = 'node:forged';
  payload.edges[0]!.source = 'node:forged';
  let portCalls = 0;
  const mount = target();
  assert.throws(() => renderProjection({ ...original, content: JSON.stringify(payload) }, mount, ports({
    three: { prepareThree() { portCalls += 1; return prepared('three'); } }
  })), /BROWSER_RENDER_NODE_IDS_MISMATCH/);
  assert.equal(portCalls, 0);
  assert.equal(mount.calls.length, 0);
});
