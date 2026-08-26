import * as THREE from 'three';
import { createBrowserDomPort } from './modules/browser-dom-adapter.js';
import { renderProjection } from './modules/browser-renderer.js';
import { renderThreeWithFallback } from './modules/browser-fallback-orchestrator.js';
import { createBrowserThreePort } from './modules/browser-three-adapter.js';
import { bindNodeSelectionSurface, createNodeSelectionController } from './modules/browser-node-selection.js';
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
  const dom = createBrowserDomPort(document);
  const htmlTarget = document.querySelector('#html-universe');
  const visualTarget = document.querySelector('#webgl-universe');
  const htmlReceipt = renderProjection(project(scene, 'html'), htmlTarget, { dom });
  const visualReceipt = renderThreeWithFallback(
    project(scene, 'three'), project(scene, 'svg'), visualTarget,
    { dom, three: createBrowserThreePort(document, THREE) }
  );
  const canvas = visualTarget.querySelector('canvas');
  const svg = visualTarget.querySelector('svg');
  const visualReady = visualReceipt.outcome === 'three' ? canvas?.dataset.frame === 'rendered' : svg !== null;
  if (htmlReceipt.nodeIds.length !== 5 || htmlReceipt.edgeIds.length !== 4 || visualReceipt.render.nodeIds.length !== 5 || visualReceipt.render.edgeIds.length !== 4 || !visualReady) throw new Error('artifact semantic parity');
  visualTarget.dataset.renderMode = visualReceipt.outcome;

  const bindings = [];
  let logicalCommits = 0;
  const controller = createNodeSelectionController({
    snapshotId: scene.inputHash,
    nodeIds: htmlReceipt.focusOrderNodeIds,
    commit(transition) {
      for (const binding of bindings) binding.apply(transition.current);
      logicalCommits += 1;
    }
  });
  bindings.push(bindNodeSelectionSurface({
    root: htmlTarget, projection: 'html', snapshotId: scene.inputHash,
    focusOrderNodeIds: htmlReceipt.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState()
  }));
  if (visualReceipt.outcome === 'fallback') {
    bindings.push(bindNodeSelectionSurface({
      root: visualTarget, projection: 'svg', snapshotId: scene.inputHash,
      focusOrderNodeIds: visualReceipt.render.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState()
    }));
  } else if (canvas?.getAttribute('aria-hidden') !== 'true') {
    throw new Error('three canvas accessibility boundary');
  }

  if (new URLSearchParams(location.search).get('smoke') === 'm3i') {
    runM3iSmoke({ htmlTarget, visualTarget, visualReceipt, controller, commitCount: () => logicalCommits });
    result.textContent = 'M3I_SITE_SMOKE_PASS';
  } else {
    result.textContent = 'M3G_SITE_SMOKE_PASS';
  }
} catch (error) {
  const prefix = new URLSearchParams(location.search).get('smoke') === 'm3i' ? 'M3I_SITE_SMOKE_FAIL' : 'M3G_SITE_SMOKE_FAIL';
  result.textContent = `${prefix}:${error instanceof Error ? error.message : String(error)}`;
}

function runM3iSmoke({ htmlTarget, visualTarget, visualReceipt, controller, commitCount }) {
  const firstHtmlTarget = htmlTarget.querySelector('nav a[data-node-id]');
  const expectedNodeId = firstHtmlTarget?.getAttribute('data-node-id');
  if (!firstHtmlTarget || !expectedNodeId) throw new Error('missing HTML selection target');
  firstHtmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  if (controller.getState().selectedNodeId !== expectedNodeId || commitCount() !== 1 || firstHtmlTarget.getAttribute('aria-current') !== 'true') throw new Error('HTML Enter selection');
  firstHtmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, repeat: true }));
  if (commitCount() !== 1) throw new Error('repeat key committed');
  const forged = document.createElement('a');
  forged.href = '#forged'; forged.dataset.nodeId = expectedNodeId; firstHtmlTarget.parentElement.append(forged);
  forged.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  forged.remove();
  if (commitCount() !== 1) throw new Error('forged target committed');
  htmlTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  if (controller.getState().selectedNodeId !== null || commitCount() !== 2) throw new Error('HTML Escape clear');

  if (visualReceipt.outcome === 'fallback') {
    const firstSvgTarget = visualTarget.querySelector('svg g[role="listitem"][data-node-id]');
    if (!firstSvgTarget || firstSvgTarget.getAttribute('data-node-id') !== expectedNodeId) throw new Error('SVG focus parity');
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    firstSvgTarget.dispatchEvent(space);
    if (!space.defaultPrevented || controller.getState().selectedNodeId !== expectedNodeId || commitCount() !== 3 || firstSvgTarget.getAttribute('aria-current') !== 'true') throw new Error('SVG Space selection');
    visualTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    if (controller.getState().selectedNodeId !== null || commitCount() !== 4) throw new Error('SVG Escape clear');
  } else {
    const canvas = visualTarget.querySelector('canvas');
    if (canvas?.getAttribute('aria-hidden') !== 'true' || canvas.hasAttribute('data-selected') || canvas.hasAttribute('aria-current')) throw new Error('Three selection isolation');
  }
}
