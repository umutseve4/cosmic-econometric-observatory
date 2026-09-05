import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFocusBounds, deriveFocusCamera, summarizeFocusTarget, FOCUS_DEFAULT_NODE_RADIUS } from '../src/index.js';
import type { SceneIR, SceneEdge, SceneNode } from '../src/index.js';

function node(id: string, x: number, y: number, z: number): SceneNode {
  return { id, semanticKind: 'course', label: id, position: { x, y, z }, focusOrder: 1, capabilities: ['inspect', 'navigate'] };
}

function edge(id: string, source: string, target: string): SceneEdge {
  return { id, semanticKind: 'requires', source, target };
}

function scene(nodes: readonly SceneNode[], edges: readonly SceneEdge[]): SceneIR {
  return { schemaVersion: '0.1.0', layoutVersion: 'radial-v1', seed: 'test', inputHash: 'sha256:test', nodes, edges };
}

const base = scene(
  [node('a', 0, 0, 0), node('b', 10, 0, 0), node('c', 0, 10, 0), node('far', 100, 100, 100)],
  [edge('e1', 'a', 'b'), edge('e2', 'c', 'a')]
);

test('collects the selected node and its neighbours in both edge directions', () => {
  const focus = deriveFocusBounds(base, 'a');
  assert.ok(focus);
  assert.equal(focus.selectedNodeId, 'a');
  assert.deepEqual([...focus.neighborIds], ['b', 'c']);
  assert.equal(focus.bounds.minX, -FOCUS_DEFAULT_NODE_RADIUS);
  assert.equal(focus.bounds.maxX, 10 + FOCUS_DEFAULT_NODE_RADIUS);
  assert.equal(focus.bounds.maxY, 10 + FOCUS_DEFAULT_NODE_RADIUS);
});

test('excludes unrelated nodes from the focus volume', () => {
  const focus = deriveFocusBounds(base, 'a');
  assert.ok(focus);
  assert.ok(!focus.neighborIds.includes('far'));
  assert.ok(focus.bounds.maxX < 100);
});

test('fails closed when the selection does not resolve to exactly one node', () => {
  assert.equal(deriveFocusBounds(base, null), null);
  assert.equal(deriveFocusBounds(base, undefined), null);
  assert.equal(deriveFocusBounds(base, ''), null);
  assert.equal(deriveFocusBounds(base, 'missing'), null);
  const duplicated = scene([node('a', 0, 0, 0), node('a', 5, 5, 5)], []);
  assert.equal(deriveFocusBounds(duplicated, 'a'), null);
});

test('an isolated node still yields a non-degenerate volume', () => {
  const focus = deriveFocusBounds(base, 'far');
  assert.ok(focus);
  assert.equal(focus.neighborIds.length, 0);
  assert.ok(focus.bounds.maxX > focus.bounds.minX);
  assert.ok(focus.bounds.maxY > focus.bounds.minY);
  assert.ok(focus.bounds.maxZ > focus.bounds.minZ);
});

test('self-loops add no neighbour and duplicate edge ids are counted once', () => {
  const looped = scene([node('a', 0, 0, 0), node('b', 4, 0, 0)], [edge('e1', 'a', 'a'), edge('e2', 'a', 'b'), edge('e2', 'a', 'b')]);
  const focus = deriveFocusBounds(looped, 'a');
  assert.ok(focus);
  assert.deepEqual([...focus.neighborIds], ['b']);
});

test('dangling edges and non-finite neighbour coordinates are ignored', () => {
  const broken = scene(
    [node('a', 0, 0, 0), node('b', 4, 0, 0), { ...node('bad', 0, 0, 0), position: { x: Number.NaN, y: 0, z: 0 } }],
    [edge('e1', 'a', 'ghost'), edge('e2', 'a', 'bad'), edge('e3', 'a', 'b')]
  );
  const focus = deriveFocusBounds(broken, 'a');
  assert.ok(focus);
  assert.deepEqual([...focus.neighborIds], ['b']);
  assert.ok(Number.isFinite(focus.bounds.minX));
});

test('fails closed when the selected node itself has non-finite coordinates', () => {
  const broken = scene([{ ...node('a', 0, 0, 0), position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } }], []);
  assert.equal(deriveFocusBounds(broken, 'a'), null);
});

test('is deterministic under node and edge permutation', () => {
  const permuted = scene([base.nodes[3]!, base.nodes[1]!, base.nodes[0]!, base.nodes[2]!], [base.edges[1]!, base.edges[0]!]);
  assert.deepEqual(deriveFocusBounds(permuted, 'a'), deriveFocusBounds(base, 'a'));
});

test('does not mutate the scene and returns frozen results', () => {
  const snapshot = JSON.stringify(base);
  const focus = deriveFocusBounds(base, 'a');
  assert.ok(focus);
  assert.equal(JSON.stringify(base), snapshot);
  assert.ok(Object.isFrozen(focus));
  assert.ok(Object.isFrozen(focus.bounds));
  assert.ok(Object.isFrozen(focus.neighborIds));
});

test('rejects an invalid node radius by failing closed', () => {
  assert.equal(deriveFocusBounds(base, 'a', Number.NaN), null);
  assert.equal(deriveFocusBounds(base, 'a', -1), null);
});

test('deriveFocusCamera frames the volume and never throws on bad input', () => {
  const focus = deriveFocusBounds(base, 'a');
  const fit = deriveFocusCamera(focus, 50, 4 / 3);
  assert.ok(fit);
  assert.ok(fit.distance > 0);
  assert.ok(fit.near > 0 && fit.near < fit.far);
  assert.equal(deriveFocusCamera(focus, 50, 0), null);
  assert.equal(deriveFocusCamera(focus, 0, 4 / 3), null);
  assert.equal(deriveFocusCamera(focus, 50, Number.NaN), null);
  assert.equal(deriveFocusCamera(null, 50, 4 / 3), null);
});

test('focusing a neighbour-rich node stays closer than framing the whole scene', () => {
  const near = deriveFocusCamera(deriveFocusBounds(base, 'a'), 50, 4 / 3);
  const whole = deriveFocusCamera(deriveFocusBounds(base, 'far'), 50, 4 / 3);
  assert.ok(near);
  assert.ok(whole);
  assert.ok(whole.distance < near.distance);
});

test('summarizeFocusTarget reports a stable shape in both resolved and cleared states', () => {
  const focus = deriveFocusBounds(base, 'a');
  const summary = summarizeFocusTarget(focus, deriveFocusCamera(focus, 50, 4 / 3));
  assert.equal(summary.selectedNodeId, 'a');
  assert.equal(summary.neighborCount, 2);
  assert.ok(summary.center);
  assert.equal(Object.keys(summary).join(','), 'selectedNodeId,neighborCount,center,distance');
  const cleared = summarizeFocusTarget(null, null);
  assert.deepEqual({ ...cleared }, { selectedNodeId: null, neighborCount: 0, center: null, distance: null });
});

test('rejects a malformed scene', () => {
  assert.throws(() => deriveFocusBounds(null as unknown as SceneIR, 'a'), /THREE_FOCUS_INVALID_INPUT:scene/);
  assert.throws(() => deriveFocusBounds({} as unknown as SceneIR, 'a'), /THREE_FOCUS_INVALID_INPUT:scene/);
});
