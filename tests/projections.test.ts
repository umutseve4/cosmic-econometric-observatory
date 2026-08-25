import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneIR } from '../src/scene.js';
import { project } from '../src/projections.js';

const scene: SceneIR = {
  schemaVersion: '0.1.0',
  layoutVersion: 'test-v1',
  seed: 'projection-test',
  inputHash: `sha256:${'a'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B & Beyond', position: { x: 2, y: 0, z: 2 }, focusOrder: 2, capabilities: ['inspect', 'navigate'] },
    { id: 'node:a', semanticKind: 'program', label: 'A <Program>', position: { x: 1, y: 0, z: 1 }, focusOrder: 1, capabilities: ['inspect', 'navigate'] }
  ],
  edges: [
    { id: 'edge:b-a', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }
  ]
};

test('all projections expose identical semantic node, edge and focus-order contracts', () => {
  const outputs = (['three', 'svg', 'html'] as const).map((kind) => project(scene, kind));
  for (const output of outputs) {
    assert.deepEqual(output.nodeIds, ['node:a', 'node:b']);
    assert.deepEqual(output.edgeIds, ['edge:b-a']);
    assert.deepEqual(output.focusOrderNodeIds, ['node:a', 'node:b']);
  }
});

test('focus order is deterministic rather than inherited from scene array order', () => {
  const baseline = project(scene, 'html');
  const reversed = project({ ...scene, nodes: [...scene.nodes].reverse() }, 'html');
  assert.deepEqual(reversed.focusOrderNodeIds, baseline.focusOrderNodeIds);
  assert.equal(reversed.content, baseline.content);
  assert.ok(baseline.content.indexOf('data-node-id="node:a"') < baseline.content.indexOf('data-node-id="node:b"'));
});

test('HTML fallback provides navigable node targets and linked relations', () => {
  const html = project(scene, 'html').content;
  assert.match(html, /<a href="#node:a" data-node-id="node:a">A &lt;Program&gt;<\/a>/);
  assert.match(html, /<article id="node:a" tabindex="-1"/);
  assert.match(html, /data-edge-id="edge:b-a"/);
  assert.match(html, /<a href="#node:a">node:a<\/a> → <a href="#node:b">node:b<\/a>/);
  assert.doesNotMatch(html, /A <Program>/);
});

test('SVG exposes deterministic keyboard and screen-reader traversal metadata', () => {
  const svg = project(scene, 'svg').content;
  assert.match(svg, /role="list" aria-label="Knowledge nodes"/);
  assert.match(svg, /aria-label="1 of 2: A &lt;Program&gt; \(program\)"/);
  assert.match(svg, /aria-label="2 of 2: B &amp; Beyond \(course\)"/);
  assert.equal((svg.match(/tabindex="0"/g) ?? []).length, 2);
  assert.ok(svg.indexOf('data-node-id="node:a"') < svg.indexOf('data-node-id="node:b"'));
});

test('projection fails closed on duplicate or invalid focus order', () => {
  const duplicate = { ...scene, nodes: scene.nodes.map((node) => ({ ...node, focusOrder: 1 })) };
  assert.throws(() => project(duplicate, 'html'), /INVALID_PROJECTION_FOCUS_ORDER:node:a:1/);
  const invalid = { ...scene, nodes: [{ ...scene.nodes[0]!, focusOrder: 0 }, scene.nodes[1]!] };
  assert.throws(() => project(invalid, 'svg'), /INVALID_PROJECTION_FOCUS_ORDER:node:b:0/);
});
