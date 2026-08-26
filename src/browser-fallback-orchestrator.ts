import { compareCodePoints } from './canonical.js';
import type { BrowserMountTarget, BrowserRenderReceipt, BrowserRendererPorts } from './browser-renderer.js';
import { renderProjection } from './browser-renderer.js';
import type { ProjectionEdgeDescriptor, ProjectionManifestV2, ProjectionNodeDescriptor } from './projections.js';

export interface BrowserFallbackReceipt {
  readonly schemaVersion: '1.0.0';
  readonly outcome: 'three' | 'fallback';
  readonly fallbackProjection: 'html' | 'svg' | null;
  readonly primaryFailure: 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed' | null;
  readonly render: BrowserRenderReceipt;
}

/** Attempts Three once, then mounts an equivalent semantic projection only when
 * Three preparation failed before the target boundary was entered. */
export function renderThreeWithFallback<NodeLike>(
  primary: ProjectionManifestV2,
  fallback: ProjectionManifestV2,
  target: BrowserMountTarget<NodeLike>,
  ports: BrowserRendererPorts<NodeLike>
): BrowserFallbackReceipt {
  preflightManifest(primary);
  preflightManifest(fallback);
  if (primary.projection !== 'three') throw new Error('BROWSER_FALLBACK_PRIMARY_MUST_BE_THREE');
  const fallbackProjection = fallback.projection;
  if (fallbackProjection !== 'html' && fallbackProjection !== 'svg') throw new Error('BROWSER_FALLBACK_PROJECTION_MUST_BE_SEMANTIC');
  assertSemanticParity(primary, fallback);

  let primaryCommitAttempted = false;
  const trackedTarget: BrowserMountTarget<NodeLike> = {
    replaceChildren(...roots) {
      primaryCommitAttempted = true;
      target.replaceChildren(...roots);
    }
  };
  try {
    return freezeReceipt('three', null, null, renderProjection(primary, trackedTarget, ports));
  } catch (error) {
    if (primaryCommitAttempted || !isThreePreparationFailure(error)) throw error;
    const receipt = renderProjection(fallback, target, ports);
    return freezeReceipt('fallback', fallbackProjection, error.message, receipt);
  }
}

function preflightManifest(manifest: ProjectionManifestV2): void {
  const raw = manifest as unknown as Record<string, unknown>;
  if (raw.schemaVersion !== '2.0.0') throw new Error(`BROWSER_RENDER_UNSUPPORTED_SCHEMA:${String(raw.schemaVersion)}`);
  if (raw.projection !== 'html' && raw.projection !== 'svg' && raw.projection !== 'three') throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(raw.projection)}`);
  if (typeof raw.content !== 'string') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:content');
  const nodeIds = validIds(raw.nodeIds, 'nodeIds', true);
  const edgeIds = validIds(raw.edgeIds, 'edgeIds', true);
  const focusOrderNodeIds = validIds(raw.focusOrderNodeIds, 'focusOrderNodeIds', false);
  if (!sameSet(nodeIds, focusOrderNodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:node-set');
  const nodes = validNodeDescriptors(raw.nodeDescriptors, nodeIds);
  validEdgeDescriptors(raw.edgeDescriptors, edgeIds, new Set(nodes.map(({ id }) => id)));
}

function validIds(value: unknown, name: string, sorted: boolean): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0 && !/[\u0000-\u001f\u007f]/u.test(id))) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:type`);
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:duplicate`);
  if (sorted && !ids.every((id, index) => index === 0 || compareCodePoints(ids[index - 1]!, id) < 0)) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:unsorted`);
  return ids;
}

function validNodeDescriptors(value: unknown, expectedIds: readonly string[]): ProjectionNodeDescriptor[] {
  if (!Array.isArray(value)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:type');
  const descriptors = value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape');
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.label !== 'string' || typeof record.kind !== 'string' || !onlyKeys(record, ['id', 'label', 'kind'])) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape');
    return { id: record.id, label: record.label, kind: record.kind };
  });
  const ids = validIds(descriptors.map(({ id }) => id), 'nodeDescriptors', true);
  if (!sameStrings(ids, expectedIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:id-set');
  return descriptors;
}

function validEdgeDescriptors(value: unknown, expectedIds: readonly string[], nodeIds: ReadonlySet<string>): ProjectionEdgeDescriptor[] {
  if (!Array.isArray(value)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:type');
  const descriptors = value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape');
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.source !== 'string' || typeof record.target !== 'string' || !onlyKeys(record, ['id', 'source', 'target'])) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape');
    return { id: record.id, source: record.source, target: record.target };
  });
  const ids = validIds(descriptors.map(({ id }) => id), 'edgeDescriptors', true);
  if (!sameStrings(ids, expectedIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:id-set');
  if (!descriptors.every(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:endpoint');
  return descriptors;
}

function assertSemanticParity(primary: ProjectionManifestV2, fallback: ProjectionManifestV2): void {
  if (primary.schemaVersion !== fallback.schemaVersion || !sameStrings(primary.nodeIds, fallback.nodeIds) ||
      !sameStrings(primary.edgeIds, fallback.edgeIds) || !sameStrings(primary.focusOrderNodeIds, fallback.focusOrderNodeIds) ||
      !sameNodeDescriptors(primary.nodeDescriptors, fallback.nodeDescriptors) || !sameEdgeDescriptors(primary.edgeDescriptors, fallback.edgeDescriptors)) {
    throw new Error('BROWSER_FALLBACK_SEMANTIC_PARITY_MISMATCH');
  }
}

function isThreePreparationFailure(error: unknown): error is Error & { message: 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed' } {
  return error instanceof Error && error.message === 'BROWSER_RENDER_INVALID_CONTENT:three:prepare-failed';
}
function freezeReceipt(outcome: BrowserFallbackReceipt['outcome'], fallbackProjection: BrowserFallbackReceipt['fallbackProjection'], primaryFailure: BrowserFallbackReceipt['primaryFailure'], render: BrowserRenderReceipt): BrowserFallbackReceipt {
  return Object.freeze({ schemaVersion: '1.0.0' as const, outcome, fallbackProjection, primaryFailure, render });
}
function onlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean { const keys = new Set(allowed); return Object.keys(record).every((key) => keys.has(key)); }
function sameStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === new Set([...left, ...right]).size; }
function sameNodeDescriptors(left: readonly ProjectionNodeDescriptor[], right: readonly ProjectionNodeDescriptor[]): boolean { return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.label === right[index]?.label && value.kind === right[index]?.kind); }
function sameEdgeDescriptors(left: readonly ProjectionEdgeDescriptor[], right: readonly ProjectionEdgeDescriptor[]): boolean { return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.source === right[index]?.source && value.target === right[index]?.target); }
