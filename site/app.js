import * as THREE from 'three';
import { createBrowserDomPort } from './modules/browser-dom-adapter.js';
import { renderProjection } from './modules/browser-renderer.js';
import { renderThreeWithFallback } from './modules/browser-fallback-orchestrator.js';
import { createBrowserThreePort } from './modules/browser-three-adapter.js';
import { createManagedThreeRuntime } from './modules/three-runtime.js';
import { deriveThreeSelectionStyling, summarizeThreeSelectionStyling } from './modules/three-selection-projection.js';
import { deriveFocusBounds, deriveFocusCamera, summarizeFocusTarget } from './modules/three-focus-target.js';
import { applyNodeSelectionTransition, bindNodeSelectionSurface, createNodeSelectionController } from './modules/browser-node-selection.js';
import { deriveDirectRelations } from './modules/direct-relations.js';
import { project } from './modules/projections.js';

const result = document.querySelector('#result');
try {
  const artifact = await loadArtifact();
  const scene = artifact.scene;
  const query = new URLSearchParams(location.search);
  const selectionSmoke = query.get('smoke') === 'm3i';
  const forceFallback = query.get('force-fallback') === 'true';
  const dom = createBrowserDomPort(document);
  const htmlTarget = required('#html-universe');
  const visualTarget = required('#webgl-universe');
  const htmlReceipt = renderProjection(project(scene, 'html'), htmlTarget, { dom });
  let threeRuntime = null;
  let threeHandle = null;
  const threePort = forceFallback
    ? Object.freeze({ prepareThree() { throw new Error('M3I_FORCED_THREE_PREPARATION_FAILURE'); } })
    : createBrowserThreePort(document, THREE, {
        onRuntimeReady(handle) {
          try {
            threeRuntime = createManagedThreeRuntime(handle, createViewportEnvironment(visualTarget));
            threeHandle = handle;
          } catch {
            threeRuntime = null;
            threeHandle = null;
            handle.dispose();
          }
        }
      });
  const visualReceipt = renderThreeWithFallback(project(scene, 'three'), project(scene, 'svg'), visualTarget, { dom, three: threePort });
  if (forceFallback && (visualReceipt.outcome !== 'fallback' || visualReceipt.fallbackProjection !== 'svg' || visualReceipt.primaryFailure !== 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed')) throw new Error('forced fallback provenance');
  const visualReady = visualReceipt.outcome === 'three' ? visualTarget.querySelector('canvas')?.dataset.frame === 'rendered' : visualTarget.querySelector('svg') !== null;
  if (htmlReceipt.nodeIds.length !== 147 || htmlReceipt.edgeIds.length !== 146 || visualReceipt.render.nodeIds.length !== 147 || visualReceipt.render.edgeIds.length !== 146 || !visualReady) throw new Error('artifact semantic parity');
  if (!sameSet(htmlReceipt.nodeIds, visualReceipt.render.nodeIds) || !sameSet(htmlReceipt.edgeIds, visualReceipt.render.edgeIds)) throw new Error('projection identity parity');
  visualTarget.dataset.renderMode = visualReceipt.outcome;
  visualTarget.dataset.renderRuntime = threeRuntime === null ? 'static' : 'managed';
  if (threeRuntime !== null) {
    threeRuntime.resize();
    window.addEventListener('pagehide', () => { threeRuntime?.dispose(); threeRuntime = null; threeHandle = null; }, { once: true });
  }
  required('#metric-nodes').textContent = String(artifact.oracle.nodes);
  required('#metric-edges').textContent = String(artifact.oracle.edges);
  required('#metric-courses').textContent = String(artifact.oracle.curriculum_relations);

  const bindings = [];
  let logicalCommits = 0;
  let updateInspector = () => {};
  const controller = createNodeSelectionController({
    snapshotId: scene.inputHash,
    nodeIds: htmlReceipt.focusOrderNodeIds,
    commit(transition) {
      applyNodeSelectionTransition(bindings, transition);
      updateInspector(transition.current.selectedNodeId);
      logicalCommits += 1;
    }
  });
  bindings.push(bindNodeSelectionSurface({ root: htmlTarget, projection: 'html', snapshotId: scene.inputHash, focusOrderNodeIds: htmlReceipt.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState() }));
  if (visualReceipt.outcome === 'fallback') bindings.push(bindNodeSelectionSurface({ root: visualTarget, projection: 'svg', snapshotId: scene.inputHash, focusOrderNodeIds: visualReceipt.render.focusOrderNodeIds, dispatch: (command) => controller.dispatch(command), initialState: controller.getState() }));
  else if (visualTarget.querySelector('canvas')?.getAttribute('aria-hidden') !== 'true') throw new Error('three canvas accessibility boundary');

  const paintThreeSelection = createThreeSelectionPainter(artifact.scene, visualTarget, () => threeHandle, () => threeRuntime);
  const focusThreeCamera = createThreeFocusController(artifact.scene, visualTarget, () => threeRuntime);
  const explorerInspector = configureExplorer(artifact, controller, scene.inputHash, htmlTarget, visualTarget, visualReceipt.outcome);
  updateInspector = (selectedId) => { explorerInspector(selectedId); paintThreeSelection(selectedId); focusThreeCamera(selectedId); };
  updateInspector(null);
  if (selectionSmoke) {
    runSelectionSmoke(htmlTarget, visualTarget, visualReceipt, controller, scene.inputHash, () => logicalCommits);
    result.textContent = 'M3I_SITE_SMOKE_PASS';
  } else result.textContent = 'M3G_SITE_SMOKE_PASS';
} catch (error) {
  const prefix = new URLSearchParams(location.search).get('smoke') === 'm3i' ? 'M3I_SITE_SMOKE_FAIL' : 'M3G_SITE_SMOKE_FAIL';
  result.textContent = `${prefix}:${error instanceof Error ? error.message : String(error)}`;
  const status = document.querySelector('#explorer-status');
  if (status) status.textContent = 'Müfredat verisi doğrulanamadı; rasathane güvenli biçimde durduruldu.';
}

async function loadArtifact() {
  const response = await fetch('./data/curriculum-observatory.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`artifact fetch:${response.status}`);
  const value = await response.json();
  if (!value || value.schemaVersion !== '1.0.0' || value.curriculumId !== 'curriculum:buu:econometrics:2025-2026' || !value.scene || !Array.isArray(value.courses)) throw new Error('artifact schema');
  const expected = { nodes:147, edges:146, curriculum_relations:144, required:41, elective:103, duplicate_stable_ids:0, dangling_edges:0, missing_required_provenance:0, schema_validation_errors:0, silent_fallbacks:0 };
  if (JSON.stringify(value.oracle) !== JSON.stringify(expected) || value.scene.nodes?.length !== 147 || value.scene.edges?.length !== 146 || value.courses.length !== 144) throw new Error('artifact oracle');
  const ids = value.courses.map(({ id }) => id);
  const nodeIds = value.scene.nodes.map(({ id }) => id);
  const nodeRegistry = new Set(nodeIds);
  const edgeIds = value.scene.edges.map(({ id }) => id);
  if (new Set(ids).size !== ids.length || new Set(nodeIds).size !== nodeIds.length || new Set(edgeIds).size !== edgeIds.length) throw new Error('artifact duplicate identity');
  if (value.scene.edges.some(({ source, target }) => !nodeRegistry.has(source) || !nodeRegistry.has(target)) || ids.some((id) => !nodeRegistry.has(id))) throw new Error('artifact referential integrity');
  if (value.courses.some((course) => !course.code || !course.title || !Number.isInteger(course.semester) || course.semester < 1 || course.semester > 8 || !['required', 'elective'].includes(course.status) || !Number.isFinite(course.ects) || course.ects < 0 || !course.relationId || !course.provenance?.sourceId || !course.provenance?.snapshotId || !course.provenance?.locator || !course.provenance?.observedAt || !/^sha256:[0-9a-f]{64}$/u.test(course.provenance?.contentHash || ''))) throw new Error('artifact courses');
  return value;
}

function createViewportEnvironment(container) {
  const reducedMotionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  return {
    measure() {
      const rect = container.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    },
    devicePixelRatio() { return Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1; },
    requestFrame(callback) { return window.requestAnimationFrame(callback); },
    cancelFrame(handle) { window.cancelAnimationFrame(handle); },
    observeResize(listener) {
      const handler = () => listener();
      window.addEventListener('resize', handler);
      if (typeof ResizeObserver !== 'function') return () => window.removeEventListener('resize', handler);
      const observer = new ResizeObserver(handler);
      observer.observe(container);
      return () => { window.removeEventListener('resize', handler); observer.disconnect(); };
    },
    prefersReducedMotion() { return reducedMotionQuery === null ? true : reducedMotionQuery.matches === true; },
    observeReducedMotion(listener) {
      if (reducedMotionQuery === null || typeof reducedMotionQuery.addEventListener !== 'function') return () => {};
      const handler = (event) => listener(event.matches === true);
      reducedMotionQuery.addEventListener('change', handler);
      return () => reducedMotionQuery.removeEventListener('change', handler);
    }
  };
}

function configureExplorer(artifact, controller, snapshotId, htmlTarget, visualTarget, visualOutcome) {
  const input = required('#course-search');
  const semester = required('#semester-filter');
  const status = required('#status-filter');
  const list = required('#search-results');
  const summary = required('#search-summary');
  const inspector = required('#course-inspector');
  const courseById = new Map(artifact.courses.map((course) => [course.id, course]));
  const nodeById = new Map(artifact.scene.nodes.map((node) => [node.id, node]));
  const resultButtons = () => [...list.querySelectorAll('button[data-node-id]')];
  const renderResults = () => {
    const needle = normalizeSearch(input.value);
    const semesterValue = semester.value;
    const statusValue = status.value;
    const matches = artifact.courses.filter((course) =>
      (!needle || normalizeSearch(`${course.code} ${course.title}`).includes(needle)) &&
      (!semesterValue || String(course.semester) === semesterValue) &&
      (!statusValue || course.status === statusValue)
    );
    list.replaceChildren(...matches.map((course) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.nodeId = course.id;
      button.innerHTML = `<strong>${escapeHtml(course.code)}</strong><span>${escapeHtml(course.title)}</span><small>${course.semester}. yarıyıl · ${course.status === 'required' ? 'Zorunlu' : 'Seçmeli'} · ${course.ects} AKTS</small>`;
      button.addEventListener('click', () => controller.dispatch({ type: 'select', nodeId: course.id, expectedSnapshotId: snapshotId }));
      item.append(button); return item;
    }));
    summary.textContent = `${matches.length} ders gösteriliyor`;
    const selectedId = controller.getState().selectedNodeId;
    if (selectedId !== null && !matches.some(({ id }) => id === selectedId)) controller.dispatch({ type: 'clear', expectedSnapshotId: snapshotId });
  };
  input.addEventListener('input', renderResults);
  semester.addEventListener('change', renderResults);
  status.addEventListener('change', renderResults);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = resultButtons();
    if (buttons.length === 0) return;
    event.preventDefault();
    buttons[event.key === 'ArrowDown' ? 0 : buttons.length - 1].focus();
  });
  list.addEventListener('keydown', (event) => {
    const buttons = resultButtons();
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      controller.dispatch({ type: 'clear', expectedSnapshotId: snapshotId });
      input.focus();
      return;
    }
    if (index < 0 || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End')) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    buttons[next].focus();
  });
  renderResults();
  return (selectedId) => {
    for (const button of resultButtons()) {
      if (button.dataset.nodeId === selectedId) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    const relations = deriveDirectRelations(artifact.scene, selectedId);
    paintRelationState(htmlTarget, selectedId, relations);
    if (visualOutcome === 'fallback') paintRelationState(visualTarget, selectedId, relations);
    if (selectedId === null) { inspector.innerHTML = '<p class="empty-inspector">Bir ders seçtiğinde dönem, tür, AKTS, kaynak izi ve doğrudan ilişkiler burada görünür.</p>'; return; }
    const course = courseById.get(selectedId);
    const node = nodeById.get(selectedId);
    const relationMarkup = renderRelationInspector(relations, nodeById);
    if (!course) { inspector.innerHTML = `<h3>${escapeHtml(node?.label || selectedId)}</h3><p>Bu düğüm müfredat hiyerarşisinin parçasıdır. Ders ayrıntısı mevcut değildir.</p>${relationMarkup}`; return; }
    inspector.innerHTML = `<p class="inspector-kicker">Seçili ders</p><h3>${escapeHtml(course.code)} · ${escapeHtml(course.title)}</h3><dl><div><dt>Yarıyıl</dt><dd>${course.semester}</dd></div><div><dt>Tür</dt><dd>${course.status === 'required' ? 'Zorunlu' : 'Seçmeli'}</dd></div><div><dt>AKTS</dt><dd>${course.ects}</dd></div><div><dt>Seçmeli havuzu</dt><dd>${course.poolId ? escapeHtml(course.poolId) : 'Uygulanamaz'}</dd></div></dl><details><summary>Kaynak ve dönüşüm izi</summary><code>${escapeHtml(course.provenance.sourceId)}</code><code>${escapeHtml(course.provenance.snapshotId)}</code><code>${escapeHtml(course.provenance.locator)}</code><code>${escapeHtml(course.provenance.contentHash)}</code><code>${escapeHtml(course.provenance.transformationVersion || 'Mevcut değil')}</code></details><p class="containment-note">Bu ders, 2025–2026 Ekonometri Müfredatı tarafından içerilir. Önkoşul veya eşkoşul ilişkisi iddia edilmez.</p>${relationMarkup}`;
  };
}

function createThreeSelectionPainter(sceneIr, visualTarget, readHandle, readRuntime) {
  return (selectedId) => {
    const handle = readHandle();
    if (handle === null || handle.scene === null || typeof handle.scene !== 'object' || typeof handle.scene.traverse !== 'function') {
      visualTarget.dataset.threeSelection = 'unavailable';
      return;
    }
    try {
      const styling = deriveThreeSelectionStyling(sceneIr, selectedId);
      const nodeStyles = new Map(styling.nodes.map((node) => [node.id, node]));
      const edgeStyles = new Map(styling.edges.map((value) => [value.id, value]));
      handle.scene.traverse((object) => {
        const name = typeof object?.name === 'string' ? object.name : '';
        if (name === '') return;
        const style = object.isMesh === true ? nodeStyles.get(name) : object.isLine === true || object.isLineSegments === true ? edgeStyles.get(name) : undefined;
        if (style === undefined) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material === null || typeof material !== 'object') continue;
          if (material.color && typeof material.color.setHex === 'function') material.color.setHex(style.color);
          material.transparent = true;
          material.opacity = style.opacity;
          material.needsUpdate = true;
        }
        if (object.isMesh === true && object.scale && typeof object.scale.setScalar === 'function') object.scale.setScalar(style.scale);
      });
      visualTarget.dataset.threeSelection = JSON.stringify(summarizeThreeSelectionStyling(styling));
      readRuntime()?.invalidate();
    } catch {
      visualTarget.dataset.threeSelection = 'unavailable';
    }
  };
}

