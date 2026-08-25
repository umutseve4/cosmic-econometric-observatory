import { compareCodePoints } from './canonical.js';
import type { BrowserDomPort, PreparedBrowserProjection } from './browser-renderer.js';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

type DomKind = 'html' | 'svg';

export function createBrowserDomPort(document: Document): BrowserDomPort<Node> {
  return {
    prepareHtml: (content) => prepare(document, content, 'html'),
    prepareSvg: (content) => prepare(document, content, 'svg')
  };
}

function prepare(document: Document, content: string, kind: DomKind): PreparedBrowserProjection<Node> {
  if (content.length === 0 || content.length > 2_000_000) fail(kind, 'content-size');
  const template = document.createElement('template');
  template.innerHTML = content;
  const roots = Array.from(template.content.childNodes);
  const metadata = kind === 'html' ? inspectHtml(roots) : inspectSvg(roots);
  return Object.freeze({
    roots: Object.freeze(roots),
    nodeIds: Object.freeze(metadata.nodeIds),
    edgeIds: Object.freeze(metadata.edgeIds),
    focusOrderNodeIds: Object.freeze(metadata.focusOrderNodeIds)
  });
}

interface Metadata {
  nodeIds: string[];
  edgeIds: string[];
  focusOrderNodeIds: string[];
}

function inspectHtml(nodes: readonly Node[]): Metadata {
  const roots = elements(nodes, 'html', false);
  if (roots.length !== 3 || names(roots) !== 'nav,main,section') fail('html', 'roots');
  const [nav, main, section] = roots as [Element, Element, Element];
  attrs(nav, 'html', ['aria-label']);
  attrs(main, 'html', ['aria-label']);
  attrs(section, 'html', ['aria-label']);

  const navChildren = elements(nav.childNodes, 'html', false);
  const mainChildren = elements(main.childNodes, 'html', false);
  const sectionChildren = elements(section.childNodes, 'html', false);
  if (navChildren.length !== 1 || navChildren[0]!.localName !== 'ol') fail('html', 'navigation');
  if (sectionChildren.length !== 1 || sectionChildren[0]!.localName !== 'ul') fail('html', 'relations');
  attrs(navChildren[0]!, 'html', []);
  attrs(sectionChildren[0]!, 'html', []);

  const focusOrderNodeIds: string[] = [];
  for (const item of elements(navChildren[0]!.childNodes, 'html', false)) {
    if (item.localName !== 'li') fail('html', 'navigation');
    attrs(item, 'html', []);
    const links = elements(item.childNodes, 'html', false);
    if (links.length !== 1 || links[0]!.localName !== 'a') fail('html', 'navigation');
    const link = links[0]!;
    attrs(link, 'html', ['href', 'data-node-id']);
    const id = identifier(link.getAttribute('data-node-id'), 'html', 'node-id');
    if (link.getAttribute('href') !== `#${id}`) fail('html', 'href');
    focusOrderNodeIds.push(id);
  }

  const nodeIdsUnsorted: string[] = [];
  for (const article of mainChildren) {
    if (article.localName !== 'article') fail('html', 'articles');
    attrs(article, 'html', ['id', 'tabindex', 'data-node-id', 'data-semantic-kind']);
    const id = identifier(article.getAttribute('data-node-id'), 'html', 'node-id');
    if (article.getAttribute('id') !== id || article.getAttribute('tabindex') !== '-1') fail('html', 'article-metadata');
    const details = elements(article.childNodes, 'html', false);
    if (details.length !== 2 || names(details) !== 'h2,p') fail('html', 'article-structure');
    attrs(details[0]!, 'html', []);
    attrs(details[1]!, 'html', []);
    nodeIdsUnsorted.push(id);
  }
  unique(nodeIdsUnsorted, 'html', 'node-id');
  unique(focusOrderNodeIds, 'html', 'focus-order');
  const nodeIds = [...nodeIdsUnsorted].sort(compareCodePoints);
  if (!sameSet(nodeIds, focusOrderNodeIds)) fail('html', 'node-set');

  const edgeIdsUnsorted: string[] = [];
  for (const item of elements(sectionChildren[0]!.childNodes, 'html', true)) {
    if (item.localName !== 'li') fail('html', 'relations');
    attrs(item, 'html', ['data-edge-id', 'data-semantic-kind']);
    const edgeId = identifier(item.getAttribute('data-edge-id'), 'html', 'edge-id');
    const links = elements(item.childNodes, 'html', true);
    if (links.length !== 2 || links.some((link) => link.localName !== 'a')) fail('html', 'relation-shape');
    for (const link of links) {
      attrs(link, 'html', ['href']);
      const href = link.getAttribute('href');
      if (href === null || !href.startsWith('#') || !nodeIds.includes(href.slice(1))) fail('html', 'relation-target');
    }
    edgeIdsUnsorted.push(edgeId);
  }
  unique(edgeIdsUnsorted, 'html', 'edge-id');
  return { nodeIds, edgeIds: edgeIdsUnsorted.sort(compareCodePoints), focusOrderNodeIds };
}

