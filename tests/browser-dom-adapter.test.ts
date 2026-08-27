import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectionManifestV2, SceneIR } from '../src/index.js';
import { createBrowserDomPort, project, renderProjection } from '../src/index.js';

const H = 'http://www.w3.org/1999/xhtml';
const S = 'http://www.w3.org/2000/svg';

type FakeNode = FakeElement | FakeText;
class FakeText {
  readonly nodeType = 3;
  constructor(readonly textContent: string) {}
}
class FakeElement {
  readonly nodeType = 1;
  readonly childNodes: FakeNode[];
  private readonly values: Map<string, string>;
  constructor(readonly localName: string, readonly namespaceURI: string, attributes: Record<string, string> = {}, children: FakeNode[] = []) {
    this.values = new Map(Object.entries(attributes));
    this.childNodes = children;
  }
  getAttributeNames(): string[] { return [...this.values.keys()]; }
  getAttribute(name: string): string | null { return this.values.get(name) ?? null; }
}
class FakeFragment { constructor(readonly childNodes: FakeNode[]) {} }
class FakeTemplate extends FakeElement {
  private value = '';
  constructor(readonly content: FakeFragment) { super('template', H); }
  set innerHTML(value: string) { this.value = value; }
  get innerHTML(): string { return this.value; }
}
function fakeDocument(roots: FakeNode[]): Document {
  return { createElement(name: string) {
    assert.equal(name, 'template');
    return new FakeTemplate(new FakeFragment(roots));
  } } as unknown as Document;
}
function e(name: string, ns: string, attributes: Record<string, string> = {}, children: FakeNode[] = []): FakeElement {
  return new FakeElement(name, ns, attributes, children);
}
function t(value: string): FakeText { return new FakeText(value); }

function htmlRoots(): FakeNode[] {
  const nav = e('nav', H, { 'aria-label': 'Academic knowledge universe' }, [e('ol', H, {}, [
    e('li', H, {}, [e('a', H, { href: '#node:a', 'data-node-id': 'node:a' }, [t('A')])]),
    e('li', H, {}, [e('a', H, { href: '#node:b', 'data-node-id': 'node:b' }, [t('B')])])
  ])]);
  const main = e('main', H, { 'aria-label': 'Knowledge node details' }, [
    e('article', H, { id: 'node:a', tabindex: '-1', 'data-node-id': 'node:a', 'data-semantic-kind': 'program' }, [e('h2', H, {}, [t('A')]), e('p', H, {}, [t('program')])]),
    e('article', H, { id: 'node:b', tabindex: '-1', 'data-node-id': 'node:b', 'data-semantic-kind': 'course' }, [e('h2', H, {}, [t('B')]), e('p', H, {}, [t('course')])])
  ]);
  const section = e('section', H, { 'aria-label': 'Relations' }, [e('ul', H, {}, [
    e('li', H, { 'data-edge-id': 'edge:a-b', 'data-semantic-kind': 'CONTAINS' }, [e('a', H, { href: '#node:a' }, [t('node:a')]), t(' → '), e('a', H, { href: '#node:b' }, [t('node:b')])])
  ])]);
  return [nav, main, section];
}
function svgRoots(): FakeNode[] {
  return [e('svg', S, { role: 'group', 'aria-label': 'Academic knowledge universe', viewBox: '-1 -1 5 5', preserveAspectRatio: 'xMidYMid meet' }, [
    e('g', S, { role: 'group', 'aria-label': 'Knowledge relations' }, [
      e('path', S, { 'data-edge-id': 'edge:a-b', 'data-semantic-kind': 'CONTAINS', 'data-source': 'node:a', 'data-target': 'node:b', d: 'M 1 1 L 2 2', fill: 'none', stroke: '#8ca2ff', 'stroke-width': '0.08' })
    ]),
    e('g', S, { role: 'list', 'aria-label': 'Knowledge nodes' }, [
      e('g', S, { id: 'node:a', role: 'listitem', tabindex: '0', 'data-node-id': 'node:a', 'data-semantic-kind': 'program', 'aria-label': '1 of 2: A (program)' }, [e('circle', S, { cx: '1', cy: '1', r: '1', fill: '#55d9e7' }), e('title', S, {}, [t('A')])]),
      e('g', S, { id: 'node:b', role: 'listitem', tabindex: '0', 'data-node-id': 'node:b', 'data-semantic-kind': 'course', 'aria-label': '2 of 2: B (course)' }, [e('circle', S, { cx: '2', cy: '2', r: '1', fill: '#55d9e7' }), e('title', S, {}, [t('B')])])
    ])
  ])];
}
function svgGroupByRole(svg: FakeElement, role: 'list' | 'group'): FakeElement {
  const matches = svg.childNodes.filter((node): node is FakeElement => node instanceof FakeElement && node.localName === 'g' && node.getAttribute('role') === role);
  assert.equal(matches.length, 1);
  return matches[0]!;
}
function firstNodeCircle(roots: FakeNode[]): { node: FakeElement; circle: FakeElement } {
  const svg = roots[0] as FakeElement;
  const node = svgGroupByRole(svg, 'list').childNodes[0] as FakeElement;
  return { node, circle: node.childNodes[0] as FakeElement };
}

