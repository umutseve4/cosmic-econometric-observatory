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
    dom: {
      prepareHtml: () => prepared('html'),
      prepareSvg: () => prepared('svg')
    },
    three: { prepareThree: () => prepared('three') },
    ...overrides
  };
}

function target() {
  const calls: FakeNode[][] = [];
  return {
    calls,
    replaceChildren(...nodes: FakeNode[]) { calls.push(nodes); }
  };
}

for (const kind of ['html', 'svg', 'three'] as const) {
  test(`prepares ${kind} off-target and performs one commit attempt with an immutable receipt`, () => {
    const mount = target();
    const manifest = project(scene, kind);
    const first = renderProjection(manifest, mount, ports());
    const secondTarget = target();
    const second = renderProjection(manifest, secondTarget, ports());
    assert.deepEqual(first, second);
    assert.equal(mount.calls.length, 1);
    assert.equal(secondTarget.calls.length, 1);
    assert.equal(mount.calls[0]?.[0]?.kind, kind);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.nodeIds));
  });
}

test('parses, validates, and canonically rebuilds the Three payload before invoking its injected port', () => {
  const manifest = project(scene, 'three');
  const payload = JSON.parse(manifest.content) as MutableThreePayload;
  payload.forged = 'top';
  payload.nodes[0]!.forged = 'node';
  payload.nodes[0]!.position = { ...payload.nodes[0]!.position, forged: 1 } as unknown as { x: number; y: number; z: number };
  payload.edges[0]!.forged = 'edge';
  let captured: unknown;
  const mount = target();
  renderProjection({ ...manifest, content: JSON.stringify(payload) }, mount, ports({
    three: { prepareThree(value) { captured = value; return prepared('three'); } }
  }));
  assert.deepEqual(captured, JSON.parse(manifest.content) as unknown);
  assert.equal(mount.calls.length, 1);
});

test('fails closed when the Three port is absent or JSON is malformed', () => {
  const missingPortTarget = target();
  const noThree = { dom: ports().dom };
  assert.throws(() => renderProjection(project(scene, 'three'), missingPortTarget, noThree), /BROWSER_RENDER_THREE_PORT_REQUIRED/);
  assert.equal(missingPortTarget.calls.length, 0);

  const malformedTarget = target();
  const malformed = { ...project(scene, 'three'), content: '{' };
  assert.throws(() => renderProjection(malformed, malformedTarget, ports()), /BROWSER_RENDER_INVALID_CONTENT:three:malformed-json/);
  assert.equal(malformedTarget.calls.length, 0);
});

