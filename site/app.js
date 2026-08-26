import * as THREE from 'three';
import { createBrowserDomPort } from './modules/browser-dom-adapter.js';
import { renderProjection } from './modules/browser-renderer.js';
import { renderThreeWithFallback } from './modules/browser-fallback-orchestrator.js';
import { createBrowserThreePort } from './modules/browser-three-adapter.js';
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
  const htmlReceipt = renderProjection(project(scene, 'html'), document.querySelector('#html-universe'), { dom });
  const visualReceipt = renderThreeWithFallback(
    project(scene, 'three'), project(scene, 'svg'), document.querySelector('#webgl-universe'),
    { dom, three: createBrowserThreePort(document, THREE) }
  );
  const canvas = document.querySelector('#webgl-universe canvas');
  const svg = document.querySelector('#webgl-universe svg');
  const visualReady = visualReceipt.outcome === 'three' ? canvas?.dataset.frame === 'rendered' : svg !== null;
  if (htmlReceipt.nodeIds.length !== 5 || htmlReceipt.edgeIds.length !== 4 || visualReceipt.render.nodeIds.length !== 5 || visualReceipt.render.edgeIds.length !== 4 || !visualReady) throw new Error('artifact semantic parity');
  document.querySelector('#webgl-universe').dataset.renderMode = visualReceipt.outcome;
  result.textContent = 'M3G_SITE_SMOKE_PASS';
} catch (error) {
  result.textContent = `M3G_SITE_SMOKE_FAIL:${error instanceof Error ? error.message : String(error)}`;
}