/**
 * Moves the real camera to the selected node's neighbourhood and publishes both the
 * independently derived expectation and the runtime's actual framing, so the browser
 * smoke can assert they agree instead of trusting a single code path.
 */
function createThreeFocusController(sceneIr, visualTarget, readRuntime) {
  const round = (value) => Number(value.toFixed(4));
  return (selectedId) => {
    const runtime = readRuntime();
    if (runtime === null || typeof runtime.focusBounds !== 'function') {
      visualTarget.dataset.threeFocus = 'unavailable';
      return;
    }
    try {
      const focus = selectedId === null ? null : deriveFocusBounds(sceneIr, selectedId);
      const accepted = runtime.focusBounds(focus === null ? null : focus.bounds);
      const state = runtime.state();
      const aspect = state.viewport === null ? 4 / 3 : state.viewport.aspect;
      const expected = summarizeFocusTarget(focus, deriveFocusCamera(focus, 50, aspect, 1.2));
      visualTarget.dataset.threeFocus = JSON.stringify({
        accepted,
        expected,
        actual: {
          selectedNodeId: state.focused ? selectedId : null,
          neighborCount: focus === null ? 0 : focus.neighborIds.length,
          center: state.focused ? { x: round(state.center.x), y: round(state.center.y), z: round(state.center.z) } : null,
          distance: state.focused ? round(state.distance) : null
        },
        renderedFrames: state.frames
      });
    } catch {
      visualTarget.dataset.threeFocus = 'unavailable';
    }
  };
}