test('rejects unsupported schema and projection without target mutation', () => {
  const schemaTarget = target();
  const invalidSchema = { ...project(scene, 'html'), schemaVersion: '9.0.0' } as unknown as ProjectionManifestV2;
  assert.throws(() => renderProjection(invalidSchema, schemaTarget, ports()), /BROWSER_RENDER_UNSUPPORTED_SCHEMA:9.0.0/);
  assert.equal(schemaTarget.calls.length, 0);

  const projectionTarget = target();
  const invalidProjection = { ...project(scene, 'html'), projection: 'canvas' } as unknown as ProjectionManifestV2;
  assert.throws(() => renderProjection(invalidProjection, projectionTarget, ports()), /BROWSER_RENDER_UNSUPPORTED_PROJECTION:canvas/);
  assert.equal(projectionTarget.calls.length, 0);
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

const preparedMismatchCases: readonly [string, Partial<PreparedBrowserProjection<FakeNode>>, string][] = [
  ['missing node', { nodeIds: ['node:a'] }, 'BROWSER_RENDER_NODE_IDS_MISMATCH'],
  ['extra edge', { edgeIds: ['edge:a-b', 'edge:extra'] }, 'BROWSER_RENDER_EDGE_IDS_MISMATCH'],
  ['reordered focus', { focusOrderNodeIds: ['node:b', 'node:a'] }, 'BROWSER_RENDER_FOCUS_ORDER_MISMATCH'],
  ['empty roots', { roots: [] }, 'BROWSER_RENDER_INVALID_CONTENT:html:roots']
];

for (const [name, change, message] of preparedMismatchCases) {
  test(`does not mutate target for prepared-content ${name}`, () => {
    const mount = target();
    const custom = { ...prepared('html'), ...change };
    const customPorts = ports({ dom: { prepareHtml: () => custom, prepareSvg: () => custom } });
    assert.throws(() => renderProjection(project(scene, 'html'), mount, customPorts), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(mount.calls.length, 0);
  });
}

test('redacts preparation failures, retains the cause, and leaves target unchanged', () => {
  const mount = target();
  const secret = new Error('sensitive-parser-detail');
  const failing = ports({
    dom: {
      prepareHtml() { throw secret; },
      prepareSvg() { throw secret; }
    }
  });
  assert.throws(() => renderProjection(project(scene, 'html'), mount, failing), (error: unknown) => {
    assert.equal((error as Error).message, 'BROWSER_RENDER_INVALID_CONTENT:html:prepare-failed');
    assert.equal((error as Error).cause, secret);
    return true;
  });
  assert.equal(mount.calls.length, 0);
});

test('rejects hostile prepared-port output with stable errors', () => {
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

type ThreeFixturePayload = {
  nodes: { focusOrder: number }[];
  edges: { source: string; target?: unknown }[];
};

type MutableThreePayload = {
  scene: string;
  nodes: Array<{ id: string; semanticKind: string; label: string; position: { x: number; y: number; z: number }; focusOrder: number; capabilities: string[]; [key: string]: unknown }>;
  edges: Array<{ id: string; semanticKind: string; source: string; target: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

const invalidThreePayloadCases: readonly [string, (payload: ThreeFixturePayload) => void, string][] = [
  ['zero focus order', (payload) => { payload.nodes[0]!.focusOrder = 0; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['fractional focus order', (payload) => { payload.nodes[0]!.focusOrder = 1.5; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['unsafe focus order', (payload) => { payload.nodes[0]!.focusOrder = Number.MAX_SAFE_INTEGER + 1; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['duplicate focus order', (payload) => { payload.nodes[1]!.focusOrder = payload.nodes[0]!.focusOrder; }, 'BROWSER_RENDER_INVALID_CONTENT:three:nodes'],
  ['dangling edge source', (payload) => { payload.edges[0]!.source = 'node:missing'; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['missing edge target', (payload) => { delete payload.edges[0]!.target; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['malformed edge target', (payload) => { payload.edges[0]!.target = 42; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges'],
  ['dangling edge target', (payload) => { payload.edges[0]!.target = 'node:missing'; }, 'BROWSER_RENDER_INVALID_CONTENT:three:edges']
];

for (const [name, mutate, message] of invalidThreePayloadCases) {
  test(`rejects ${name} before any Three port or target call`, () => {
    const original = project(scene, 'three');
    const payload = JSON.parse(original.content) as ThreeFixturePayload;
    mutate(payload);
    let portCalls = 0;
    const mount = target();
    const customPorts = ports({ three: { prepareThree() { portCalls += 1; return prepared('three'); } } });
    assert.throws(() => renderProjection({ ...original, content: JSON.stringify(payload) }, mount, customPorts), (error: unknown) => {
      assert.equal((error as Error).message, message);
      return true;
    });
    assert.equal(portCalls, 0);
    assert.equal(mount.calls.length, 0);
  });
}

test('makes one target commit attempt and does not claim rollback if the target throws after mutation', () => {
  const calls: FakeNode[][] = [];
  const throwingTarget = {
    replaceChildren(...nodes: FakeNode[]) {
      calls.push(nodes);
      throw new Error('target-commit-failed');
    }
  };
  assert.throws(() => renderProjection(project(scene, 'html'), throwingTarget, ports()), /target-commit-failed/);
  assert.equal(calls.length, 1);
});

test('rejects Three identifier drift before the injected port or target can run', () => {
  const original = project(scene, 'three');
  const payload = JSON.parse(original.content) as { nodes: { id: string }[] };
  payload.nodes[0]!.id = 'node:forged';
  let portCalls = 0;
  const mount = target();
  const customPorts = ports({ three: { prepareThree() { portCalls += 1; return prepared('three'); } } });
  assert.throws(() => renderProjection({ ...original, content: JSON.stringify(payload) }, mount, customPorts), /BROWSER_RENDER_NODE_IDS_MISMATCH/);
  assert.equal(portCalls, 0);
  assert.equal(mount.calls.length, 0);
});

test('rejects forged prepared node semantics and edge endpoint before target mutation', () => {
  const html = project(scene, 'html');
  const forgedNode = { ...prepared('html'), nodeDescriptors: html.nodeDescriptors.map((value) => ({ ...value })) };
  forgedNode.nodeDescriptors[0] = { ...forgedNode.nodeDescriptors[0]!, label: 'forged' };
  const htmlTarget = target();
  assert.throws(() => renderProjection(html, htmlTarget, ports({ dom: { prepareHtml: () => forgedNode, prepareSvg: () => forgedNode } })), /BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH/);
  assert.equal(htmlTarget.calls.length, 0);

  const svg = project(scene, 'svg');
  const forgedEdge = { ...prepared('svg'), edgeDescriptors: svg.edgeDescriptors.map((value) => ({ ...value })) };
  forgedEdge.edgeDescriptors[0] = { ...forgedEdge.edgeDescriptors[0]!, target: 'node:a' };
  const svgTarget = target();
  assert.throws(() => renderProjection(svg, svgTarget, ports({ dom: { prepareHtml: () => forgedEdge, prepareSvg: () => forgedEdge } })), /BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH/);
  assert.equal(svgTarget.calls.length, 0);
});

test('rejects missing, duplicate, reordered, and unknown-key manifest descriptors before preparation', () => {
  const base = project(scene, 'html');
  const cases: readonly [ProjectionManifestV2, RegExp][] = [
    [{ ...base, nodeDescriptors: undefined } as unknown as ProjectionManifestV2, /nodeDescriptors:type/],
    [{ ...base, nodeDescriptors: [base.nodeDescriptors[0]!, base.nodeDescriptors[0]!] } as ProjectionManifestV2, /nodeDescriptors:duplicate/],
    [{ ...base, nodeDescriptors: [...base.nodeDescriptors].reverse() } as ProjectionManifestV2, /nodeDescriptors:unsorted/],
    [{ ...base, nodeDescriptors: [{ ...base.nodeDescriptors[0]!, forged: true }, ...base.nodeDescriptors.slice(1)] } as unknown as ProjectionManifestV2, /nodeDescriptors:unknown-key/],
    [{ ...base, edgeDescriptors: [{ ...base.edgeDescriptors[0]!, forged: true }] } as unknown as ProjectionManifestV2, /edgeDescriptors:unknown-key/]
  ];
  for (const [manifest, message] of cases) {
    let preparationCalls = 0;
    const mount = target();
    assert.throws(() => renderProjection(manifest, mount, { dom: {
      prepareHtml() { preparationCalls += 1; return prepared('html'); },
      prepareSvg() { preparationCalls += 1; return prepared('svg'); }
    } }), message);
    assert.equal(preparationCalls, 0);
    assert.equal(mount.calls.length, 0);
  }
});

test('rejects unknown prepared descriptor keys before target mutation', () => {
  const base = project(scene, 'html');
  const value = prepared('html');
  const hostile = { ...value, nodeDescriptors: [{ ...value.nodeDescriptors[0]!, forged: true }, ...value.nodeDescriptors.slice(1)] } as unknown as PreparedBrowserProjection<FakeNode>;
  const mount = target();
  assert.throws(() => renderProjection(base, mount, ports({ dom: { prepareHtml: () => hostile, prepareSvg: () => hostile } })), /BROWSER_RENDER_INVALID_CONTENT:html:nodeDescriptors:unknown-key/);
  assert.equal(mount.calls.length, 0);
});

test('derives Three semantic descriptors before calling the injected port', () => {
  for (const mutate of [
    (payload: MutableThreePayload) => { payload.nodes[0]!.label = 'drift'; },
    (payload: MutableThreePayload) => { payload.nodes[0]!.semanticKind = 'drift'; },
    (payload: MutableThreePayload) => { payload.edges[0]!.target = 'node:a'; }
  ]) {
    const base = project(scene, 'three');
    const payload = JSON.parse(base.content) as MutableThreePayload;
    mutate(payload);
    let portCalls = 0;
    const mount = target();
    assert.throws(() => renderProjection({ ...base, content: JSON.stringify(payload) }, mount, ports({
      three: { prepareThree() { portCalls += 1; return prepared('three'); } }
    })), /BROWSER_RENDER_(NODE|EDGE)_DESCRIPTORS_MISMATCH/);
    assert.equal(portCalls, 0);
    assert.equal(mount.calls.length, 0);
  }
});
