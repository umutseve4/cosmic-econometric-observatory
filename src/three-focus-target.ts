import { fitThreeCamera } from './three-viewport-lifecycle.js';
import type { ThreeBounds, ThreeFit } from './three-viewport-lifecycle.js';
import type { SceneIR } from './scene.js';

export const FOCUS_DEFAULT_NODE_RADIUS = 0.5;

export interface FocusBounds {
  readonly bounds: ThreeBounds;
  readonly selectedNodeId: string;
  readonly neighborIds: readonly string[];
}

export interface FocusTargetSummary {
  readonly selectedNodeId: string | null;
  readonly neighborCount: number;
  readonly center: Readonly<{ x: number; y: number; z: number }> | null;
  readonly distance: number | null;
}

function isFiniteVector(position: unknown): position is { x: number; y: number; z: number } {
  if (position === null || typeof position !== 'object') return false;
  const candidate = position as { x: unknown; y: unknown; z: unknown };
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z);
}

function validateScene(scene: SceneIR): void {
  if (scene === null || typeof scene !== 'object' || !Array.isArray(scene.nodes) || !Array.isArray(scene.edges)) {
    throw new Error('THREE_FOCUS_INVALID_INPUT:scene');
  }
}

/**
 * Resolves the selected node plus its directly connected neighbours into a bounding
 * volume. Returns `null` (fail-closed) whenever the selection does not resolve to
 * exactly one node with finite coordinates, so callers keep the whole-scene view.
 * Never mutates the scene; the result is deeply frozen.
 */
export function deriveFocusBounds(
  scene: SceneIR,
  selectedNodeId: string | null | undefined,
  nodeRadius: number = FOCUS_DEFAULT_NODE_RADIUS
): FocusBounds | null {
  validateScene(scene);
  if (typeof selectedNodeId !== 'string' || selectedNodeId.length === 0) return null;
  if (!Number.isFinite(nodeRadius) || nodeRadius < 0) return null;

  const matches = scene.nodes.filter((node) => node !== null && typeof node === 'object' && node.id === selectedNodeId);
  if (matches.length !== 1) return null;
  const selected = matches[0]!;
  if (!isFiniteVector(selected.position)) return null;

  const positions = new Map<string, { x: number; y: number; z: number }>();
  for (const node of scene.nodes) {
    if (node === null || typeof node !== 'object' || typeof node.id !== 'string') continue;
    if (positions.has(node.id)) {
      positions.set(node.id, null as unknown as { x: number; y: number; z: number });
      continue;
    }
    positions.set(node.id, isFiniteVector(node.position) ? node.position : (null as unknown as { x: number; y: number; z: number }));
  }

  const neighborIds: string[] = [];
  const seenNeighbors = new Set<string>([selectedNodeId]);
  const seenEdgeIds = new Set<string>();
  for (const edge of scene.edges) {
    if (edge === null || typeof edge !== 'object') continue;
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') continue;
    if (typeof edge.id === 'string') {
      if (seenEdgeIds.has(edge.id)) continue;
      seenEdgeIds.add(edge.id);
    }
    if (!positions.has(edge.source) || !positions.has(edge.target)) continue;
    const other = edge.source === selectedNodeId ? edge.target : edge.target === selectedNodeId ? edge.source : null;
    if (other === null || seenNeighbors.has(other)) continue;
    const position = positions.get(other);
    if (!isFiniteVector(position)) continue;
    seenNeighbors.add(other);
    neighborIds.push(other);
  }

  const included = [selected.position, ...neighborIds.map((id) => positions.get(id)!)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const position of included) {
    minX = Math.min(minX, position.x - nodeRadius);
    maxX = Math.max(maxX, position.x + nodeRadius);
    minY = Math.min(minY, position.y - nodeRadius);
    maxY = Math.max(maxY, position.y + nodeRadius);
    minZ = Math.min(minZ, position.z - nodeRadius);
    maxZ = Math.max(maxZ, position.z + nodeRadius);
  }

  return Object.freeze({
    bounds: Object.freeze({ minX, maxX, minY, maxY, minZ, maxZ }),
    selectedNodeId,
    neighborIds: Object.freeze([...neighborIds].sort())
  });
}

/**
 * Frames a focus volume with the same projection policy the runtime already uses.
 * Returns `null` instead of throwing when the fit inputs are unusable, so an
 * invalid aspect or degenerate volume can never break the render path.
 */
export function deriveFocusCamera(
  focus: FocusBounds | null,
  fieldOfViewDegrees: number,
  aspect: number,
  padding = 1.2
): ThreeFit | null {
  if (focus === null) return null;
  try {
    return fitThreeCamera(focus.bounds, fieldOfViewDegrees, aspect, padding);
  } catch {
    return null;
  }
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Stable, order-independent shape used by the browser smoke test to assert that a
 * real selection actually moved the real camera.
 */
export function summarizeFocusTarget(focus: FocusBounds | null, fit: ThreeFit | null): FocusTargetSummary {
  if (focus === null || fit === null) {
    return Object.freeze({ selectedNodeId: null, neighborCount: 0, center: null, distance: null });
  }
  return Object.freeze({
    selectedNodeId: focus.selectedNodeId,
    neighborCount: focus.neighborIds.length,
    center: Object.freeze({ x: round(fit.center.x), y: round(fit.center.y), z: round(fit.center.z) }),
    distance: round(fit.distance)
  });
}
