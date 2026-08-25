import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectionManifest, SceneIR } from '../src/index.js';
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

function assertStructurallyNested(markup: string): void {
  const stack: string[] = [];
  let cursor = 0;
  while (cursor < markup.length) {
    const opening = markup.indexOf('<', cursor);
    if (opening === -1) break;
    let quote: '"' | "'" | undefined;
    let closing = -1;
    for (let index = opening + 1; index < markup.length; index += 1) {
      const character = markup[index]!;
      if (quote !== undefined) {
        if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '>') {
        closing = index;
        break;
      }
    }
    if (closing === -1) throw new Error(`UNTERMINATED_TAG_AT:${opening}`);
    const token = markup.slice(opening + 1, closing).trim();
    if (token.startsWith('!') || token.startsWith('?')) {
      cursor = closing + 1;
      continue;
    }
    const isClosing = token.startsWith('/');
    const isSelfClosing = token.endsWith('/');
    const nameSource = isClosing ? token.slice(1).trimStart() : token;
    const name = /^[A-Za-z][A-Za-z0-9:-]*/.exec(nameSource)?.[0]?.toLowerCase();
    if (name === undefined) throw new Error(`INVALID_TAG_AT:${opening}`);
    if (isClosing) {
      if (isSelfClosing) throw new Error(`INVALID_SELF_CLOSING_END_TAG:${name}`);
      const expected = stack.pop();
      if (expected !== name) throw new Error(`MISMATCHED_CLOSING_TAG:${name}:${expected ?? 'none'}`);
    } else if (!isSelfClosing) {
      stack.push(name);
    }
    cursor = closing + 1;
  }
  if (stack.length > 0) throw new Error(`UNCLOSED_TAGS:${stack.join(',')}`);
}

test('structural nesting helper rejects crossed and missing closing tags', () => {
  assert.throws(() => assertStructurallyNested('<section><article></section></article>'), /MISMATCHED_CLOSING_TAG:section:article/);
  assert.throws(() => assertStructurallyNested('<section><article></article>'), /UNCLOSED_TAGS:section/);
  assert.doesNotThrow(() => assertStructurallyNested('<nav></nav><main><article data-note=">"></article></main>'));
});

test('all projections expose identical semantic node, edge and focus-order contracts', () => {
  const outputs = (['three', 'svg', 'html'] as const).map((kind) => project(scene, kind));
  for (const output of outputs) {
    assert.equal(output.schemaVersion, '2.0.0');
    assert.deepEqual(output.nodeIds, ['node:a', 'node:b']);
    assert.deepEqual(output.edgeIds, ['edge:b-a']);
    assert.deepEqual(output.focusOrderNodeIds, ['node:a', 'node:b']);
  }
});

test('legacy ProjectionManifest construction remains source-compatible', () => {
  const legacy: ProjectionManifest = { projection: 'html', nodeIds: [], edgeIds: [], content: '' };
  assert.equal(legacy.projection, 'html');
});

test('focus order is deterministic rather than inherited from scene array order', () => {
  const baseline = project(scene, 'html');
  const reversed = project({ ...scene, nodes: [...scene.nodes].reverse() }, 'html');
  assert.deepEqual(reversed.focusOrderNodeIds, baseline.focusOrderNodeIds);
  assert.equal(reversed.content, baseline.content);
  assert.ok(baseline.content.indexOf('data-node-id="node:a"') < baseline.content.indexOf('data-node-id="node:b"'));
});

test('HTML fallback provides structurally nested node targets and linked relations', () => {
  const html = project(scene, 'html').content;
  assert.match(html, /<a href="#node:a" data-node-id="node:a">A &lt;Program&gt;<\/a>/);
  assert.match(html, /<article id="node:a" tabindex="-1"/);
  assert.match(html, /data-edge-id="edge:b-a"/);
  assert.match(html, /<a href="#node:a">node:a<\/a> → <a href="#node:b">node:b<\/a>/);
  assert.doesNotMatch(html, /A <Program>/);
  assertStructurallyNested(html);
});

test('SVG preserves descendant keyboard and screen-reader traversal semantics', () => {
  const svg = project(scene, 'svg').content;
  assert.match(svg, /^<svg role="group" aria-label="Academic knowledge universe">/);
  assert.doesNotMatch(svg, /role="img"/);
  assert.match(svg, /role="list" aria-label="Knowledge nodes"/);
  assert.match(svg, /aria-label="1 of 2: A &lt;Program&gt; \(program\)"/);
  assert.match(svg, /aria-label="2 of 2: B &amp; Beyond \(course\)"/);
  assert.equal((svg.match(/tabindex="0"/g) ?? []).length, 2);
  assert.ok(svg.indexOf('data-node-id="node:a"') < svg.indexOf('data-node-id="node:b"'));
});

