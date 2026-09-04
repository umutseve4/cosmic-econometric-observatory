import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveThreeSelectionStyling,
  summarizeThreeSelectionStyling,
  THREE_SELECTION_PALETTE,
  type SceneIR,
  type ThreeSelectionStyling
} from '../src/index.js';

function scene(edges: SceneIR['edges'], kinds: Record<string, string> = {}): SceneIR {
  const ids = ['A', 'B', 'C', 'D'];
  return {
    schemaVersion: '0.1.0', layoutVersion: 'test', seed: 'test', inputHash: `sha256:${'a'.repeat(64)}`,
    nodes: ids.map((id, index) => ({ id, semanticKind: kinds[id] ?? 'course', label: id, position: { x: index, y: 0, z: 0 }, focusOrder: index + 1, capabilities: ['inspect', 'navigate'] as const })),
    edges
  };
}
const edge = (id: string, source: string, target: string) => ({ id, semanticKind: 'RELATES', source, target });
const states = (styling: ThreeSelectionStyling) => ({
  nodes: styling.nodes.map(({ id, state }) => [id, state]),
  edges: styling.edges.map(({ id, state }) => [id, state])
});

test('projects one-hop direction onto node and edge states in Scene IR order', () => {
  const input = scene([edge('A-B', 'A', 'B'), edge('B-C', 'B', 'C'), edge('A-C', 'A', 'C')]);
  const styling = deriveThreeSelectionStyling(input, 'B');
  assert.equal(styling.selectedNodeId, 'B');
  assert.deepEqual(states(styling), {
    nodes: [['A', 'incoming'], ['B', 'selected'], ['C', 'outgoing'], ['D', 'unrelated']],
    edges: [['A-B', 'incoming'], ['B-C', 'outgoing'], ['A-C', 'unrelated']]
  });
});

test('is deterministic and returns a deeply frozen result', () => {
  const input = scene([edge('A-B', 'A', 'B'), edge('B-C', 'B', 'C')]);
  const first = deriveThreeSelectionStyling(input, 'B');
  assert.deepEqual(deriveThreeSelectionStyling(input, 'B'), first);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.nodes));
  assert.ok(Object.isFrozen(first.edges));
  assert.ok(first.nodes.every((node) => Object.isFrozen(node)));
  assert.ok(first.edges.every((value) => Object.isFrozen(value)));
});

test('emphasis never relies on colour alone', () => {
  const styling = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B')]), 'B');
  const byId = new Map(styling.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get('B')!.scale, 1.9);
  assert.equal(byId.get('A')!.scale, 1.35);
  assert.equal(byId.get('D')!.scale, 0.8);
  assert.equal(byId.get('D')!.opacity, 0.18);
  assert.equal(styling.edges[0]!.opacity, 1);
  const cleared = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B')]), null);
  assert.ok(cleared.nodes.every(({ scale, opacity }) => scale === 1 && opacity === 1));
});

test('a cleared selection restores the prepared scene colours exactly', () => {
  const input = scene([edge('A-B', 'A', 'B')], { A: 'program' });
  const cleared = deriveThreeSelectionStyling(input, null);
  assert.equal(cleared.selectedNodeId, null);
  assert.ok(cleared.nodes.every(({ state }) => state === 'neutral'));
  assert.ok(cleared.edges.every(({ state, color, opacity }) => state === 'neutral' && color === THREE_SELECTION_PALETTE.edge && opacity === 1));
  assert.equal(cleared.nodes.find(({ id }) => id === 'A')!.color, THREE_SELECTION_PALETTE.programNode);
  assert.equal(cleared.nodes.find(({ id }) => id === 'B')!.color, THREE_SELECTION_PALETTE.otherNode);
});

test('an unresolvable selection fails closed to the neutral styling', () => {
  const input = scene([edge('A-B', 'A', 'B')]);
  const neutral = deriveThreeSelectionStyling(input, null);
  assert.deepEqual(deriveThreeSelectionStyling(input, 'missing'), neutral);
  const duplicated: SceneIR = { ...input, nodes: [...input.nodes, { id: 'B', semanticKind: 'course', label: 'B', position: { x: 9, y: 0, z: 0 }, focusOrder: 9, capabilities: ['inspect', 'navigate'] }] };
  assert.equal(deriveThreeSelectionStyling(duplicated, 'B').selectedNodeId, null);
  assert.ok(deriveThreeSelectionStyling(duplicated, 'B').edges.every(({ state }) => state === 'neutral'));
});