function inspectSvg(nodes: readonly Node[]): Metadata {
  const roots = elements(nodes, 'svg', false);
  if (roots.length !== 1 || roots[0]!.localName !== 'svg') fail('svg', 'roots');
  const svg = roots[0]!;
  attrs(svg, 'svg', ['role', 'aria-label']);
  const groups = elements(svg.childNodes, 'svg', false);
  if (groups.length !== 2 || groups.some((group) => group.localName !== 'g')) fail('svg', 'groups');
  const [nodeGroup, edgeGroup] = groups as [Element, Element];
  attrs(nodeGroup, 'svg', ['role', 'aria-label']);
  attrs(edgeGroup, 'svg', ['role', 'aria-label']);
  if (nodeGroup.getAttribute('role') !== 'list' || edgeGroup.getAttribute('role') !== 'group') fail('svg', 'groups');

  const focusOrderNodeIds: string[] = [];
  for (const node of elements(nodeGroup.childNodes, 'svg', false)) {
    if (node.localName !== 'g') fail('svg', 'nodes');
    attrs(node, 'svg', ['id', 'role', 'tabindex', 'data-node-id', 'data-semantic-kind', 'aria-label']);
    const id = identifier(node.getAttribute('data-node-id'), 'svg', 'node-id');
    if (node.getAttribute('id') !== id || node.getAttribute('role') !== 'listitem' || node.getAttribute('tabindex') !== '0') fail('svg', 'node-metadata');
    const children = elements(node.childNodes, 'svg', false);
    if (children.length !== 2 || names(children) !== 'circle,title') fail('svg', 'node-structure');
    attrs(children[0]!, 'svg', ['cx', 'cy', 'r']);
    attrs(children[1]!, 'svg', []);
    focusOrderNodeIds.push(id);
  }
  unique(focusOrderNodeIds, 'svg', 'node-id');
  const nodeIds = [...focusOrderNodeIds].sort(compareCodePoints);

  const edgeIdsUnsorted: string[] = [];
  for (const edge of elements(edgeGroup.childNodes, 'svg', false)) {
    if (edge.localName !== 'path') fail('svg', 'edges');
    attrs(edge, 'svg', ['data-edge-id', 'data-semantic-kind', 'data-source', 'data-target']);
    const edgeId = identifier(edge.getAttribute('data-edge-id'), 'svg', 'edge-id');
    const source = identifier(edge.getAttribute('data-source'), 'svg', 'edge-source');
    const target = identifier(edge.getAttribute('data-target'), 'svg', 'edge-target');
    if (!nodeIds.includes(source) || !nodeIds.includes(target)) fail('svg', 'edge-endpoint');
    edgeIdsUnsorted.push(edgeId);
  }
  unique(edgeIdsUnsorted, 'svg', 'edge-id');
  return { nodeIds, edgeIds: edgeIdsUnsorted.sort(compareCodePoints), focusOrderNodeIds };
}

function elements(nodes: ArrayLike<Node>, kind: DomKind, allowText: boolean): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 1) {
      const element = node as Element;
      const expectedNamespace = kind === 'html' ? HTML_NS : SVG_NS;
      if (element.namespaceURI !== expectedNamespace) fail(kind, 'namespace');
      result.push(element);
    } else if (node.nodeType === 3) {
      if (!allowText && (node.textContent ?? '').trim() !== '') fail(kind, 'text');
    } else {
      fail(kind, 'node-type');
    }
  }
  return result;
}

function attrs(element: Element, kind: DomKind, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const rawName of element.getAttributeNames()) {
    const name = rawName.toLowerCase();
    if (name.startsWith('on') || name === 'style' || !allowedSet.has(name)) fail(kind, 'attribute');
  }
  if (element.getAttributeNames().length !== allowed.length || allowed.some((name) => element.getAttribute(name) === null)) {
    fail(kind, 'attribute');
  }
}

function identifier(value: string | null, kind: DomKind, reason: string): string {
  if (value === null || value.length === 0 || /[\u0000-\u0020#\u007f]/u.test(value)) fail(kind, reason);
  return value;
}

function unique(values: readonly string[], kind: DomKind, reason: string): void {
  if (new Set(values).size !== values.length) fail(kind, reason);
}

function sameSet(sorted: readonly string[], values: readonly string[]): boolean {
  return sorted.length === values.length && sorted.every((value, index) => value === [...values].sort(compareCodePoints)[index]);
}

function names(values: readonly Element[]): string {
  return values.map((value) => value.localName).join(',');
}

function fail(kind: DomKind, reason: string): never {
  throw new Error(`BROWSER_DOM_INVALID_CONTENT:${kind}:${reason}`);
}