const escapeCases = [
  { name: 'ampersand', raw: '&', escaped: '&amp;' },
  { name: 'double quote', raw: '"', escaped: '&quot;' },
  { name: 'less-than', raw: '<', escaped: '&lt;' },
  { name: 'greater-than', raw: '>', escaped: '&gt;' },
  {
    name: 'combined attribute and element injection payload',
    raw: '" onfocus="alert(1)"><script>alert(1)</script>&',
    escaped: '&quot; onfocus=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;'
  }
] as const;

for (const escapeCase of escapeCases) {
  test(`HTML and SVG escape ${escapeCase.name} in every emitted semantic string context`, () => {
    const nodeAId = `node:a-${escapeCase.raw}`;
    const nodeBId = `node:b-${escapeCase.raw}`;
    const nodeKind = `kind-${escapeCase.raw}`;
    const nodeLabel = `Label ${escapeCase.raw}`;
    const edgeId = `edge:${escapeCase.raw}`;
    const edgeKind = `REL-${escapeCase.raw}`;
    const encodedNodeAId = `node:a-${escapeCase.escaped}`;
    const encodedNodeBId = `node:b-${escapeCase.escaped}`;
    const encodedNodeKind = `kind-${escapeCase.escaped}`;
    const encodedNodeLabel = `Label ${escapeCase.escaped}`;
    const encodedEdgeId = `edge:${escapeCase.escaped}`;
    const encodedEdgeKind = `REL-${escapeCase.escaped}`;
    const hostileScene: SceneIR = {
      ...scene,
      nodes: [
        { ...scene.nodes[1]!, id: nodeAId, semanticKind: nodeKind, label: nodeLabel, focusOrder: 1 },
        { ...scene.nodes[0]!, id: nodeBId, semanticKind: nodeKind, label: nodeLabel, focusOrder: 2 }
      ],
      edges: [{ id: edgeId, semanticKind: edgeKind, source: nodeAId, target: nodeBId }]
    };

    const html = project(hostileScene, 'html').content;
    assert.ok(html.includes(`<a href="#${encodedNodeAId}" data-node-id="${encodedNodeAId}">${encodedNodeLabel}</a>`));
    assert.ok(html.includes(`<article id="${encodedNodeAId}" tabindex="-1" data-node-id="${encodedNodeAId}" data-semantic-kind="${encodedNodeKind}"><h2>${encodedNodeLabel}</h2><p>${encodedNodeKind}</p></article>`));
    assert.ok(html.includes(`<li data-edge-id="${encodedEdgeId}" data-semantic-kind="${encodedEdgeKind}"><a href="#${encodedNodeAId}">${encodedNodeAId}</a> → <a href="#${encodedNodeBId}">${encodedNodeBId}</a></li>`));
    assertStructurallyNested(html);

    const svg = project(hostileScene, 'svg').content;
    assert.ok(svg.includes(`<g id="${encodedNodeAId}" role="listitem" tabindex="0" data-node-id="${encodedNodeAId}" data-semantic-kind="${encodedNodeKind}" aria-label="1 of 2: ${encodedNodeLabel} (${encodedNodeKind})"><circle`));
    assert.ok(svg.includes(`<title>${encodedNodeLabel}</title></g>`));
    assert.ok(svg.includes(`<path data-edge-id="${encodedEdgeId}" data-semantic-kind="${encodedEdgeKind}" data-source="${encodedNodeAId}" data-target="${encodedNodeBId}"/>`));

    for (const markup of [html, svg]) {
      assert.doesNotMatch(markup, /<script>/);
      assert.doesNotMatch(markup, /\sonfocus="alert\(1\)"/);
    }
  });
}

test('projection fails closed on duplicate node identifiers', () => {
  const duplicate = { ...scene, nodes: [scene.nodes[0]!, { ...scene.nodes[1]!, id: scene.nodes[0]!.id }] };
  assert.throws(() => project(duplicate, 'three'), (error: unknown) => {
    assert.equal((error as Error).message, 'DUPLICATE_PROJECTION_NODE_ID:node:b');
    return true;
  });
});

test('projection fails closed on duplicate or invalid focus order', () => {
  const duplicate = { ...scene, nodes: scene.nodes.map((node) => ({ ...node, focusOrder: 1 })) };
  assert.throws(() => project(duplicate, 'html'), (error: unknown) => {
    assert.equal((error as Error).message, 'INVALID_PROJECTION_FOCUS_ORDER:node:a:1');
    return true;
  });
  const invalid = { ...scene, nodes: [{ ...scene.nodes[0]!, focusOrder: 0 }, scene.nodes[1]!] };
  assert.throws(() => project(invalid, 'svg'), (error: unknown) => {
    assert.equal((error as Error).message, 'INVALID_PROJECTION_FOCUS_ORDER:node:b:0');
    return true;
  });
});
