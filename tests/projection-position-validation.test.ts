import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectionKind, SceneIR } from '../src/index.js';
import { project } from '../src/projections.js';

const scene: SceneIR = {
  schemaVersion: '0.1.0',
  layoutVersion: 'finite-position-v1',
  seed: 'finite-position',
  inputHash: `sha256:${'d'.repeat(64)}`,
  nodes: [{
    id: 'node:a', semanticKind: 'program', label: 'A',
    position: { x: 0, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect']
  }],
  edges: []
};

for (const [projection, axis, value] of [
  ['three', 'x', Number.NaN],
  ['svg', 'y', Number.POSITIVE_INFINITY],
  ['html', 'z', Number.NEGATIVE_INFINITY]
] as const satisfies readonly [ProjectionKind, 'x' | 'y' | 'z', number][]) {
  test(`${projection} projection rejects non-finite ${axis} position`, () => {
    const invalid: SceneIR = {
      ...scene,
      nodes: [{ ...scene.nodes[0]!, position: { ...scene.nodes[0]!.position, [axis]: value } }]
    };
    assert.throws(
      () => project(invalid, projection),
      { message: 'INVALID_PROJECTION_POSITION:node:a' }
    );
  });
}