const scene: SceneIR = {
  schemaVersion: '0.1.0', layoutVersion: 'dom-adapter-v1', seed: 'dom-adapter', inputHash: `sha256:${'c'.repeat(64)}`,
  nodes: [
    { id: 'node:b', semanticKind: 'course', label: 'B', position: { x: 2, y: 0, z: 2 }, focusOrder: 2, capabilities: ['inspect'] },
    { id: 'node:a', semanticKind: 'program', label: 'A', position: { x: 1, y: 0, z: 1 }, focusOrder: 1, capabilities: ['inspect'] }
  ],
  edges: [{ id: 'edge:a-b', semanticKind: 'CONTAINS', source: 'node:a', target: 'node:b' }]
};

for (const [kind, roots] of [['html', htmlRoots], ['svg', svgRoots]] as const) {
  test(`prepares and mounts concrete ${kind} DOM roots with exact metadata`, () => {
    const manifest = project(scene, kind);
    const port = createBrowserDomPort(fakeDocument(roots()));
    const calls: Node[][] = [];
    const receipt = renderProjection(manifest, { replaceChildren(...nodes) { calls.push(nodes); } }, { dom: port });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.length, kind === 'html' ? 3 : 1);
    assert.deepEqual(receipt.nodeIds, ['node:a', 'node:b']);
    assert.deepEqual(receipt.edgeIds, ['edge:a-b']);
    assert.deepEqual(receipt.focusOrderNodeIds, ['node:a', 'node:b']);
  });
}

test('accepts reversed SVG group order by resolving groups from roles', () => {
  const roots = svgRoots();
  const svg = roots[0] as FakeElement;
  svg.childNodes.reverse();
  const calls: Node[][] = [];
  const receipt = renderProjection(project(scene, 'svg'), { replaceChildren(...nodes) { calls.push(nodes); } }, { dom: createBrowserDomPort(fakeDocument(roots)) });
  assert.equal(calls.length, 1);
  assert.deepEqual(receipt.nodeIds, ['node:a', 'node:b']);
  assert.deepEqual(receipt.edgeIds, ['edge:a-b']);
});

test('rejects event attributes through the redacted preparation boundary without target mutation', () => {
  const roots = htmlRoots();
  const article = ((roots[1] as FakeElement).childNodes[0] as FakeElement);
  const hostile = e('article', H, { id: 'node:a', tabindex: '-1', 'data-node-id': 'node:a', 'data-semantic-kind': 'program', onclick: 'steal()' }, article.childNodes);
  (roots[1] as FakeElement).childNodes[0] = hostile;
  assertRedacted(project(scene, 'html'), roots, 'BROWSER_DOM_INVALID_CONTENT:html:attribute');
});

test('rejects external navigation links without target mutation', () => {
  const roots = htmlRoots();
  const ol = ((roots[0] as FakeElement).childNodes[0] as FakeElement);
  const li = ol.childNodes[0] as FakeElement;
  li.childNodes[0] = e('a', H, { href: 'https://example.com', 'data-node-id': 'node:a' }, [t('A')]);
  assertRedacted(project(scene, 'html'), roots, 'BROWSER_DOM_INVALID_CONTENT:html:href');
});

test('rejects dangling SVG endpoints without target mutation', () => {
  const roots = svgRoots();
  const svg = roots[0] as FakeElement;
  const edgeGroup = svgGroupByRole(svg, 'group');
  edgeGroup.childNodes[0] = e('path', S, { 'data-edge-id': 'edge:a-b', 'data-semantic-kind': 'CONTAINS', 'data-source': 'node:a', 'data-target': 'node:missing', d: 'M 1 1 L 2 2', fill: 'none', stroke: '#8ca2ff', 'stroke-width': '0.08' });
  assertRedacted(project(scene, 'svg'), roots, 'BROWSER_DOM_INVALID_CONTENT:svg:edge-endpoint');
});

test('rejects foreign namespaces without target mutation', () => {
  const roots = svgRoots();
  const svg = roots[0] as FakeElement;
  const nodeGroup = svgGroupByRole(svg, 'list');
  nodeGroup.childNodes.push(e('foreignObject', H));
  assertRedacted(project(scene, 'svg'), roots, 'BROWSER_DOM_INVALID_CONTENT:svg:namespace');
});

for (const [label, attributes] of [
  ['missing', { cx: '1', cy: '1', r: '1' }],
  ['wrong', { cx: '1', cy: '1', r: '1', fill: '#000000' }],
  ['extra', { cx: '1', cy: '1', r: '1', fill: '#55d9e7', stroke: '#8ca2ff' }]
] as const) {
  test(`rejects ${label} SVG node circle fill without target mutation`, () => {
    const roots = svgRoots();
    const { node, circle } = firstNodeCircle(roots);
    node.childNodes[0] = e('circle', S, attributes, circle.childNodes);
    assertRedacted(project(scene, 'svg'), roots, 'BROWSER_DOM_INVALID_CONTENT:svg:node-circle');
  });
}

function assertRedacted(manifest: ProjectionManifestV2, roots: FakeNode[], causeMessage: string): void {
  let calls = 0;
  const port = createBrowserDomPort(fakeDocument(roots));
  assert.throws(() => renderProjection(manifest, { replaceChildren() { calls += 1; } }, { dom: port }), (error: unknown) => {
    assert.equal((error as Error).message, `BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:prepare-failed`);
    assert.equal(((error as Error).cause as Error).message, causeMessage);
    return true;
  });
  assert.equal(calls, 0);
}
