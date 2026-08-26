import { compareCodePoints } from './canonical.js';
import type { SceneIR, SceneNode } from './scene.js';

export type ProjectionKind = 'three' | 'svg' | 'html';
export interface ProjectionNodeDescriptor { readonly id: string; readonly label: string; readonly kind: string; }
export interface ProjectionEdgeDescriptor { readonly id: string; readonly source: string; readonly target: string; }

/** Legacy construction shape retained for source compatibility. */
export interface ProjectionManifest {
  projection: ProjectionKind;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  content: string;
}

/** Versioned M3e output contract returned by project(). */
export interface ProjectionManifestV2 extends ProjectionManifest {
  schemaVersion: '2.0.0';
  focusOrderNodeIds: readonly string[];
  nodeDescriptors: readonly ProjectionNodeDescriptor[];
  edgeDescriptors: readonly ProjectionEdgeDescriptor[];
}

export function project(scene: SceneIR, projection: ProjectionKind): ProjectionManifestV2 {
  const focusOrderedNodes = validateAndOrderNodes(scene.nodes);
  const orderedEdges = [...scene.edges].sort(byId);
  const nodeIds = scene.nodes.map((node) => node.id).sort(compareCodePoints);
  const edgeIds = orderedEdges.map((edge) => edge.id);
  const focusOrderNodeIds = focusOrderedNodes.map((node) => node.id);
  const nodeDescriptors = scene.nodes.map(({ id, label, semanticKind }) => ({ id, label, kind: semanticKind })).sort(byId);
  const edgeDescriptors = orderedEdges.map(({ id, source, target }) => ({ id, source, target }));
  const common = { schemaVersion: '2.0.0' as const, projection, nodeIds, edgeIds, focusOrderNodeIds, nodeDescriptors, edgeDescriptors };

  if (projection === 'three') {
    return {
      ...common,
      content: JSON.stringify({
        scene: scene.schemaVersion,
        nodes: focusOrderedNodes.map(({ id, semanticKind, label, position, focusOrder, capabilities }) => ({ id, semanticKind, label, position, focusOrder, capabilities })),
        edges: orderedEdges
      })
    };
  }

  if (projection === 'svg') {
    const padding = 2;
    const xValues = focusOrderedNodes.map(({ position }) => position.x);
    const yValues = focusOrderedNodes.map(({ position }) => position.z);
    const minX = (xValues.length === 0 ? 0 : Math.min(...xValues)) - padding;
    const minY = (yValues.length === 0 ? 0 : Math.min(...yValues)) - padding;
    const maxX = (xValues.length === 0 ? 0 : Math.max(...xValues)) + padding;
    const maxY = (yValues.length === 0 ? 0 : Math.max(...yValues)) + padding;
    const viewBox = [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)].map(formatCoordinate).join(' ');
    const positions = new Map(focusOrderedNodes.map((node) => [node.id, node.position]));
    const nodes = focusOrderedNodes.map((node, index) =>
      `<g id="${escapeMarkup(node.id)}" role="listitem" tabindex="0" data-node-id="${escapeMarkup(node.id)}" data-semantic-kind="${escapeMarkup(node.semanticKind)}" aria-label="${index + 1} of ${focusOrderedNodes.length}: ${escapeMarkup(node.label)} (${escapeMarkup(node.semanticKind)})"><circle cx="${formatCoordinate(node.position.x)}" cy="${formatCoordinate(node.position.z)}" r="0.32" fill="#55d9e7"/><title>${escapeMarkup(node.label)}</title></g>`
    ).join('');
    const edges = orderedEdges.map((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (source === undefined || target === undefined) throw new Error(`INVALID_PROJECTION_EDGE_ENDPOINT:${edge.id}`);
      const path = `M ${formatCoordinate(source.x)} ${formatCoordinate(source.z)} L ${formatCoordinate(target.x)} ${formatCoordinate(target.z)}`;
      return `<path data-edge-id="${escapeMarkup(edge.id)}" data-semantic-kind="${escapeMarkup(edge.semanticKind)}" data-source="${escapeMarkup(edge.source)}" data-target="${escapeMarkup(edge.target)}" d="${path}" fill="none" stroke="#8ca2ff" stroke-width="0.08"/>`;
    }).join('');
    return { ...common, content: `<svg role="group" aria-label="Academic knowledge universe" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><g role="group" aria-label="Knowledge relations">${edges}</g><g role="list" aria-label="Knowledge nodes">${nodes}</g></svg>` };
  }

  const navigation = focusOrderedNodes.map((node) =>
    `<li><a href="#${escapeMarkup(node.id)}" data-node-id="${escapeMarkup(node.id)}">${escapeMarkup(node.label)}</a></li>`
  ).join('');
  const closingArticleTag = ['<', '/article>'].join('');
  const details = focusOrderedNodes.map((node) =>
    `<article id="${escapeMarkup(node.id)}" tabindex="-1" data-node-id="${escapeMarkup(node.id)}" data-semantic-kind="${escapeMarkup(node.semanticKind)}"><h2>${escapeMarkup(node.label)}</h2><p>${escapeMarkup(node.semanticKind)}</p>${closingArticleTag}`
  ).join('');
  const relations = orderedEdges.map((edge) =>
    `<li data-edge-id="${escapeMarkup(edge.id)}" data-semantic-kind="${escapeMarkup(edge.semanticKind)}"><a href="#${escapeMarkup(edge.source)}">${escapeMarkup(edge.source)}</a> → <a href="#${escapeMarkup(edge.target)}">${escapeMarkup(edge.target)}</a></li>`
  ).join('');
  return { ...common, content: `<nav aria-label="Academic knowledge universe"><ol>${navigation}</ol></nav><main aria-label="Knowledge node details">${details}</main><section aria-label="Relations"><ul>${relations}</ul></section>` };
}

function validateAndOrderNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const ids = new Set<string>();
  const focusOrders = new Set<number>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`DUPLICATE_PROJECTION_NODE_ID:${node.id}`);
    if (!Number.isSafeInteger(node.focusOrder) || node.focusOrder < 1 || focusOrders.has(node.focusOrder)) throw new Error(`INVALID_PROJECTION_FOCUS_ORDER:${node.id}:${node.focusOrder}`);
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y) || !Number.isFinite(node.position.z)) throw new Error(`INVALID_PROJECTION_POSITION:${node.id}`);
    ids.add(node.id); focusOrders.add(node.focusOrder);
  }
  return [...nodes].sort((a, b) => a.focusOrder - b.focusOrder || compareCodePoints(a.id, b.id));
}
function byId<T extends { id: string }>(left: T, right: T): number { return compareCodePoints(left.id, right.id); }
function formatCoordinate(value: number): string { return Object.is(value, -0) ? '0' : String(value); }
function escapeMarkup(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
