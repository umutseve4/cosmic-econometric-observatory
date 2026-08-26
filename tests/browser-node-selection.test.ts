import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodeSelectionController, type NodeSelectionTransition } from '../src/index.js';

const snapshotId = `sha256:${'a'.repeat(64)}`;

function setup(nodeIds: readonly string[] = ['node:a', 'node:b']) {
  const transitions: NodeSelectionTransition[] = [];
  const controller = createNodeSelectionController({ snapshotId, nodeIds, commit(transition) { transitions.push(transition); } });
  return { controller, transitions };
}

test('commits deterministic select and clear transitions exactly once', () => {
  const { controller, transitions } = setup();
  const selected = controller.dispatch({ type: 'select', nodeId: 'node:b', expectedSnapshotId: snapshotId });
  assert.equal(selected.outcome, 'committed'); assert.equal(selected.logicalCommitCount, 1);
  assert.deepEqual(controller.getState(), { selectedNodeId: 'node:b' }); assert.equal(transitions.length, 1);
  const cleared = controller.dispatch({ type: 'clear', expectedSnapshotId: snapshotId });
  assert.equal(cleared.outcome, 'committed'); assert.equal(cleared.logicalCommitCount, 1);
  assert.deepEqual(controller.getState(), { selectedNodeId: null }); assert.equal(transitions.length, 2);
  assert.ok(Object.isFrozen(controller.getState())); assert.ok(Object.isFrozen(selected));
});

test('returns zero-commit noops for repeated selection and empty clear', () => {
  const { controller, transitions } = setup();
  const emptyClear = controller.dispatch({ type: 'clear', expectedSnapshotId: snapshotId });
  assert.equal(emptyClear.outcome, 'noop'); assert.equal(emptyClear.logicalCommitCount, 0);
  controller.dispatch({ type: 'select', nodeId: 'node:a', expectedSnapshotId: snapshotId });
  const repeated = controller.dispatch({ type: 'select', nodeId: 'node:a', expectedSnapshotId: snapshotId });
  assert.equal(repeated.outcome, 'noop'); assert.equal(repeated.logicalCommitCount, 0); assert.equal(transitions.length, 1);
});

test('rejects unknown and stale commands with zero commits and no state change', () => {
  const { controller, transitions } = setup();
  const unknown = controller.dispatch({ type: 'select', nodeId: 'node:unknown', expectedSnapshotId: snapshotId });
  assert.deepEqual(unknown, { outcome: 'rejected', code: 'NODE_SELECTION_UNKNOWN_NODE_ID', state: { selectedNodeId: null }, logicalCommitCount: 0 });
  const staleSelect = controller.dispatch({ type: 'select', nodeId: 'node:a', expectedSnapshotId: 'stale' });
  assert.equal(staleSelect.outcome, 'rejected'); if (staleSelect.outcome === 'rejected') assert.equal(staleSelect.code, 'NODE_SELECTION_STALE_SNAPSHOT');
  const staleClear = controller.dispatch({ type: 'clear', expectedSnapshotId: 'stale' });
  assert.equal(staleClear.outcome, 'rejected'); assert.deepEqual(controller.getState(), { selectedNodeId: null }); assert.equal(transitions.length, 0);
});

test('fails closed on invalid registries and initial selections', () => {
  assert.throws(() => createNodeSelectionController({ snapshotId, nodeIds: [], commit() {} }), /NODE_SELECTION_EMPTY_NODE_IDS/);
  assert.throws(() => createNodeSelectionController({ snapshotId, nodeIds: ['node:a', 'node:a'], commit() {} }), /NODE_SELECTION_DUPLICATE_NODE_ID/);
  assert.throws(() => createNodeSelectionController({ snapshotId, nodeIds: ['node:a'], initialSelectedNodeId: 'node:b', commit() {} }), /NODE_SELECTION_UNKNOWN_INITIAL_NODE_ID/);
  assert.throws(() => createNodeSelectionController({ snapshotId: '', nodeIds: ['node:a'], commit() {} }), /NODE_SELECTION_INVALID_SNAPSHOT_ID/);
});

test('does not advance controller state when the synchronous commit port throws', () => {
  let calls = 0;
  const controller = createNodeSelectionController({ snapshotId, nodeIds: ['node:a'], commit() { calls += 1; throw new Error('commit-failed'); } });
  assert.throws(() => controller.dispatch({ type: 'select', nodeId: 'node:a', expectedSnapshotId: snapshotId }), /commit-failed/);
  assert.equal(calls, 1); assert.deepEqual(controller.getState(), { selectedNodeId: null });
});

test('copies the registry so caller mutation cannot alter persistent identity', () => {
  const nodeIds = ['node:a', 'node:b'];
  const { controller, transitions } = setup(nodeIds);
  nodeIds[0] = 'node:forged'; nodeIds.push('node:new');
  const forged = controller.dispatch({ type: 'select', nodeId: 'node:forged', expectedSnapshotId: snapshotId });
  assert.equal(forged.outcome, 'rejected');
  const original = controller.dispatch({ type: 'select', nodeId: 'node:a', expectedSnapshotId: snapshotId });
  assert.equal(original.outcome, 'committed'); assert.equal(transitions.length, 1);
});
