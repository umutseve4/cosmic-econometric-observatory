import { compareCodePoints } from './canonical.js';
import type { SceneIR, SceneNode } from './scene.js';

export type ProjectionKind = 'three' | 'svg' | 'html';

/** Legacy construction shape retained for source compatibility. */
export interface ProjectionManifest {
  projection: ProjectionKind;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  content: string;
}

/** Versioned M3a output contract returned by project(). */
export interface ProjectionManifestV2 extends ProjectionManifest {
  schemaVersion: '2.0.0';
  focusOrderNodeIds: readonly string[];
}

export function project(scene: SceneIR, projection: ProjectionKind): ProjectionManifestV2 {
  const focusOrderedNodes = validateAndOrderNodes(scene.nodes);
  const nodeIds = scene.nodes.map((node) => node.id).sort(compareCodePoints);
  const edgeIds = scene.edges.map((edge) => edge.id).sort(compareCodePoints);
  const focusOrderNodeIds = focusOrderedNodes.map((node) => node.id);
  const common = { schemaVersion: '2.0.0' as const, projection, nodeIds, edgeIds, focusOrderNodeIds };

  if (projection === 'three') {
    return {
      ...common,
      content: JSON.stringify({
        scene: scene.schemaVersion,
        nodes: focusOrderedNodes.map(({ id, semanticKind, label, position, focusOrder, capabilities }) => ({
          id, semanticKind, label, position, focusOrder, capabilities
        })),
        edges: scene.edges
      })
    };
  }

  if (projection === 'svg') {
    const nodes = focusOrderedNodes.map((node, index) =>
      `<g id="${escapeMarkup(node.id)}" role="listitem" tabindex="0" data-node-id="${escapeMarkup(node.id)}" data-semantic-kind="${escapeMarkup(node.semanticKind)}" aria-label="${index + 1} of ${focusOrderedNodes.length}: ${escapeMarkup(node.label)} (${escapeMarkup(node.semanticKind)})"><circle cx="${node.position.x}" cy="${node.position.z}" r="1"/><title>${escapeMarkup(node.label)}</title></g>`
    ).join('');
    const edges = scene.edges.map((edge) =>
      `<path data-edge-id="${escapeMarkup(edge.id)}" data-semantic-kind="${escapeMarkup(edge.semanticKind)}" data-source="${escapeMarkup(edge.source)}" data-target="${escapeMarkup(edge.target)}"/>`
    ).join('');
    return {
      ...common,
      content: `<svg role="group" aria-label="Academic knowledge universe"><g role="list" aria-label="Knowledge nodes">${nodes}</g><g role="group" aria-label="Knowledge relations">${edges}</g></svg>`
    };
  }

  const navigation = focusOrderedNodes.map((node) =>
    `<li><a href="#${escapeMarkup(node.id)}" data-node-id="${escapeMarkup(node.id)}">${escapeMarkup(node.label)}</a></li>`
  ).join('');
  const details = focusOrderedNodes.map((node) =>
    `<article id="${escapeMarkup(node.id)}" tabindex="-1" data-node-id="${escapeMarkup(node.id)}" data-semantic-kind="${escapeMarkup(node.semanticKind)}"><h2>${escapeMarkup(node.label)}</h2><p>${escapeMarkup(node.semanticKind)}</p></article>`
  ).join('');
  const relations = scene.edges.map((edge) =>
    `<li data-edge-id="${escapeMarkup(edge.id)}" data-semantic-kind="${escapeMarkup(edge.semanticKind)}"><a href="#${escapeMarkup(edge.source)}">${escapeMarkup(edge.source)}</a> → <a href="#${escapeMarkup(edge.target)}">${escapeMarkup(edge.target)}</a></li>`
  ).join('');
  return {
    ...common,
    content: `<nav aria-label="Academic knowledge universe"><ol>${navigation}</ol></nav><main aria-label="Knowledge node details">${details}</main><section aria-label="Relations"><ul>${relations}</ul></section>`
  };
}

function validateAndOrderNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const ids = new Set<string>();
  const focusOrders = new Set<number>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`DUPLICATE_PROJECTION_NODE_ID:${node.id}`);
    if (!Number.isSafeInteger(node.focusOrder) || node.focusOrder < 1 || focusOrders.has(node.focusOrder)) {
      throw new Error(`INVALID_PROJECTION_FOCUS_ORDER:${node.id}:${node.focusOrder}`);
    }
    ids.add(node.id);
    focusOrders.add(node.focusOrder);
  }
  return [...nodes].sort((a, b) => a.focusOrder - b.focusOrder || compareCodePoints(a.id, b.id));
}

function escapeMarkup(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