function paintRelationState(root, selectedId, relations) {
  const incomingNodes = new Set(relations.incoming.map(({ relatedNodeId }) => relatedNodeId));
  const outgoingNodes = new Set(relations.outgoing.map(({ relatedNodeId }) => relatedNodeId));
  const incomingEdges = new Set(relations.incoming.map(({ edgeId }) => edgeId));
  const outgoingEdges = new Set(relations.outgoing.map(({ edgeId }) => edgeId));
  for (const element of root.querySelectorAll('[data-node-id]')) {
    if (selectedId === null) { delete element.dataset.relationState; continue; }
    const id = element.dataset.nodeId;
    element.dataset.relationState = id === selectedId ? 'selected' : directionalState(incomingNodes.has(id), outgoingNodes.has(id));
  }
  for (const element of root.querySelectorAll('[data-edge-id]')) {
    if (selectedId === null) { delete element.dataset.relationState; continue; }
    const id = element.dataset.edgeId;
    element.dataset.relationState = directionalState(incomingEdges.has(id), outgoingEdges.has(id));
  }
}

function directionalState(incoming, outgoing) {
  if (incoming && outgoing) return 'incoming-outgoing';
  if (incoming) return 'incoming';
  if (outgoing) return 'outgoing';
  return 'unrelated';
}

