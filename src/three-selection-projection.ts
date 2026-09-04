import { deriveDirectRelations } from './direct-relations.js';
import type { SceneIR } from './scene.js';

export type ThreeSelectionState = 'neutral' | 'selected' | 'incoming' | 'outgoing' | 'incoming-outgoing' | 'unrelated';

export interface ThreeNodeSelectionStyle {
  readonly id: string;
  readonly state: ThreeSelectionState;
  readonly color: number;
  readonly opacity: number;
  readonly scale: number;
}

export interface ThreeEdgeSelectionStyle {
  readonly id: string;
  readonly state: ThreeSelectionState;
  readonly color: number;
  readonly opacity: number;
}

export interface ThreeSelectionCounts {
  readonly selected: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly incomingOutgoing: number;
  readonly unrelated: number;
  readonly neutral: number;
}

export interface ThreeSelectionSummary {
  readonly selectedNodeId: string | null;
  readonly nodes: ThreeSelectionCounts;
  readonly edges: ThreeSelectionCounts;
}

export interface ThreeSelectionStyling {
  readonly selectedNodeId: string | null;
  readonly nodes: readonly ThreeNodeSelectionStyle[];
  readonly edges: readonly ThreeEdgeSelectionStyle[];
}

/** Base colours mirror the prepared Three scene so a cleared selection restores it exactly. */
export const THREE_SELECTION_PALETTE = Object.freeze({
  programNode: 0x4f8cff,
  otherNode: 0x62d49b,
  edge: 0x8b93a7,
  selected: 0xffd166,
  incoming: 0x6ad7ff,
  outgoing: 0xff9f68,
  incomingOutgoing: 0xd6a8ff
});

interface StateVisual { readonly color: number | null; readonly opacity: number; readonly scale: number; }

const NODE_VISUALS: Readonly<Record<ThreeSelectionState, StateVisual>> = Object.freeze({
  neutral: Object.freeze({ color: null, opacity: 1, scale: 1 }),
  selected: Object.freeze({ color: THREE_SELECTION_PALETTE.selected, opacity: 1, scale: 1.9 }),
  incoming: Object.freeze({ color: THREE_SELECTION_PALETTE.incoming, opacity: 1, scale: 1.35 }),
  outgoing: Object.freeze({ color: THREE_SELECTION_PALETTE.outgoing, opacity: 1, scale: 1.35 }),
  'incoming-outgoing': Object.freeze({ color: THREE_SELECTION_PALETTE.incomingOutgoing, opacity: 1, scale: 1.5 }),
  unrelated: Object.freeze({ color: null, opacity: 0.18, scale: 0.8 })
});

const EDGE_VISUALS: Readonly<Record<ThreeSelectionState, StateVisual>> = Object.freeze({
  neutral: Object.freeze({ color: null, opacity: 1, scale: 1 }),
  selected: Object.freeze({ color: THREE_SELECTION_PALETTE.selected, opacity: 1, scale: 1 }),
  incoming: Object.freeze({ color: THREE_SELECTION_PALETTE.incoming, opacity: 1, scale: 1 }),
  outgoing: Object.freeze({ color: THREE_SELECTION_PALETTE.outgoing, opacity: 1, scale: 1 }),
  'incoming-outgoing': Object.freeze({ color: THREE_SELECTION_PALETTE.incomingOutgoing, opacity: 1, scale: 1 }),
  unrelated: Object.freeze({ color: THREE_SELECTION_PALETTE.edge, opacity: 0.08, scale: 1 })
});

/**
 * Projects a one-hop selection onto deterministic Three material styling.
 *
 * Identity and ordering follow Scene IR exactly; nothing is sorted, added, or
 * removed. Emphasis is never carried by colour alone: opacity and node scale
 * change with every state, so the cue survives colour-vision differences and
 * monochrome capture. A selection that does not resolve to exactly one node
 * fails closed to the neutral styling, which restores the prepared scene.
 */
export function deriveThreeSelectionStyling(scene: SceneIR, selectedNodeId: string | null): ThreeSelectionStyling {
  validateScene(scene);
  const nodeIdCounts = new Map<string, number>();
  for (const node of scene.nodes) nodeIdCounts.set(node.id, (nodeIdCounts.get(node.id) ?? 0) + 1);
  const resolved = selectedNodeId !== null && nodeIdCounts.get(selectedNodeId) === 1 ? selectedNodeId : null;
  const relations = deriveDirectRelations(scene, resolved);
  const incomingNodes = new Set(relations.incoming.map(({ relatedNodeId }) => relatedNodeId));
  const outgoingNodes = new Set(relations.outgoing.map(({ relatedNodeId }) => relatedNodeId));
  const incomingEdges = new Set(relations.incoming.map(({ edgeId }) => edgeId));
  const outgoingEdges = new Set(relations.outgoing.map(({ edgeId }) => edgeId));

  const nodes = scene.nodes.map((node) => {
    const state: ThreeSelectionState = resolved === null
      ? 'neutral'
      : node.id === resolved
        ? 'selected'
        : directionalState(incomingNodes.has(node.id), outgoingNodes.has(node.id));
    const visual = NODE_VISUALS[state];
    const base = node.semanticKind === 'program' ? THREE_SELECTION_PALETTE.programNode : THREE_SELECTION_PALETTE.otherNode;
    return Object.freeze({ id: node.id, state, color: visual.color ?? base, opacity: visual.opacity, scale: visual.scale });
  });

  const edges = scene.edges.map((edge) => {
    const state: ThreeSelectionState = resolved === null
      ? 'neutral'
      : directionalState(incomingEdges.has(edge.id), outgoingEdges.has(edge.id));
    const visual = EDGE_VISUALS[state];
    return Object.freeze({ id: edge.id, state, color: visual.color ?? THREE_SELECTION_PALETTE.edge, opacity: visual.opacity });
  });

  return Object.freeze({ selectedNodeId: resolved, nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
}

/** Reduces styling to state counts so browser acceptance can assert it without reading materials. */
export function summarizeThreeSelectionStyling(styling: ThreeSelectionStyling): ThreeSelectionSummary {
  return Object.freeze({
    selectedNodeId: styling.selectedNodeId,
    nodes: countStates(styling.nodes.map(({ state }) => state)),
    edges: countStates(styling.edges.map(({ state }) => state))
  });
}

function directionalState(incoming: boolean, outgoing: boolean): ThreeSelectionState {
  if (incoming && outgoing) return 'incoming-outgoing';
  if (incoming) return 'incoming';
  if (outgoing) return 'outgoing';
  return 'unrelated';
}

function countStates(states: readonly ThreeSelectionState[]): ThreeSelectionCounts {
  let selected = 0, incoming = 0, outgoing = 0, incomingOutgoing = 0, unrelated = 0, neutral = 0;
  for (const state of states) {
    if (state === 'selected') selected += 1;
    else if (state === 'incoming') incoming += 1;
    else if (state === 'outgoing') outgoing += 1;
    else if (state === 'incoming-outgoing') incomingOutgoing += 1;
    else if (state === 'unrelated') unrelated += 1;
    else neutral += 1;
  }
  return Object.freeze({ selected, incoming, outgoing, incomingOutgoing, unrelated, neutral });
}

function validateScene(scene: SceneIR): void {
  if (scene === null || typeof scene !== 'object' || !Array.isArray(scene.nodes) || !Array.isArray(scene.edges)) {
    throw new Error('THREE_SELECTION_INVALID_INPUT:scene');
  }
}
