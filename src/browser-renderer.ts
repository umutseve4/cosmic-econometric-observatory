import { compareCodePoints } from './canonical.js';
import type {
  ProjectionEdgeDescriptor,
  ProjectionKind,
  ProjectionManifestV2,
  ProjectionNodeDescriptor
} from './projections.js';

export interface BrowserMountTarget<Node> {
  /** One final commit attempt. Mutation behavior if this method throws belongs to the target implementation. */
  replaceChildren(...nodes: Node[]): void;
}

export interface PreparedBrowserProjection<Node> {
  /** Roots are detached output from the injected preparation port; their metadata is verified before commit. */
  readonly roots: readonly Node[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focusOrderNodeIds: readonly string[];
  readonly nodeDescriptors: readonly ProjectionNodeDescriptor[];
  readonly edgeDescriptors: readonly ProjectionEdgeDescriptor[];
}

export interface BrowserDomPort<Node> {
  prepareHtml(content: string): PreparedBrowserProjection<Node>;
  prepareSvg(content: string): PreparedBrowserProjection<Node>;
}

export interface BrowserThreePort<Node> {
  prepareThree(payload: unknown): PreparedBrowserProjection<Node>;
}

export interface BrowserRendererPorts<Node> {
  readonly dom: BrowserDomPort<Node>;
  readonly three?: BrowserThreePort<Node>;
}

export interface BrowserRenderReceipt {
  readonly schemaVersion: '1.0.0';
  readonly projection: ProjectionKind;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focusOrderNodeIds: readonly string[];
}

export function renderProjection<Node>(
  manifest: ProjectionManifestV2,
  target: BrowserMountTarget<Node>,
  ports: BrowserRendererPorts<Node>
): BrowserRenderReceipt {
  validateManifest(manifest);

  let prepared: unknown;
  if (manifest.projection === 'three') {
    if (ports.three === undefined) throw new Error('BROWSER_RENDER_THREE_PORT_REQUIRED');
    const payload = parseAndValidateThreePayload(manifest);
    prepared = prepare('three', () => ports.three!.prepareThree(payload));
  } else if (manifest.projection === 'svg') {
    prepared = prepare('svg', () => ports.dom.prepareSvg(manifest.content));
  } else if (manifest.projection === 'html') {
    prepared = prepare('html', () => ports.dom.prepareHtml(manifest.content));
  } else {
    throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(manifest.projection)}`);
  }

  validatePrepared<Node>(prepared, manifest);
  target.replaceChildren(...prepared.roots);

  return Object.freeze({
    schemaVersion: '1.0.0' as const,
    projection: manifest.projection,
    nodeIds: Object.freeze([...manifest.nodeIds]),
    edgeIds: Object.freeze([...manifest.edgeIds]),
    focusOrderNodeIds: Object.freeze([...manifest.focusOrderNodeIds])
  });
}

function validateManifest(manifest: ProjectionManifestV2): void {
  if (manifest.schemaVersion !== '2.0.0') {
    throw new Error(`BROWSER_RENDER_UNSUPPORTED_SCHEMA:${String(manifest.schemaVersion)}`);
  }
  if (manifest.projection !== 'three' && manifest.projection !== 'svg' && manifest.projection !== 'html') {
    throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(manifest.projection)}`);
  }
  validateSortedUnique('nodeIds', manifest.nodeIds);
  validateSortedUnique('edgeIds', manifest.edgeIds);
  validateStringArray('focusOrderNodeIds', manifest.focusOrderNodeIds);
  if (new Set(manifest.focusOrderNodeIds).size !== manifest.focusOrderNodeIds.length) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:duplicate');
  }
  const focusSet = [...manifest.focusOrderNodeIds].sort(compareCodePoints);
  if (!sameStrings(focusSet, manifest.nodeIds)) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:node-set');
  }
  validateNodeDescriptors(manifest.nodeDescriptors, manifest.nodeIds);
  validateEdgeDescriptors(manifest.edgeDescriptors, manifest.edgeIds, new Set(manifest.nodeIds));
}

function validateNodeDescriptors(value: unknown, nodeIds: readonly string[]): asserts value is readonly ProjectionNodeDescriptor[] {
  if (!Array.isArray(value) || value.some((entry) => !isExactStringRecord(entry, ['id', 'kind', 'label']))) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape');
  }
  const ids = value.map((entry) => (entry as ProjectionNodeDescriptor).id);
  validateDescriptorOrder('nodeDescriptors', ids);
  if (!sameStrings(ids, nodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:id-parity');
}

function validateEdgeDescriptors(
  value: unknown,
  edgeIds: readonly string[],
  nodeIds: ReadonlySet<string>
): asserts value is readonly ProjectionEdgeDescriptor[] {
  if (!Array.isArray(value) || value.some((entry) => !isExactStringRecord(entry, ['id', 'source', 'target']))) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape');
  }
  const descriptors = value as ProjectionEdgeDescriptor[];
  const ids = descriptors.map((entry) => entry.id);
  validateDescriptorOrder('edgeDescriptors', ids);
  if (!sameStrings(ids, edgeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:id-parity');
  if (descriptors.some(({ source, target }) => !nodeIds.has(source) || !nodeIds.has(target))) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:endpoints');
  }
}

function validateDescriptorOrder(name: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:duplicate`);
  if (!sameStrings([...ids].sort(compareCodePoints), ids)) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:unsorted`);
  }
}

function validateSortedUnique(name: string, values: readonly string[]): void {
  validateStringArray(name, values);
  if (new Set(values).size !== values.length) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:duplicate`);
  }
  if (!sameStrings([...values].sort(compareCodePoints), values)) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:unsorted`);
  }
}

