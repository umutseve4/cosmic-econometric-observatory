import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSourceAttributes } from '../src/browser-dom-source-validator.js';

test('source validator rejects exact duplicate attributes before DOM parsing', () => {
  assert.throws(
    () => validateSourceAttributes('<article id="a" id="b"></article>', 'html'),
    { message: 'BROWSER_DOM_INVALID_CONTENT:html:attribute' }
  );
});

test('source validator rejects ASCII-case-variant duplicate SVG attributes', () => {
  assert.throws(
    () => validateSourceAttributes('<svg viewBox="0 0 1 1" VIEWBOX="0 0 2 2"></svg>', 'svg'),
    { message: 'BROWSER_DOM_INVALID_CONTENT:svg:attribute' }
  );
});

test('source validator accepts canonical SVG attributes and quoted greater-than values', () => {
  assert.doesNotThrow(() => validateSourceAttributes(
    '<svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" aria-label=">"><path d="M 0 0 L 1 1"/></svg>',
    'svg'
  ));
});

test('source validator fails closed on unterminated quoted attributes and tags', () => {
  assert.throws(() => validateSourceAttributes('<article id="unterminated></article>', 'html'));
  assert.throws(() => validateSourceAttributes('<svg viewBox="0 0 1 1"', 'svg'));
});
