import * as THREE from 'three';
import { createBrowserDomPort } from './modules/browser-dom-adapter.js';
import { renderProjection } from './modules/browser-renderer.js';
import { renderThreeWithFallback } from './modules/browser-fallback-orchestrator.js';
import { createBrowserThreePort } from './modules/browser-three-adapter.js';
import { applyNodeSelectionTransition, bindNodeSelectionSurface, createNodeSelectionController } from './modules/browser-node-selection.js';
import { project } from './modules/projections.js';

const scene = {
  schemaVersion: '0.1.0', layoutVersion: 'artifact-radial-v1', seed: 'm3g-static-artifact', inputHash: `sha256:${'c'.repeat(64)}`,
  nodes: [
    { id: 'institution:buu', semanticKind: 'institution', label: 'Bursa Uludağ University', position: { x: 0, y: 0, z: 0 }, focusOrder: 1, capabilities: ['inspect', 'navigate'] },
    { id: 'program:econometrics', semanticKind: 'program', label: 'Econometrics', position: { x: -1.8, y: 0.2, z: 0.4 }, focusOrder: 2, capabilities: ['inspect', 'navigate'] },
    { id: 'curriculum:2025-2026', semanticKind: 'curriculum', label: '2025–2026 Curriculum', position: { x: 1.7, y: -0.1, z: 0.5 }, focusOrder: 3, capabilities: ['inspect', 'navigate'] },
    { id: 'course:econometrics', semanticKind: 'course', label: 'Econometrics', position: { x: -0.7, y: 1.5, z: -0.3 }, focusOrder: 4, capabilities: ['inspect', 'navigate'] },
    { id: 'source:snapshot', semanticKind: 'source', label: 'Content-addressed snapshot', position: { x: 0.9, y: -1.4, z: -0.2 }, focusOrder: 5, capabilities: ['inspect', 'navigate'] }
  ],
  edges: [
    { id: 'edge:institution-program', semanticKind: 'CONTAINS', source: 'institution:buu', target: 'program:econometrics' },
    { id: 'edge:program-curriculum', semanticKind: 'PUBLISHES', source: 'program:econometrics', target: 'curriculum:2025-2026' },
    { id: 'edge:curriculum-course', semanticKind: 'INCLUDES', source: 'curriculum:2025-2026', target: 'course:econometrics' },
    { id: 'edge:source-curriculum', semanticKind: 'SUPPORTS', source: 'source:snapshot', target: 'curriculum:2025-2026' }
  ]
};
const result = document.querySelector('#result');
try {
  const query = new URLSearchParams(location.search); const selectionSmoke = query.get('smoke') === 'm3i'; const forceFallback = query.get('force-fallback') === 'true';
  const dom = createBrowserDomPort(document); const htmlTarget = document.querySelector('#html-universe'); const visualTarget = document.querySelector('#webgl-universe');
  const htmlReceipt = renderProjection(project(scene, 'html'), htmlTarget, { dom });
  const threePort = forceFallback ? Object.freeze({ prepareThree() { throw new Error('M3I_FORCED_THREE_PREPARATION_FAILURE'); } }) : createBrowserThreePort(document, THREE);
  const visualReceipt = renderThreeWithFallback(project(scene, 'three'), project(scene, 'svg'), visualTarget, { dom, three: threePort });
  if (forceFallback && (visualReceipt.outcome !== 'fallback' || visualReceipt.fallbackProjection !== 'svg' || visualReceipt.primaryFailure !== 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed' || visualReceipt.render.projection !== 'svg')) throw new Error('forced fallback provenance');
  if (selectionSmoke && !forceFallback && (visualReceipt.outcome !== 'three' || visualReceipt.fallbackProjection !== null || visualReceipt.primaryFailure !== null || visualReceipt.render.projection !== 'three')) throw new Error('selection Three provenance');
  const canvas = visualTarget.querySelector('canvas'); const svg = visualTarget.querySelector('svg');
  const visualReady = visualReceipt.outcome === 'three' ? canvas?.dataset.frame === 'rendered' : svg !== null;
  if (htmlReceipt.nodeIds.length !== 5 || htmlReceipt.edgeIds.length !== 4 || visualReceipt.render.nodeIds.length !== 5 || visualReceipt.render.edgeIds.length !== 4 || !visualReady) throw new Error('artifact semantic parity');
  visualTarget.dataset.renderMode = visualReceipt.outcome;
  if (selectionSmoke) runInvalidBindingPreflightSmoke(htmlTarget, htmlReceipt, scene.inputHash);
  const bindings = []; let logicalCommits = 0;
  const controller = createNodeSelectionController({ snapshotId: scene.inputHash, nodeIds: htmlReceipt.focusOrderNodeIds, commit(transition) { applyNodeSelectionTransition(bindings, transition); logicalCommits += 1; } });
  bindings.push(bindNodeSelectionSurface({ root: htmlTarget, projection: 'html', snapshotId: scene.inputHash, focusOrderNodeIds: htmlReceipt.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState() }));
  if (visualReceipt.outcome === 'fallback') bindings.push(bindNodeSelectionSurface({ root: visualTarget, projection: 'svg', snapshotId: scene.inputHash, focusOrderNodeIds: visualReceipt.render.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState() }));
  else if (canvas?.getAttribute('aria-hidden') !== 'true') throw new Error('three canvas accessibility boundary');
  if (selectionSmoke) { runM3iSmoke({ htmlTarget, visualTarget, visualReceipt, controller, commitCount: () => logicalCommits }); result.textContent = 'M3I_SITE_SMOKE_PASS'; }
  else result.textContent = 'M3G_SITE_SMOKE_PASS';
} catch (error) {
  const prefix = new URLSearchParams(location.search).get('smoke') === 'm3i' ? 'M3I_SITE_SMOKE_FAIL' : 'M3G_SITE_SMOKE_FAIL'; result.textContent = `${prefix}:${error instanceof Error ? error.message : String(error)}`;
}

function runInvalidBindingPreflightSmoke(htmlTarget, htmlReceipt, snapshotId) {
  const first = htmlTarget.querySelector('nav a[data-node-id]'); const parent = first?.parentElement; if (!first || !parent) throw new Error('missing preflight target');
  const duplicate = first.cloneNode(true); parent.append(duplicate); let dispatches = 0; let rejected = false;
  try { bindNodeSelectionSurface({ root: htmlTarget, projection: 'html', snapshotId, focusOrderNodeIds: htmlReceipt.focusOrderNodeIds, dispatch() { dispatches += 1; return { outcome: 'noop', state: { selectedNodeId: null }, logicalCommitCount: 0 }; }, initialState: { selectedNodeId: null } }); }
  catch (error) { rejected = error instanceof Error && error.message === 'NODE_SELECTION_DUPLICATE_TARGET'; }
  duplicate.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); duplicate.remove();
  if (!rejected || dispatches !== 0 || htmlTarget.querySelector('[data-selected]')) throw new Error('binding preflight mutation');
}
function captureAttributeMatrix(roots) { return roots.flatMap((root, rootIndex) => [...root.querySelectorAll('[data-node-id]')].map((target, targetIndex) => [rootIndex, targetIndex, target.getAttribute('data-node-id'), target.getAttribute('data-selected'), target.getAttribute('aria-current')])); }
function sameMatrix(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function capturePosition(target) { const parent = target.parentNode; const next = target.nextSibling; if (!parent) throw new Error('missing target parent'); return () => parent.insertBefore(target, next); }

function runM3iSmoke({ htmlTarget, visualTarget, visualReceipt, controller, commitCount }) {
  const htmlTargets = [...htmlTarget.querySelectorAll('nav a[data-node-id]')]; const firstHtmlTarget = htmlTargets[0]; const secondHtmlTarget = htmlTargets[1];
  const expectedNodeId = firstHtmlTarget?.getAttribute('data-node-id'); const alternateNodeId = secondHtmlTarget?.getAttribute('data-node-id');
  if (!firstHtmlTarget || !secondHtmlTarget || !expectedNodeId || !alternateNodeId) throw new Error('missing HTML selection targets');
  const expectRejectedWithoutCommit = (surfaceRoot, mutate, restore, label) => {
    const htmlBefore = htmlTarget.innerHTML; const visualBefore = visualTarget.innerHTML; const attributesBefore = captureAttributeMatrix([htmlTarget, visualTarget]);
    mutate();
    if (htmlTarget.innerHTML === htmlBefore && visualTarget.innerHTML === visualBefore) { restore(); throw new Error(`adversarial stimulus no-op:${label}`); }
    let rejected = false;
    try { controller.dispatch({ type: 'select', nodeId: alternateNodeId, expectedSnapshotId: scene.inputHash }); }
    catch (error) { rejected = error instanceof Error && (error.message === 'NODE_SELECTION_TARGET_SET_CHANGED' || error.message === 'NODE_SELECTION_STALE_TARGET_ID'); }
    restore();
    const domRestored = htmlTarget.innerHTML === htmlBefore && visualTarget.innerHTML === visualBefore;
    if (!rejected || controller.getState().selectedNodeId !== null || commitCount() !== 0 || !domRestored || !sameMatrix(attributesBefore, captureAttributeMatrix([htmlTarget, visualTarget])) || surfaceRoot.querySelector('[data-selected]')) throw new Error(`dynamic target gate:${label}`);
  };
  const exerciseSurface = (root, selector, label, membership) => {
    const targets = [...root.querySelectorAll(selector)]; const first = targets[0]; const second = targets[1]; if (!first || !second || !first.parentNode || !second.parentNode) throw new Error(`missing ${label} targets`);
    const clone = first.cloneNode(true); expectRejectedWithoutCommit(root, () => first.parentNode.insertBefore(clone, first.nextSibling), () => clone.remove(), `${label}:insert`);
    const restoreRemoval = capturePosition(first); expectRejectedWithoutCommit(root, () => first.remove(), restoreRemoval, `${label}:remove`);
    const restoreReorder = capturePosition(first); expectRejectedWithoutCommit(root, () => second.parentNode.insertBefore(second, first), restoreReorder, `${label}:reorder`);
    const restoreMembership = membership(first); expectRejectedWithoutCommit(root, restoreMembership.mutate, restoreMembership.restore, `${label}:selector-membership`);
    const originalId = second.getAttribute('data-node-id'); if (originalId === null) throw new Error(`missing ${label} ID`);
    expectRejectedWithoutCommit(root, () => second.setAttribute('data-node-id', 'node:tampered'), () => second.setAttribute('data-node-id', originalId), `${label}:id`);
  };
  exerciseSurface(htmlTarget, 'nav a[data-node-id]', 'html', (target) => { const restore = capturePosition(target); const nav = target.closest('nav'); const parent = nav?.parentNode; if (!nav || !parent) throw new Error('missing HTML nav'); return { mutate: () => parent.insertBefore(target, nav), restore }; });
  if (visualReceipt.outcome === 'fallback') exerciseSurface(visualTarget, 'svg g[role="listitem"][data-node-id]', 'svg', (target) => ({ mutate: () => target.removeAttribute('role'), restore: () => target.setAttribute('role', 'listitem') }));

  firstHtmlTarget.focus(); if (document.activeElement !== firstHtmlTarget) throw new Error('HTML focus target');
  firstHtmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  if (controller.getState().selectedNodeId !== expectedNodeId || commitCount() !== 1 || firstHtmlTarget.getAttribute('aria-current') !== 'true') throw new Error('HTML Enter selection');
  if (visualReceipt.outcome === 'fallback') {
    const svgTargets = [...visualTarget.querySelectorAll('svg g[role="listitem"][data-node-id]')]; const firstSvgTarget = svgTargets[0]; const secondSvgTarget = svgTargets[1]; const secondNodeId = secondSvgTarget?.getAttribute('data-node-id');
    if (!firstSvgTarget || !secondSvgTarget || !secondNodeId) throw new Error('missing SVG rollback targets');
    secondHtmlTarget.setAttribute('data-selected', 'legacy-html-selected'); secondHtmlTarget.setAttribute('aria-current', 'legacy-html-current'); secondSvgTarget.setAttribute('data-selected', 'legacy-svg-selected'); secondSvgTarget.setAttribute('aria-current', 'legacy-svg-current');
    const beforeRollback = captureAttributeMatrix([htmlTarget, visualTarget]); const originalSetAttribute = secondSvgTarget.setAttribute.bind(secondSvgTarget); let injected = false;
    secondSvgTarget.setAttribute = (name, value) => { if (!injected && name === 'data-selected') { injected = true; throw new Error('M3I_INJECTED_SVG_APPLY_FAILURE'); } originalSetAttribute(name, value); };
    let applyRejected = false;
    try { controller.dispatch({ type: 'select', nodeId: secondNodeId, expectedSnapshotId: scene.inputHash }); } catch (error) { applyRejected = error instanceof Error && error.message === 'M3I_INJECTED_SVG_APPLY_FAILURE'; }
    secondSvgTarget.setAttribute = originalSetAttribute;
    if (!applyRejected || controller.getState().selectedNodeId !== expectedNodeId || commitCount() !== 1 || !sameMatrix(beforeRollback, captureAttributeMatrix([htmlTarget, visualTarget]))) throw new Error('cross-surface exact rollback');
    secondHtmlTarget.removeAttribute('data-selected'); secondHtmlTarget.removeAttribute('aria-current'); secondSvgTarget.removeAttribute('data-selected'); secondSvgTarget.removeAttribute('aria-current');
  }
  firstHtmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, repeat: true })); if (commitCount() !== 1) throw new Error('repeat key committed');
  const forged = document.createElement('a'); forged.href = '#forged'; forged.dataset.nodeId = expectedNodeId; firstHtmlTarget.parentElement.append(forged); forged.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); forged.remove(); if (commitCount() !== 1) throw new Error('forged target committed');
  htmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); if (controller.getState().selectedNodeId !== null || commitCount() !== 2) throw new Error('HTML Escape clear');
  if (visualReceipt.outcome === 'fallback') {
    const firstSvgTarget = visualTarget.querySelector('svg g[role="listitem"][data-node-id]'); if (!firstSvgTarget || firstSvgTarget.getAttribute('data-node-id') !== expectedNodeId) throw new Error('SVG focus parity');
    firstSvgTarget.focus(); if (document.activeElement !== firstSvgTarget) throw new Error('SVG focus target');
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }); firstSvgTarget.dispatchEvent(space);
    if (!space.defaultPrevented || controller.getState().selectedNodeId !== expectedNodeId || commitCount() !== 3 || firstSvgTarget.getAttribute('aria-current') !== 'true' || firstHtmlTarget.getAttribute('aria-current') !== 'true') throw new Error('SVG Space selection');
    visualTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); if (controller.getState().selectedNodeId !== null || commitCount() !== 4) throw new Error('SVG Escape clear');
  } else { const canvas = visualTarget.querySelector('canvas'); if (canvas?.getAttribute('aria-hidden') !== 'true' || canvas.hasAttribute('data-selected') || canvas.hasAttribute('aria-current')) throw new Error('Three selection isolation'); }
}
