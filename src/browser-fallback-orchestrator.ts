import type {
  BrowserMountTarget,
  BrowserRenderReceipt,
  BrowserRendererPorts
} from './browser-renderer.js';
import { renderProjection } from './browser-renderer.js';
import type {
  ProjectionEdgeDescriptor,
  ProjectionManifestV2,
  ProjectionNodeDescriptor
} from './projections.js';

export interface BrowserFallbackReceipt {
  readonly schemaVersion: '1.0.0';
  readonly outcome: 'three' | 'fallback';
  readonly fallbackProjection: 'html' | 'svg' | null;
  readonly primaryFailure: 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed' | null;
  readonly render: BrowserRenderReceipt;
}

/**
 * Attempts the bounded Three projection once, then mounts an equivalent HTML or
 * SVG projection only when Three preparation failed before target mutation.
 * Manifest, parity and target-commit failures are never converted into fallback.
 */
export function renderThreeWithFallback<NodeLike>(
  primary: ProjectionManifestV2,
  fallback: ProjectionManifestV2,
  target: BrowserMountTarget<NodeLike>,
  ports: BrowserRendererPorts<NodeLike>
): BrowserFallbackReceipt {
  assertFallbackContract(primary, fallback);
  try {
    return freezeReceipt('three', null, null, renderProjection(primary, target, ports));
  } catch (error) {
    if (!isThreePreparationFailure(error)) throw error;
    const receipt = renderProjection(fallback, target, ports);
    return freezeReceipt('fallback', fallback.projection, error.message, receipt);
  }
}

function assertFallbackContract(primary: ProjectionManifestV2, fallback: ProjectionManifestV2): void {
  if (primary.projection !== 'three') throw new Error('BROWSER_FALLBACK_PRIMARY_MUST_BE_THREE');
  if (fallback.projection !== 'html' && fallback.projection !== 'svg') {
    throw new Error('BROWSER_FALLBACK_PROJECTION_MUST_BE_SEMANTIC');
  }
  if (primary.schemaVersion !== fallback.schemaVersion ||
      !sameStrings(primary.nodeIds, fallback.nodeIds) ||
      !sameStrings(primary.edgeIds, fallback.edgeIds) ||
      !sameStrings(primary.focusOrderNodeIds, fallback.focusOrderNodeIds) ||
      !sameNodeDescriptors(primary.nodeDescriptors, fallback.nodeDescriptors) ||
      !sameEdgeDescriptors(primary.edgeDescriptors, fallback.edgeDescriptors)) {
    throw new Error('BROWSER_FALLBACK_SEMANTIC_PARITY_MISMATCH');
  }
}

function isThreePreparationFailure(error: unknown): error is Error & { message: 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed' } {
  return error instanceof Error && error.message === 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed';
}

function freezeReceipt(
  outcome: BrowserFallbackReceipt['outcome'],
  fallbackProjection: BrowserFallbackReceipt['fallbackProjection'],
  primaryFailure: BrowserFallbackReceipt['primaryFailure'],
  render: BrowserRenderReceipt
): BrowserFallbackReceipt {
  return Object.freeze({ schemaVersion: '1.0.0' as const, outcome, fallbackProjection, primaryFailure, render });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameNodeDescriptors(left: readonly ProjectionNodeDescriptor[], right: readonly ProjectionNodeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.label === right[index]?.label && value.kind === right[index]?.kind);
}
function sameEdgeDescriptors(left: readonly ProjectionEdgeDescriptor[], right: readonly ProjectionEdgeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.source === right[index]?.source && value.target === right[index]?.target);
}
