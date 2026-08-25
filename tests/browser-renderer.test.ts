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
  layoutVersion: 'browser-test-v1',
  seed: 'browser-renderer-test',
  inputHash: `sha256:${'b'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 2, y: 0, z: 2 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: 1, y: 0, z: 1 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

type FakeNode = { readonly kind: string };

function prepared(manifest: ProjectionManifestV2, kind = manifest.projection): PreparedBrowserProjection<FakeNode> {
  return {
    roots: [{ kind }],
    nodeIds: [...manifest.nodeIds],
    edgeIds: [...manifest.edgeIds],
    focusOrderNodeIds: [...manifest.focusOrderNodeIds],
    nodeDescriptors: manifest.nodeDescriptors.map((value) => ({ ...value })),
    edgeDescriptors: manifest.edgeDescriptors.map((value) => ({ ...value }))
  };
}

function ports(manifest: ProjectionManifestV2, overrides: Partial<BrowserRendererPorts<FakeNode>> = {}): BrowserRendererPorts<FakeNode> {
  return {
    dom: {
      prepareHtml: () => prepared(manifest, 'html'),
      prepareSvg: () => prepared(manifest, 'svg')
    },
    three: { prepareThree: () => prepared(manifest, 'three') },
    ...overrides
  };
}

function target() {
  const calls: FakeNode[][] = [];
  return { calls, replaceChildren(...nodes: FakeNode[]) { calls.push(nodes); } };
}

for (const kind of ['html', 'svg', 'three'] as const) {
  test(`prepares ${kind} off-target and performs one commit attempt with an immutable receipt`, () => {
    const manifest = project(scene, kind);
    const mount = target();
    const receipt = renderProjection(manifest, mount, ports(manifest));
    assert.equal(mount.calls.length, 1);
    assert.equal(mount.calls[0]?.[0]?.kind, kind);
    assert.deepEqual(receipt.nodeIds, ['node:a', 'node:b']);
    assert.ok(Object.isFrozen(receipt));
    assert.ok(Object.isFrozen(receipt.nodeIds));
  });
}

test('parses and validates the Three payload before invoking its injected port', () => {
  const manifest = project(scene, 'three');
  let captured: unknown;
  const mount = target();
  renderProjection(manifest, mount, ports(manifest, {
    three: { prepareThree(payload) { captured = payload; return prepared(manifest, 'three'); } }
  }));
  assert.equal((captured as { scene: string }).scene, scene.schemaVersion);
  assert.equal(mount.calls.length, 1);
});

test('fails closed when the Three port is absent or JSON is malformed', () => {
  const manifest = project(scene, 'three');
  const missingPortTarget = target();
  assert.throws(() => renderProjection(manifest, missingPortTarget, { dom: ports(manifest).dom }), /BROWSER_RENDER_THREE_PORT_REQUIRED/);
  assert.equal(missingPortTarget.calls.length, 0);

  const malformedTarget = target();
  assert.throws(() => renderProjection({ ...manifest, content: '{' }, malformedTarget, ports(manifest)), /BROWSER_RENDER_INVALID_CONTENT:three:malformed-json/);
  assert.equal(malformedTarget.calls.length, 0);
});

type InvalidCase = readonly [string, (manifest: ProjectionManifestV2) => ProjectionManifestV2, string];
const invalidDescriptorCases: readonly InvalidCase[] = [
  ['missing node descriptors', (manifest) => ({ ...manifest, nodeDescriptors: undefined } as unknown as ProjectionManifestV2), 'BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape'],
  ['malformed node descriptor shape', (manifest) => ({ ...manifest, nodeDescriptors: [{ id: 'node:a', label: 'A' }] } as unknown as ProjectionManifestV2), 'BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape'],
  ['forged node descriptor id', (manifest) => ({ ...manifest, nodeDescriptors: [manifest.nodeDescriptors[0]!, { ...manifest.nodeDescriptors[1]!, id: 'node:c' }] }), 'BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:id-parity'],
  ['duplicate node descriptor id', (manifest) => ({ ...manifest, nodeDescriptors: [manifest.nodeDescriptors[0]!, { ...manifest.nodeDescriptors[1]!, id: manifest.nodeDescriptors[0]!.id }] }), 'BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:duplicate'],
  ['reordered node descriptors', (manifest) => ({ ...manifest, nodeDescriptors: [...manifest.nodeDescriptors].reverse() }), 'BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:unsorted'],
  ['missing edge descriptors', (manifest) => ({ ...manifest, edgeDescriptors: undefined } as unknown as ProjectionManifestV2), 'BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape'],
  ['forged edge descriptor id', (manifest) => ({ ...manifest, edgeDescriptors: [{ ...manifest.edgeDescriptors[0]!, id: 'edge:forged' }] }), 'BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:id-parity'],
  ['duplicate edge descriptor id', (manifest) => ({ ...manifest, edgeIds: ['edge:a-b', 'edge:z'], edgeDescriptors: [manifest.edgeDescriptors[0]!, { ...manifest.edgeDescriptors[0]!, id: 'edge:a-b' }] }), 'BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:duplicate'],
  ['reordered edge descriptors', (manifest) => ({ ...manifest, edgeIds: ['edge:a-b', 'edge:z'], edgeDescriptors: [{ id: 'edge:z', source: 'node:a', target: 'node:b' }, manifest.edgeDescriptors[0]!] }), 'BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:unsorted'],
  ['dangling descriptor endpoint', (manifest) => ({ ...manifest, edgeDescriptors: [{ ...manifest.edgeDescriptors[0]!, target: 'node:missing' }] }), 'BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:endpoints']
];

for (const [name, mutate, message] of invalidDescriptorCases) {
  test(`rejects ${name} before preparing or mutating`, () => {
    const manifest = project(scene, 'html');
    let prepareCalls = 0;
    const mount = target();
    const custom = ports(manifest, { dom: {
      prepareHtml() { prepareCalls += 1; return prepared(manifest); },
      prepareSvg() { prepareCalls += 1; return prepared(manifest); }
    } });
    assert.throws(() => renderProjection(mutate(manifest), mount, custom), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(prepareCalls, 0);
    assert.equal(mount.calls.length, 0);
  });
}

for (const [name, mutate, message] of [
  ['node label', (payload: any) => { payload.nodes[0].label = 'forged'; }, 'BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH'],
  ['node kind', (payload: any) => { payload.nodes[0].semanticKind = 'forged'; }, 'BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH'],
  ['edge source', (payload: any) => { payload.edges[0].source = 'node:b'; }, 'BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH'],
  ['edge target', (payload: any) => { payload.edges[0].target = 'node:a'; }, 'BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH']
] as const) {
  test(`rejects Three ${name} drift before any Three port or target call`, () => {
    const manifest = project(scene, 'three');
    const payload = JSON.parse(manifest.content);
    mutate(payload);
    let portCalls = 0;
    const mount = target();
    const custom = ports(manifest, { three: { prepareThree() { portCalls += 1; return prepared(manifest); } } });
    assert.throws(
      () => renderProjection({ ...manifest, content: JSON.stringify(payload) }, mount, custom),
      (error: unknown) => { assert.equal((error as Error).message, message); return true; }
    );
    assert.equal(portCalls, 0);
    assert.equal(mount.calls.length, 0);
  });
}

for (const kind of ['html', 'svg'] as const) {
  for (const [name, change, message] of [
    ['node semantic drift', { nodeDescriptors: [{ id: 'node:a', label: 'forged', kind: 'program' }, { id: 'node:b', label: 'B', kind: 'course' }] }, 'BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH'],
    ['edge semantic drift', { edgeDescriptors: [{ id: 'edge:a-b', source: 'node:b', target: 'node:a' }] }, 'BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH']
  ] as const) {
    test(`rejects detached ${kind} ${name} before target mutation`, () => {
      const manifest = project(scene, kind);
      const forged = { ...prepared(manifest, kind), ...change } as PreparedBrowserProjection<FakeNode>;
      const mount = target();
      const custom = ports(manifest, { dom: { prepareHtml: () => forged, prepareSvg: () => forged } });
      assert.throws(() => renderProjection(manifest, mount, custom), (error: unknown) => {
        assert.equal((error as Error).message, message);
        return true;
      });
      assert.equal(mount.calls.length, 0);
    });
  }
}

test('rejects hostile prepared-port output with stable errors', () => {
  const manifest = project(scene, 'html');
  const mount = target();
  const hostile = ports(manifest, { dom: {
    prepareHtml: () => ({ roots: [{}], nodeIds: [], edgeIds: [], focusOrderNodeIds: [] } as unknown as PreparedBrowserProjection<FakeNode>),
    prepareSvg: () => prepared(manifest)
  } });
  assert.throws(() => renderProjection(manifest, mount, hostile), /BROWSER_RENDER_INVALID_CONTENT:html:metadata/);
  assert.equal(mount.calls.length, 0);
});

test('makes one target commit attempt and does not claim rollback if the target throws after mutation', () => {
  const manifest = project(scene, 'html');
  let calls = 0;
  const throwingTarget = { replaceChildren() { calls += 1; throw new Error('target-commit-failed'); } };
  assert.throws(() => renderProjection(manifest, throwingTarget, ports(manifest)), /target-commit-failed/);
  assert.equal(calls, 1);
});