function validateStringArray(name: string, values: readonly string[]): void {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:type`);
  }
}

function prepare(kind: ProjectionKind, operation: () => unknown): unknown {
  try {
    return operation();
  } catch (error) {
    throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${kind}:prepare-failed`, { cause: error });
  }
}

function validatePrepared<Node>(prepared: unknown, manifest: ProjectionManifestV2): asserts prepared is PreparedBrowserProjection<Node> {
  if (!isRecord(prepared)) throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:prepared-shape`);
  if (!Array.isArray(prepared.roots) || prepared.roots.length === 0) {
    throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:roots`);
  }
  if (!isStringArray(prepared.nodeIds)
    || !isStringArray(prepared.edgeIds)
    || !isStringArray(prepared.focusOrderNodeIds)
    || !isNodeDescriptorArray(prepared.nodeDescriptors)
    || !isEdgeDescriptorArray(prepared.edgeDescriptors)) {
    throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:metadata`);
  }
  if (!sameStrings(prepared.nodeIds, manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameStrings(prepared.edgeIds, manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  if (!sameStrings(prepared.focusOrderNodeIds, manifest.focusOrderNodeIds)) {
    throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');
  }
  if (!sameNodeDescriptors(prepared.nodeDescriptors, manifest.nodeDescriptors)) {
    throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  }
  if (!sameEdgeDescriptors(prepared.edgeDescriptors, manifest.edgeDescriptors)) {
    throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
  }
}

function parseAndValidateThreePayload(manifest: ProjectionManifestV2): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(manifest.content) as unknown;
  } catch {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:malformed-json');
  }
  if (!isRecord(payload) || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:shape');
  }
  const nodes = payload.nodes;
  const edges = payload.edges;
  if (nodes.some((node) => !isRecord(node)
    || typeof node.id !== 'string'
    || typeof node.label !== 'string'
    || typeof node.semanticKind !== 'string'
    || typeof node.focusOrder !== 'number'
    || !Number.isSafeInteger(node.focusOrder)
    || node.focusOrder < 1)) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
  }
  const nodeIdsUnsorted = nodes.map((node) => (node as Record<string, unknown>).id as string);
  const focusOrders = nodes.map((node) => (node as Record<string, unknown>).focusOrder as number);
  if (new Set(nodeIdsUnsorted).size !== nodeIdsUnsorted.length || new Set(focusOrders).size !== focusOrders.length) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
  }
  const nodeIds = [...nodeIdsUnsorted].sort(compareCodePoints);
  const focusOrderNodeIds = [...nodes]
    .sort((left, right) => ((left as Record<string, unknown>).focusOrder as number) - ((right as Record<string, unknown>).focusOrder as number))
    .map((node) => (node as Record<string, unknown>).id as string);
  if (!sameStrings(nodeIds, manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameStrings(focusOrderNodeIds, manifest.focusOrderNodeIds)) throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');

  const nodeDescriptors = nodes.map((node) => {
    const record = node as Record<string, unknown>;
    return { id: record.id as string, label: record.label as string, kind: record.semanticKind as string };
  }).sort((left, right) => compareCodePoints(left.id, right.id));
  if (!sameNodeDescriptors(nodeDescriptors, manifest.nodeDescriptors)) {
    throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  }

  const nodeSet = new Set(nodeIdsUnsorted);
  if (edges.some((edge) => !isValidThreeEdge(edge, nodeSet))) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
  }
  const edgeIdsUnsorted = edges.map((edge) => (edge as Record<string, unknown>).id as string);
  if (new Set(edgeIdsUnsorted).size !== edgeIdsUnsorted.length) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
  }
  const edgeIds = [...edgeIdsUnsorted].sort(compareCodePoints);
  if (!sameStrings(edgeIds, manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  const edgeDescriptors = edges.map((edge) => {
    const record = edge as Record<string, unknown>;
    return { id: record.id as string, source: record.source as string, target: record.target as string };
  }).sort((left, right) => compareCodePoints(left.id, right.id));
  if (!sameEdgeDescriptors(edgeDescriptors, manifest.edgeDescriptors)) {
    throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
  }
  return payload;
}

function isValidThreeEdge(edge: unknown, nodeSet: ReadonlySet<string>): boolean {
  if (!isRecord(edge)) return false;
  const { id, source, target } = edge;
  return typeof id === 'string'
    && typeof source === 'string'
    && typeof target === 'string'
    && nodeSet.has(source)
    && nodeSet.has(target);
}

function isExactStringRecord(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  return sameStrings(actual, expected) && expected.every((key) => typeof value[key] === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNodeDescriptorArray(value: unknown): value is readonly ProjectionNodeDescriptor[] {
  return Array.isArray(value) && value.every((entry) => isExactStringRecord(entry, ['id', 'kind', 'label']));
}

function isEdgeDescriptorArray(value: unknown): value is readonly ProjectionEdgeDescriptor[] {
  return Array.isArray(value) && value.every((entry) => isExactStringRecord(entry, ['id', 'source', 'target']));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNodeDescriptors(left: readonly ProjectionNodeDescriptor[], right: readonly ProjectionNodeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => {
    const expected = right[index];
    return expected !== undefined && value.id === expected.id && value.label === expected.label && value.kind === expected.kind;
  });
}

function sameEdgeDescriptors(left: readonly ProjectionEdgeDescriptor[], right: readonly ProjectionEdgeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => {
    const expected = right[index];
    return expected !== undefined && value.id === expected.id && value.source === expected.source && value.target === expected.target;
  });
}