test('keeps unrelated nodes dim while preserving their base colour', () => {
  const styling = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B')], { D: 'program' }), 'B');
  const unrelated = styling.nodes.find(({ id }) => id === 'D')!;
  assert.equal(unrelated.state, 'unrelated');
  assert.equal(unrelated.color, THREE_SELECTION_PALETTE.programNode);
  assert.equal(unrelated.opacity, 0.18);
  const unrelatedEdge = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B'), edge('C-D', 'C', 'D')]), 'B').edges.find(({ id }) => id === 'C-D')!;
  assert.equal(unrelatedEdge.state, 'unrelated');
  assert.equal(unrelatedEdge.color, THREE_SELECTION_PALETTE.edge);
  assert.equal(unrelatedEdge.opacity, 0.08);
});

test('marks self loops and bidirectional pairs by their true direction', () => {
  const loop = deriveThreeSelectionStyling(scene([edge('self', 'B', 'B')]), 'B');
  assert.deepEqual(loop.edges.map(({ id, state }) => [id, state]), [['self', 'incoming-outgoing']]);
  assert.equal(loop.nodes.find(({ id }) => id === 'B')!.state, 'selected');
  const both = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B'), edge('B-A', 'B', 'A')]), 'B');
  assert.equal(both.nodes.find(({ id }) => id === 'A')!.state, 'incoming-outgoing');
  assert.equal(both.nodes.find(({ id }) => id === 'A')!.color, THREE_SELECTION_PALETTE.incomingOutgoing);
  assert.deepEqual(both.edges.map(({ state }) => state), ['incoming', 'outgoing']);
});

test('excludes dangling and duplicated edges from emphasis', () => {
  const styling = deriveThreeSelectionStyling(scene([
    edge('valid', 'A', 'B'), edge('dangling', 'missing', 'B'), edge('duplicate', 'B', 'C'), edge('duplicate', 'B', 'D')
  ]), 'B');
  assert.deepEqual(styling.edges.map(({ id, state }) => [id, state]), [
    ['valid', 'incoming'], ['dangling', 'unrelated'], ['duplicate', 'unrelated'], ['duplicate', 'unrelated']
  ]);
  assert.deepEqual(styling.nodes.map(({ id, state }) => [id, state]), [
    ['A', 'incoming'], ['B', 'selected'], ['C', 'unrelated'], ['D', 'unrelated']
  ]);
});

test('summarizes styling into assertable state counts', () => {
  const styling = deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B'), edge('B-C', 'B', 'C'), edge('A-C', 'A', 'C')]), 'B');
  assert.deepEqual(summarizeThreeSelectionStyling(styling), {
    selectedNodeId: 'B',
    nodes: { selected: 1, incoming: 1, outgoing: 1, incomingOutgoing: 0, unrelated: 1, neutral: 0 },
    edges: { selected: 0, incoming: 1, outgoing: 1, incomingOutgoing: 0, unrelated: 1, neutral: 0 }
  });
  const cleared = summarizeThreeSelectionStyling(deriveThreeSelectionStyling(scene([edge('A-B', 'A', 'B')]), null));
  assert.deepEqual(cleared, {
    selectedNodeId: null,
    nodes: { selected: 0, incoming: 0, outgoing: 0, incomingOutgoing: 0, unrelated: 0, neutral: 4 },
    edges: { selected: 0, incoming: 0, outgoing: 0, incomingOutgoing: 0, unrelated: 0, neutral: 1 }
  });
  assert.ok(Object.isFrozen(summarizeThreeSelectionStyling(styling)));
});

test('rejects a malformed scene instead of guessing', () => {
  assert.throws(() => deriveThreeSelectionStyling(null as unknown as SceneIR, null), /THREE_SELECTION_INVALID_INPUT:scene/u);
  assert.throws(() => deriveThreeSelectionStyling({ nodes: [] } as unknown as SceneIR, null), /THREE_SELECTION_INVALID_INPUT:scene/u);
});

test('never mutates the scene or reorders its identities', () => {
  const input = scene([edge('A-B', 'A', 'B'), edge('B-C', 'B', 'C')]);
  const before = JSON.stringify(input);
  deriveThreeSelectionStyling(input, 'B');
  assert.equal(JSON.stringify(input), before);
  const styling = deriveThreeSelectionStyling(input, 'B');
  assert.deepEqual(styling.nodes.map(({ id }) => id), input.nodes.map(({ id }) => id));
  assert.deepEqual(styling.edges.map(({ id }) => id), input.edges.map(({ id }) => id));
});
