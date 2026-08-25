import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneIR } from '../src/index.js';
import { project } from '../src/index.js';

const labelA = `A <&> "quoted" 'single' \u{1F680}`;
const scene: SceneIR = {
  schemaVersion: '0.1.0',
  layoutVersion: 'descriptor-test-v1',
  seed: 'descriptor-test',
  inputHash: `sha256:${'d'.repeat(64)}`,
  nodes: [
    { id: 'node:z', semanticKind: `course<&"'`, label: 'Z', position: { x: 2, y: 0, z: 2 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: labelA, position: { x: 1, y: 0, z: 1 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [
    { id: 'edge:z', semanticKind: 'RELATED_TO', source: 'node:z', target: 'node:a' },
    { id: 'edge:a', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:z' }
  ]
};

test('all projections carry the same mandatory canonical semantic descriptors', () => {
  const manifests = (['html', 'svg', 'three'] as const).map((kind) => project(scene, kind));
  const expectedNodes = [
    { id: 'node:a', label: labelA, kind: 'program' },
    { id: 'node:z', label: 'Z', kind: `course<&"'` }
  ];
  const expectedEdges = [
    { id: 'edge:a', source: 'node:a', target: 'node:z' },
    { id: 'edge:z', source: 'node:z', target: 'node:a' }
  ];
  for (const manifest of manifests) {
    assert.equal(manifest.schemaVersion, '2.0.0');
    assert.deepEqual(manifest.nodeDescriptors, expectedNodes);
    assert.deepEqual(manifest.edgeDescriptors, expectedEdges);
  }
});

test('Three descriptor values remain exact after JSON parsing and markup escapes raw values', () => {
  const three = project(scene, 'three');
  const parsed = JSON.parse(three.content) as { nodes: Array<{ id: string; label: string; semanticKind: string }> };
  const parsedA = parsed.nodes.find(({ id }) => id === 'node:a');
  const parsedZ = parsed.nodes.find(({ id }) => id === 'node:z');
  assert.equal(parsedA?.label, labelA);
  assert.equal(parsedA?.semanticKind, 'program');
  assert.equal(parsedZ?.semanticKind, `course<&"'`);

  for (const kind of ['html', 'svg'] as const) {
    const content = project(scene, kind).content;
    assert.equal(content.includes(labelA), false);
    assert.match(content, /A &lt;&amp;&gt; &quot;quoted&quot; 'single' 🚀/u);
  }
});

test('node and edge input reordering is byte deterministic for every projection', () => {
  const reordered: SceneIR = { ...scene, nodes: [...scene.nodes].reverse(), edges: [...scene.edges].reverse() };
  for (const kind of ['html', 'svg', 'three'] as const) {
    assert.deepEqual(project(scene, kind), project(reordered, kind));
  }
});