function renderRelationInspector(relations, nodeById) {
  return `<div class="relation-inspector" aria-label="Doğrudan müfredat ilişkileri"><section aria-labelledby="incoming-relations-title"><h4 id="incoming-relations-title">Gelen ilişkiler</h4>${renderRelationList(relations.incoming, nodeById, 'Gelen ilişki yok.')}</section><section aria-labelledby="outgoing-relations-title"><h4 id="outgoing-relations-title">Giden ilişkiler</h4>${renderRelationList(relations.outgoing, nodeById, 'Giden ilişki yok.')}</section></div>`;
}

function renderRelationList(relations, nodeById, emptyText) {
  if (relations.length === 0) return `<p class="empty-relations">${emptyText}</p>`;
  return `<ul>${relations.map((relation) => {
    const counterpart = nodeById.get(relation.relatedNodeId);
    return `<li data-edge-id="${escapeHtml(relation.edgeId)}" data-direction="${relation.direction}"><strong>${escapeHtml(relation.semanticKind)}</strong><span>${escapeHtml(counterpart?.label || relation.relatedNodeId)}</span><code>${escapeHtml(relation.edgeId)}</code></li>`;
  }).join('')}</ul>`;
}

function runSelectionSmoke(htmlRoot, visualRoot, visualReceipt, controller, snapshotId, commitCount) {
  const firstHtml = htmlRoot.querySelector('nav a[data-node-id]');
  if (!firstHtml) throw new Error('missing HTML selection target');
  firstHtml.focus();
  firstHtml.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  if (controller.getState().selectedNodeId !== firstHtml.dataset.nodeId || commitCount() !== 1 || firstHtml.getAttribute('aria-current') !== 'true') throw new Error('HTML Enter selection');
  htmlRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  if (controller.getState().selectedNodeId !== null || commitCount() !== 2) throw new Error('HTML Escape clear');
  const stale = controller.dispatch({ type: 'clear', expectedSnapshotId: `${snapshotId}:stale` });
  if (stale.outcome !== 'rejected' || commitCount() !== 2) throw new Error('stale snapshot gate');
  if (visualReceipt.outcome === 'fallback') {
    const firstSvg = visualRoot.querySelector('svg g[role="listitem"][data-node-id]');
    if (!firstSvg || firstSvg.dataset.nodeId !== firstHtml.dataset.nodeId) throw new Error('SVG identity parity');
    firstSvg.focus();
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    firstSvg.dispatchEvent(space);
    if (!space.defaultPrevented || controller.getState().selectedNodeId !== firstSvg.dataset.nodeId || commitCount() !== 3 || firstSvg.getAttribute('aria-current') !== 'true' || firstHtml.getAttribute('aria-current') !== 'true') throw new Error('SVG Space selection');
    visualRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    if (controller.getState().selectedNodeId !== null || commitCount() !== 4) throw new Error('SVG Escape clear');
  } else {
    const canvas = visualRoot.querySelector('canvas');
    if (canvas?.getAttribute('aria-hidden') !== 'true' || canvas.hasAttribute('aria-current') || canvas.hasAttribute('data-selected')) throw new Error('Three selection isolation');
  }
}
function normalizeSearch(value) { return value.normalize('NFC').toLocaleUpperCase('tr-TR').replace(/[’']/gu, "'").replace(/[^0-9A-ZÇĞİÖŞÜ']/gu, ' ').replace(/\s+/gu, ' ').trim(); }
function sameSet(left, right) { const values = new Set(right); return left.length === right.length && values.size === right.length && left.every((value) => values.has(value)); }
function required(selector) { const element = document.querySelector(selector); if (!element) throw new Error(`missing element:${selector}`); return element; }
function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
