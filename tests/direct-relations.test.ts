import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDirectRelations, type SceneIR } from '../src/index.js';

function scene(edges: SceneIR['edges']): SceneIR {
  const ids = ['A', 'B', 'C', 'D'];
  return {
    schemaVersion: '0.1.0', layoutVersion: 'test', seed: 'test', inputHash: `sha256:${'a'.repeat(64)}`,
    nodes: ids.map((id, index) => ({ id, semanticKind: 'test', label: id, position: { x: index, y: 0, z: 0 }, focusOrder: index + 1, capabilities: ['inspect', 'navigate'] as const })),
    edges
  };
}
const edge = (id: string, source: string, target: string) => ({ id, semanticKind: 'RELATES', source, target });

test('derives deterministic incoming and outgoing one-hop relations only', () => {
  const input = scene([edge('A-B', 'A', 'B'), edge('B-C', 'B', 'C'), edge('A-C', 'A', 'C')]);
  const relations = deriveDirectRelations(input, 'B');
  assert.deepEqual(relations.incoming.map(({ edgeId, relatedNodeId }) => [edgeId, relatedNodeId]), [['A-B', 'A']]);
  assert.deepEqual(relations.outgoing.map(({ edgeId, relatedNodeId }) => [edgeId, relatedNodeId]), [['B-C', 'C']]);
  assert.deepEqual(relations.highlightedEdgeIds, ['A-B', 'B-C']);
  assert.deepEqual(relations.relatedNodeIds, ['A', 'C']);
  assert.deepEqual(deriveDirectRelations(input, 'B'), relations);
  assert.ok(Object.isFrozen(relations)); assert.ok(Object.isFrozen(relations.incoming)); assert.ok(Object.isFrozen(relations.incoming[0]));
});

test('returns frozen empty state for no selection or an unknown node', () => {
  const input = scene([edge('A-B', 'A', 'B')]);
  assert.deepEqual(deriveDirectRelations(input, null), { incoming: [], outgoing: [], highlightedEdgeIds: [], relatedNodeIds: [] });
  assert.deepEqual(deriveDirectRelations(input, 'missing'), { incoming: [], outgoing: [], highlightedEdgeIds: [], relatedNodeIds: [] });
});

test('keeps self loops directional once and parallel edge identities separately', () => {
  const relations = deriveDirectRelations(scene([edge('self', 'B', 'B'), edge('one', 'A', 'B'), edge('two', 'A', 'B')]), 'B');
  assert.deepEqual(relations.incoming.map(({ edgeId }) => edgeId), ['self', 'one', 'two']);
  assert.deepEqual(relations.outgoing.map(({ edgeId }) => edgeId), ['self']);
  assert.deepEqual(relations.highlightedEdgeIds, ['self', 'one', 'two']);
  assert.deepEqual(relations.relatedNodeIds, ['A']);
});

test('keeps bidirectional edges separated by direction', () => {
  const relations = deriveDirectRelations(scene([edge('A-B', 'A', 'B'), edge('B-A', 'B', 'A')]), 'B');
  assert.deepEqual(relations.incoming.map(({ edgeId }) => edgeId), ['A-B']);
  assert.deepEqual(relations.outgoing.map(({ edgeId }) => edgeId), ['B-A']);
  assert.deepEqual(relations.highlightedEdgeIds, ['A-B', 'B-A']);
  assert.deepEqual(relations.relatedNodeIds, ['A']);
});

test('fails closed on dangling endpoints and every occurrence of a duplicate edge id', () => {
  const relations = deriveDirectRelations(scene([
    edge('valid', 'A', 'B'), edge('dangling', 'missing', 'B'), edge('duplicate', 'B', 'C'), edge('duplicate', 'B', 'D')
  ]), 'B');
  assert.deepEqual(relations.incoming.map(({ edgeId }) => edgeId), ['valid']);
  assert.deepEqual(relations.outgoing, []);
  assert.deepEqual(relations.highlightedEdgeIds, ['valid']);
  assert.deepEqual(relations.relatedNodeIds, ['A']);
});

test('does not mutate the scene or alter node and edge identities', () => {
  const input = scene([edge('A-B', 'A', 'B')]);
  const before = JSON.stringify(input);
  deriveDirectRelations(input, 'B');
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.nodes.map(({ id }) => id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(input.edges.map(({ id }) => id), ['A-B']);
});
