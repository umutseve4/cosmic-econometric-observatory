import assert from 'node:assert/strict';
import test from 'node:test';
import type { PreparedBrowserProjection, ProjectionManifestV2, SceneIR } from '../src/index.js';
import { project, renderThreeWithFallback } from '../src/index.js';

const scene: SceneIR = {
  schemaVersion: '0.1.0', layoutVersion: 'm3h', seed: 'm3h', inputHash: `sha256:${'8'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 1, y: 0, z: 0 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: -1, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

function prepared(manifest: ProjectionManifestV2, root: string): PreparedBrowserProjection<string> {
  return {
    roots: [root], nodeIds: [...manifest.nodeIds], edgeIds: [...manifest.edgeIds],
    focusOrderNodeIds: [...manifest.focusOrderNodeIds],
    nodeDescriptors: manifest.nodeDescriptors.map((value) => ({ ...value })),
    edgeDescriptors: manifest.edgeDescriptors.map((value) => ({ ...value }))
  };
}

test('keeps the successful Three path to exactly one target commit', () => {
  const three = project(scene, 'three');
  const html = project(scene, 'html');
  let targetCalls = 0;
  let fallbackCalls = 0;
  const receipt = renderThreeWithFallback(three, html, { replaceChildren(root) {
    targetCalls += 1;
    assert.equal(root, 'three-root');
  } }, {
    dom: {
      prepareHtml() { fallbackCalls += 1; return prepared(html, 'html-root'); },
      prepareSvg() { throw new Error('unused'); }
    },
    three: { prepareThree() { return prepared(three, 'three-root'); } }
  });
  assert.equal(targetCalls, 1);
  assert.equal(fallbackCalls, 0);
  assert.equal(receipt.outcome, 'three');
  assert.equal(receipt.fallbackProjection, null);
  assert.equal(receipt.primaryFailure, null);
});

test('mounts one usable semantic fallback after zero failed-Three target commits', () => {
  const three = project(scene, 'three');
  const html = project(scene, 'html');
  let threePreparations = 0;
  let fallbackPreparations = 0;
  const committedRoots: string[] = [];
  const receipt = renderThreeWithFallback(three, html, { replaceChildren(...roots) {
    committedRoots.push(...roots);
  } }, {
    dom: {
      prepareHtml() { fallbackPreparations += 1; return prepared(html, 'html-root'); },
      prepareSvg() { throw new Error('unused'); }
    },
    three: { prepareThree() {
      threePreparations += 1;
      throw new Error('forced-webgl-failure');
    } }
  });
  assert.equal(threePreparations, 1);
  assert.equal(fallbackPreparations, 1);
  assert.deepEqual(committedRoots, ['html-root']);
  assert.equal(receipt.outcome, 'fallback');
  assert.equal(receipt.fallbackProjection, 'html');
  assert.equal(receipt.primaryFailure, 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed');
  assert.deepEqual(receipt.render.nodeIds, three.nodeIds);
  assert.deepEqual(receipt.render.edgeIds, three.edgeIds);
  assert.deepEqual(receipt.render.focusOrderNodeIds, three.focusOrderNodeIds);
});

test('rejects semantic drift before either preparation port or target is invoked', () => {
  const three = project(scene, 'three');
  const html = project(scene, 'html');
  const drifted = { ...html, focusOrderNodeIds: [...html.focusOrderNodeIds].reverse() };
  let calls = 0;
  assert.throws(() => renderThreeWithFallback(three, drifted, { replaceChildren() { calls += 1; } }, {
    dom: { prepareHtml() { calls += 1; return prepared(html, 'html-root'); }, prepareSvg() { throw new Error('unused'); } },
    three: { prepareThree() { calls += 1; return prepared(three, 'three-root'); } }
  }), /BROWSER_FALLBACK_SEMANTIC_PARITY_MISMATCH/);
  assert.equal(calls, 0);
});

test('does not treat malformed Three content or target commit failure as a fallback condition', () => {
  const three = project(scene, 'three');
  const html = project(scene, 'html');
  let fallbackCalls = 0;
  const dom = {
    prepareHtml() { fallbackCalls += 1; return prepared(html, 'html-root'); },
    prepareSvg() { throw new Error('unused'); }
  };
  assert.throws(() => renderThreeWithFallback({ ...three, content: '{' }, html, { replaceChildren() {} }, {
    dom, three: { prepareThree() { return prepared(three, 'three-root'); } }
  }), /BROWSER_RENDER_INVALID_CONTENT:three:malformed-json/);
  assert.equal(fallbackCalls, 0);
  assert.throws(() => renderThreeWithFallback(three, html, { replaceChildren() { throw new Error('target-failed'); } }, {
    dom, three: { prepareThree() { return prepared(three, 'three-root'); } }
  }), /target-failed/);
  assert.equal(fallbackCalls, 0);
});
