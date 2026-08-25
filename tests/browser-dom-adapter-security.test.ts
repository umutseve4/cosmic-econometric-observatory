import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneIR } from '../src/index.js';
import { createBrowserDomPort, project, renderProjection } from '../src/index.js';

const H = 'http://www.w3.org/1999/xhtml';
type N = E | T;
class T { readonly nodeType = 3; constructor(readonly textContent: string) {} }
class E {
  readonly nodeType = 1;
  readonly childNodes: N[];
  private readonly attributes: Map<string, string>;
  constructor(readonly localName: string, readonly namespaceURI: string, attributes: Record<string, string> = {}, children: N[] = []) {
    this.attributes = new Map(Object.entries(attributes));
    this.childNodes = children;
  }
  getAttributeNames(): string[] { return [...this.attributes.keys()]; }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
}
function e(name: string, attributes: Record<string, string> = {}, children: N[] = []): E { return new E(name, H, attributes, children); }
function fakeDocument(roots: N[]): Document {
  return { createElement() {
    const template = new E('template', H) as E & { content: { childNodes: N[] }; innerHTML: string };
    template.content = { childNodes: roots };
    template.innerHTML = '';
    return template;
  } } as unknown as Document;
}

const scene: SceneIR = {
  schemaVersion: '0.1.0', layoutVersion: 'security-v1', seed: 'security', inputHash: `sha256:${'d'.repeat(64)}`,
  nodes: [{ id: 'node:a', semanticKind: 'course', label: 'A', position: { x: 0, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect'] }],
  edges: []
};

function rootsWithNestedHostileElement(): N[] {
  return [
    e('nav', { 'aria-label': 'Academic knowledge universe' }, [e('ol', {}, [e('li', {}, [e('a', { href: '#node:a', 'data-node-id': 'node:a' }, [new T('A')])])])]),
    e('main', { 'aria-label': 'Knowledge node details' }, [e('article', { id: 'node:a', tabindex: '-1', 'data-node-id': 'node:a', 'data-semantic-kind': 'course' }, [
      e('h2', {}, [e('img', { src: 'x', onerror: 'steal()' })]), e('p', {}, [new T('course')])
    ])]),
    e('section', { 'aria-label': 'Relations' }, [e('ul')])
  ];
}

test('recursively rejects nested active HTML descendants before target mutation', () => {
  let calls = 0;
  const manifest = project(scene, 'html');
  const port = createBrowserDomPort(fakeDocument(rootsWithNestedHostileElement()));
  assert.throws(() => renderProjection(manifest, { replaceChildren() { calls += 1; } }, { dom: port }), (error: unknown) => {
    assert.equal((error as Error).message, 'BROWSER_RENDER_INVALID_CONTENT:html:prepare-failed');
    assert.equal(((error as Error).cause as Error).message, 'BROWSER_DOM_INVALID_CONTENT:html:element');
    return true;
  });
  assert.equal(calls, 0);
});
