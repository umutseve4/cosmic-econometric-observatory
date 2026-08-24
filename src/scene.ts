import { createHash } from 'node:crypto';
import { canonicalize, compareCodePoints } from './canonical.js';
import type { Provenance } from './contracts.js';
import type { KnowledgeGraph } from './graph.js';

export interface Position { x: number; y: number; z: number; }
export interface SceneNode { id: string; semanticKind: string; label: string; position: Position; focusOrder: number; capabilities: readonly ('inspect' | 'navigate')[]; }
export interface SceneEdge { id: string; semanticKind: string; source: string; target: string; }
export interface SceneIR { schemaVersion: '0.1.0'; layoutVersion: string; seed: string; inputHash: string; nodes: readonly SceneNode[]; edges: readonly SceneEdge[]; }

export function compileScene(graph: KnowledgeGraph, seed = 'ceo-m0', layoutVersion = 'radial-v1'): SceneIR {
  const nodes = [...graph.nodes].sort((a, b) => compareCodePoints(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`));
  const edges = [...graph.edges].sort((a, b) => compareCodePoints(a.id, b.id));
  const inputHash = sha256(canonicalize({
    nodes: nodes.map((node) => ({ ...node, provenance: normalizeProvenance(node.provenance) })),
    edges: edges.map((edge) => ({ ...edge, provenance: normalizeProvenance(edge.provenance) }))
  }));
  return {
    schemaVersion: '0.1.0', layoutVersion, seed, inputHash,
    nodes: nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
      const ring = ringFor(node.kind);
      return { id: node.id, semanticKind: node.kind, label: node.label, position: { x: round(ring * Math.cos(angle)), y: round((index % 3) - 1), z: round(ring * Math.sin(angle)) }, focusOrder: index + 1, capabilities: ['inspect', 'navigate'] };
    }),
    edges: edges.map(({ id, kind, source, target }) => ({ id, semanticKind: kind, source, target }))
  };
}

export function sceneHash(scene: SceneIR): string { return sha256(canonicalize(scene)); }
export function canonicalScene(scene: SceneIR): string { return canonicalize(scene); }

function normalizeProvenance(provenance: Provenance): Provenance {
  if (provenance.derivedFrom === undefined) return provenance;
  return { ...provenance, derivedFrom: [...provenance.derivedFrom].sort(compareCodePoints) };
}

function sha256(value: string): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function round(value: number): number { return Number(value.toFixed(6)); }
function ringFor(kind: string): number { return ({ institution: 0, program: 2, curriculum: 4, course: 6, topic: 8, laboratory: 10, source: 12 } as Record<string, number>)[kind] ?? 14; }
