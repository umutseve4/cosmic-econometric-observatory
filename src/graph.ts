import type { Id, Provenance } from './contracts.js';

export type NodeKind = 'institution' | 'program' | 'curriculum' | 'course' | 'topic' | 'laboratory' | 'source';
export type EdgeKind = 'CONTAINS' | 'PREREQUISITE_OF' | 'INTRODUCES_CONCEPT' | 'EXTENDS_TOPIC' | 'USES_METHOD' | 'IMPLEMENTS_IN_LAB' | 'EVIDENCED_BY';

export interface GraphNode { id: Id; kind: NodeKind; label: string; provenance: Provenance; }
export interface GraphEdge { id: Id; kind: EdgeKind; source: Id; target: Id; provenance: Provenance; }
export interface KnowledgeGraph { nodes: readonly GraphNode[]; edges: readonly GraphEdge[]; }

export function validateGraph(graph: KnowledgeGraph): readonly string[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const errors: string[] = [];
  if (ids.size !== graph.nodes.length) errors.push('DUPLICATE_NODE_ID');
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`DANGLING_EDGE:${edge.id}`);
  }
  return errors.sort();
}
