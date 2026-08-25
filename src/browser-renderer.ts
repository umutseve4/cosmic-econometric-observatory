import { compareCodePoints } from './canonical.js';
import type { ProjectionEdgeDescriptor, ProjectionKind, ProjectionManifestV2, ProjectionNodeDescriptor } from './projections.js';

export interface BrowserMountTarget<Node> { replaceChildren(...nodes: Node[]): void; }
export interface PreparedBrowserProjection<Node> {
  readonly roots: readonly Node[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focusOrderNodeIds: readonly string[];
  readonly nodeDescriptors: readonly ProjectionNodeDescriptor[];
  readonly edgeDescriptors: readonly ProjectionEdgeDescriptor[];
}
export interface BrowserDomPort<Node> { prepareHtml(content: string): PreparedBrowserProjection<Node>; prepareSvg(content: string): PreparedBrowserProjection<Node>; }
export interface BrowserThreePort<Node> { prepareThree(payload: unknown): PreparedBrowserProjection<Node>; }
export interface BrowserRendererPorts<Node> { readonly dom: BrowserDomPort<Node>; readonly three?: BrowserThreePort<Node>; }
export interface BrowserRenderReceipt { readonly schemaVersion: '1.0.0'; readonly projection: ProjectionKind; readonly nodeIds: readonly string[]; readonly edgeIds: readonly string[]; readonly focusOrderNodeIds: readonly string[]; }

export function renderProjection<Node>(manifest: ProjectionManifestV2, target: BrowserMountTarget<Node>, ports: BrowserRendererPorts<Node>): BrowserRenderReceipt {
  validateManifest(manifest);
  let prepared: unknown;
  if (manifest.projection === 'three') {
    if (ports.three === undefined) throw new Error('BROWSER_RENDER_THREE_PORT_REQUIRED');
    const payload = parseAndValidateThreePayload(manifest);
    prepared = prepare('three', () => ports.three!.prepareThree(payload));
  } else if (manifest.projection === 'svg') prepared = prepare('svg', () => ports.dom.prepareSvg(manifest.content));
  else if (manifest.projection === 'html') prepared = prepare('html', () => ports.dom.prepareHtml(manifest.content));
  else throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(manifest.projection)}`);
  validatePrepared<Node>(prepared, manifest);
  target.replaceChildren(...prepared.roots);
  return Object.freeze({ schemaVersion: '1.0.0' as const, projection: manifest.projection, nodeIds: Object.freeze([...manifest.nodeIds]), edgeIds: Object.freeze([...manifest.edgeIds]), focusOrderNodeIds: Object.freeze([...manifest.focusOrderNodeIds]) });
}

function validateManifest(manifest: ProjectionManifestV2): void {
  if (manifest.schemaVersion !== '2.0.0') throw new Error(`BROWSER_RENDER_UNSUPPORTED_SCHEMA:${String(manifest.schemaVersion)}`);
  if (!['three', 'svg', 'html'].includes(manifest.projection)) throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(manifest.projection)}`);
  validateSortedUnique('nodeIds', manifest.nodeIds); validateSortedUnique('edgeIds', manifest.edgeIds);
  validateStringArray('focusOrderNodeIds', manifest.focusOrderNodeIds);
  if (new Set(manifest.focusOrderNodeIds).size !== manifest.focusOrderNodeIds.length) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:duplicate');
  if (!sameStrings([...manifest.focusOrderNodeIds].sort(compareCodePoints), manifest.nodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:node-set');
  const nodes = validateNodeDescriptors(manifest.nodeDescriptors, 'manifest');
  const edges = validateEdgeDescriptors(manifest.edgeDescriptors, 'manifest');
  if (!sameStrings(nodes.map((entry) => entry.id), manifest.nodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:id-set');
  if (!sameStrings(edges.map((entry) => entry.id), manifest.edgeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:id-set');
  const nodeSet = new Set(manifest.nodeIds);
  if (edges.some(({ source, target }) => !nodeSet.has(source) || !nodeSet.has(target))) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:endpoint');
}
function validateSortedUnique(name: string, values: readonly string[]): void {
  validateStringArray(name, values);
  if (new Set(values).size !== values.length) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:duplicate`);
  if (!sameStrings([...values].sort(compareCodePoints), values)) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:unsorted`);
}
function validateStringArray(name: string, values: unknown): asserts values is readonly string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:type`);
}
function validateNodeDescriptors(value: unknown, scope: 'manifest' | 'prepared' | 'three'): ProjectionNodeDescriptor[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.label !== 'string' || typeof entry.kind !== 'string')) throw descriptorError(scope, 'nodeDescriptors', 'type');
  const entries = value as unknown as ProjectionNodeDescriptor[];
  validateDescriptorOrder(entries, scope, 'nodeDescriptors'); return entries;
}
function validateEdgeDescriptors(value: unknown, scope: 'manifest' | 'prepared' | 'three'): ProjectionEdgeDescriptor[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.source !== 'string' || typeof entry.target !== 'string')) throw descriptorError(scope, 'edgeDescriptors', 'type');
  const entries = value as unknown as ProjectionEdgeDescriptor[];
  validateDescriptorOrder(entries, scope, 'edgeDescriptors'); return entries;
}
function validateDescriptorOrder(entries: readonly { id: string }[], scope: 'manifest' | 'prepared' | 'three', name: string): void {
  const ids = entries.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw descriptorError(scope, name, 'duplicate');
  if (!sameStrings([...ids].sort(compareCodePoints), ids)) throw descriptorError(scope, name, 'unsorted');
}
function descriptorError(scope: 'manifest' | 'prepared' | 'three', name: string, reason: string): Error {
  return new Error(scope === 'manifest' ? `BROWSER_RENDER_INVALID_MANIFEST:${name}:${reason}` : `BROWSER_RENDER_INVALID_CONTENT:${scope}:${name}:${reason}`);
}
function prepare(kind: ProjectionKind, operation: () => unknown): unknown { try { return operation(); } catch (error) { throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${kind}:prepare-failed`, { cause: error }); } }

function validatePrepared<Node>(prepared: unknown, manifest: ProjectionManifestV2): asserts prepared is PreparedBrowserProjection<Node> {
  if (!isRecord(prepared)) throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:prepared-shape`);
  if (!Array.isArray(prepared.roots) || prepared.roots.length === 0) throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:roots`);
  if (!isStringArray(prepared.nodeIds) || !isStringArray(prepared.edgeIds) || !isStringArray(prepared.focusOrderNodeIds)) throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:metadata`);
  if (!sameStrings(prepared.nodeIds, manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameStrings(prepared.edgeIds, manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  if (!sameStrings(prepared.focusOrderNodeIds, manifest.focusOrderNodeIds)) throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');
  const nodes = validateNodeDescriptors(prepared.nodeDescriptors, 'prepared');
  const edges = validateEdgeDescriptors(prepared.edgeDescriptors, 'prepared');
  if (!sameNodeDescriptors(nodes, manifest.nodeDescriptors)) throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  if (!sameEdgeDescriptors(edges, manifest.edgeDescriptors)) throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
}

function parseAndValidateThreePayload(manifest: ProjectionManifestV2): unknown {
  let payload: unknown;
  try { payload = JSON.parse(manifest.content) as unknown; } catch { throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:malformed-json'); }
  if (!isRecord(payload) || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:shape');
  const nodes = payload.nodes;
  if (nodes.some((node) => !isRecord(node) || typeof node.id !== 'string' || typeof node.label !== 'string' || typeof node.semanticKind !== 'string' || typeof node.focusOrder !== 'number' || !Number.isSafeInteger(node.focusOrder) || node.focusOrder < 1)) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
  const nodeIdsUnsorted = nodes.map((node) => (node as Record<string, unknown>).id as string);
  const focusOrders = nodes.map((node) => (node as Record<string, unknown>).focusOrder as number);
  if (new Set(nodeIdsUnsorted).size !== nodeIdsUnsorted.length || new Set(focusOrders).size !== focusOrders.length) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
  const nodeIds = [...nodeIdsUnsorted].sort(compareCodePoints);
  const focusIds = [...nodes].sort((a, b) => ((a as Record<string, unknown>).focusOrder as number) - ((b as Record<string, unknown>).focusOrder as number)).map((node) => (node as Record<string, unknown>).id as string);
  if (!sameStrings(nodeIds, manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameStrings(focusIds, manifest.focusOrderNodeIds)) throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');
  const nodeSet = new Set(nodeIdsUnsorted);
  if (payload.edges.some((edge) => !isRecord(edge) || typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string' || !nodeSet.has(edge.source) || !nodeSet.has(edge.target))) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
  const edgeIdsUnsorted = payload.edges.map((edge) => (edge as Record<string, unknown>).id as string);
  if (new Set(edgeIdsUnsorted).size !== edgeIdsUnsorted.length) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
  if (!sameStrings([...edgeIdsUnsorted].sort(compareCodePoints), manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  const nodeDescriptors = nodes.map((node) => ({ id: (node as Record<string, unknown>).id as string, label: (node as Record<string, unknown>).label as string, kind: (node as Record<string, unknown>).semanticKind as string })).sort(byId);
  const edgeDescriptors = payload.edges.map((edge) => ({ id: (edge as Record<string, unknown>).id as string, source: (edge as Record<string, unknown>).source as string, target: (edge as Record<string, unknown>).target as string })).sort(byId);
  validateNodeDescriptors(nodeDescriptors, 'three'); validateEdgeDescriptors(edgeDescriptors, 'three');
  if (!sameNodeDescriptors(nodeDescriptors, manifest.nodeDescriptors)) throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  if (!sameEdgeDescriptors(edgeDescriptors, manifest.edgeDescriptors)) throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
  return payload;
}
function byId<T extends { id: string }>(a: T, b: T): number { return compareCodePoints(a.id, b.id); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isStringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((entry) => typeof entry === 'string'); }
function sameStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function sameNodeDescriptors(left: readonly ProjectionNodeDescriptor[], right: readonly ProjectionNodeDescriptor[]): boolean { return left.length === right.length && left.every((value, i) => value.id === right[i]?.id && value.label === right[i]?.label && value.kind === right[i]?.kind); }
function sameEdgeDescriptors(left: readonly ProjectionEdgeDescriptor[], right: readonly ProjectionEdgeDescriptor[]): boolean { return left.length === right.length && left.every((value, i) => value.id === right[i]?.id && value.source === right[i]?.source && value.target === right[i]?.target); }
