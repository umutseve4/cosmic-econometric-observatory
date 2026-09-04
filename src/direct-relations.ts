import type { SceneEdge, SceneIR } from './scene.js';

export type DirectRelationDirection = 'incoming' | 'outgoing';
export interface DirectRelation {
  readonly edgeId: string;
  readonly semanticKind: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relatedNodeId: string;
  readonly direction: DirectRelationDirection;
}
export interface DirectRelations {
  readonly incoming: readonly DirectRelation[];
  readonly outgoing: readonly DirectRelation[];
  readonly highlightedEdgeIds: readonly string[];
  readonly relatedNodeIds: readonly string[];
}

const empty: DirectRelations = Object.freeze({
  incoming: Object.freeze([]), outgoing: Object.freeze([]), highlightedEdgeIds: Object.freeze([]), relatedNodeIds: Object.freeze([])
});

/** Derives only valid one-hop relations without modifying Scene IR identities or order. */
export function deriveDirectRelations(scene: SceneIR, selectedNodeId: string | null): DirectRelations {
  const nodeIdCounts = new Map<string, number>();
  for (const node of scene.nodes) nodeIdCounts.set(node.id, (nodeIdCounts.get(node.id) ?? 0) + 1);
  if (selectedNodeId === null || nodeIdCounts.get(selectedNodeId) !== 1) return empty;
  const edgeIdCounts = new Map<string, number>();
  for (const edge of scene.edges) edgeIdCounts.set(edge.id, (edgeIdCounts.get(edge.id) ?? 0) + 1);
  const incoming: DirectRelation[] = [];
  const outgoing: DirectRelation[] = [];
  const highlightedEdgeIds: string[] = [];
  const relatedNodeIds: string[] = [];
  const highlighted = new Set<string>();
  const related = new Set<string>();
  for (const edge of scene.edges) {
    if (!validEdge(edge, nodeIdCounts) || edgeIdCounts.get(edge.id) !== 1) continue;
    let incident = false;
    if (edge.target === selectedNodeId) {
      incoming.push(freezeRelation(edge, edge.source, 'incoming'));
      incident = true;
      if (edge.source !== selectedNodeId && !related.has(edge.source)) { related.add(edge.source); relatedNodeIds.push(edge.source); }
    }
    if (edge.source === selectedNodeId) {
      outgoing.push(freezeRelation(edge, edge.target, 'outgoing'));
      incident = true;
      if (edge.target !== selectedNodeId && !related.has(edge.target)) { related.add(edge.target); relatedNodeIds.push(edge.target); }
    }
    if (incident && !highlighted.has(edge.id)) { highlighted.add(edge.id); highlightedEdgeIds.push(edge.id); }
  }
  return Object.freeze({
    incoming: Object.freeze(incoming), outgoing: Object.freeze(outgoing),
    highlightedEdgeIds: Object.freeze(highlightedEdgeIds), relatedNodeIds: Object.freeze(relatedNodeIds)
  });
}

function validEdge(edge: SceneEdge, nodeIdCounts: ReadonlyMap<string, number>): boolean {
  return typeof edge.id === 'string' && edge.id.length > 0 && typeof edge.semanticKind === 'string' && edge.semanticKind.length > 0 && nodeIdCounts.get(edge.source) === 1 && nodeIdCounts.get(edge.target) === 1;
}
function freezeRelation(edge: SceneEdge, relatedNodeId: string, direction: DirectRelationDirection): DirectRelation {
  return Object.freeze({ edgeId: edge.id, semanticKind: edge.semanticKind, sourceId: edge.source, targetId: edge.target, relatedNodeId, direction });
}
