import { compareCodePoints } from './canonical.js';
import type { ProjectionEdgeDescriptor, ProjectionManifestV2, ProjectionNodeDescriptor } from './projections.js';

export interface BrowserMountTarget<NodeLike = unknown> {
  replaceChildren(...nodes: NodeLike[]): void;
}

export interface PreparedBrowserProjection<NodeLike = unknown> {
  readonly roots: readonly NodeLike[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focusOrderNodeIds: readonly string[];
  readonly nodeDescriptors: readonly ProjectionNodeDescriptor[];
  readonly edgeDescriptors: readonly ProjectionEdgeDescriptor[];
}

export interface BrowserDomPreparationPort<NodeLike = unknown> {
  prepareHtml(content: string): PreparedBrowserProjection<NodeLike>;
  prepareSvg(content: string): PreparedBrowserProjection<NodeLike>;
}

export interface BrowserThreePreparationPort<NodeLike = unknown> {
  prepareThree(payload: unknown): PreparedBrowserProjection<NodeLike>;
}

export interface BrowserRendererPorts<NodeLike = unknown> {
  readonly dom: BrowserDomPreparationPort<NodeLike>;
  readonly three?: BrowserThreePreparationPort<NodeLike>;
}

export interface BrowserRenderReceipt {
  readonly schemaVersion: '1.0.0';
  readonly projection: ProjectionManifestV2['projection'];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly focusOrderNodeIds: readonly string[];
  readonly committedRootCount: number;
}

type ThreeNodePayload = {
  id: string;
  semanticKind: string;
  label: string;
  position: { x: number; y: number; z: number };
  focusOrder: number;
  capabilities: string[];
};

type ThreeEdgePayload = {
  id: string;
  semanticKind: string;
  source: string;
  target: string;
};

type CanonicalThreePayload = {
  scene: string;
  nodes: ThreeNodePayload[];
  edges: ThreeEdgePayload[];
};

export function renderProjection<NodeLike>(
  manifest: ProjectionManifestV2,
  target: BrowserMountTarget<NodeLike>,
  ports: BrowserRendererPorts<NodeLike>
): BrowserRenderReceipt {
  validateManifest(manifest);
  let prepared: PreparedBrowserProjection<NodeLike>;
  try {
    if (manifest.projection === 'html') prepared = ports.dom.prepareHtml(manifest.content);
    else if (manifest.projection === 'svg') prepared = ports.dom.prepareSvg(manifest.content);
    else {
      if (!ports.three) throw new Error('BROWSER_RENDER_THREE_PORT_REQUIRED');
      prepared = ports.three.prepareThree(parseAndValidateThreePayload(manifest));
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'BROWSER_RENDER_THREE_PORT_REQUIRED') throw error;
    if (error instanceof Error && error.message.startsWith('BROWSER_RENDER_')) throw error;
    throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:prepare-failed`, { cause: error });
  }

  validatePreparedProjection(manifest, prepared);
  target.replaceChildren(...prepared.roots);
  return Object.freeze({
    schemaVersion: '1.0.0' as const,
    projection: manifest.projection,
    nodeIds: Object.freeze([...manifest.nodeIds]),
    edgeIds: Object.freeze([...manifest.edgeIds]),
    focusOrderNodeIds: Object.freeze([...manifest.focusOrderNodeIds]),
    committedRootCount: prepared.roots.length
  });
}

function validateManifest(manifest: ProjectionManifestV2): void {
  const raw = manifest as unknown as Record<string, unknown>;
  if (raw.schemaVersion !== '2.0.0') throw new Error(`BROWSER_RENDER_UNSUPPORTED_SCHEMA:${String(raw.schemaVersion)}`);
  if (raw.projection !== 'html' && raw.projection !== 'svg' && raw.projection !== 'three') {
    throw new Error(`BROWSER_RENDER_UNSUPPORTED_PROJECTION:${String(raw.projection)}`);
  }
  if (typeof raw.content !== 'string') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:content');
  const nodeIds = validateIds(raw.nodeIds, 'nodeIds', true);
  const edgeIds = validateIds(raw.edgeIds, 'edgeIds', true);
  const focusOrderNodeIds = validateIds(raw.focusOrderNodeIds, 'focusOrderNodeIds', false);
  if (!sameSet(nodeIds, focusOrderNodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:focusOrderNodeIds:node-set');
  validateNodeDescriptors(raw.nodeDescriptors, nodeIds);
  validateEdgeDescriptors(raw.edgeDescriptors, edgeIds, new Set(nodeIds));
}

function validateIds(value: unknown, name: string, sorted: boolean): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0 && !/[\u0000-\u001f\u007f]/u.test(id))) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:type`);
  }
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:duplicate`);
  if (sorted && !ids.every((id, index) => index === 0 || compareCodePoints(ids[index - 1]!, id) < 0)) {
    throw new Error(`BROWSER_RENDER_INVALID_MANIFEST:${name}:unsorted`);
  }
  return ids;
}

function validateNodeDescriptors(input: unknown, expectedNodeIds: readonly string[]): ProjectionNodeDescriptor[] {
  if (!Array.isArray(input)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:type');
  const descriptors = input.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape');
    const record = value as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.label !== 'string' || typeof record.kind !== 'string') {
      throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:shape');
    }
    if (!hasOnlyKeys(record, ['id', 'label', 'kind'])) {
      throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:unknown-key');
    }
    return { id: record.id, label: record.label, kind: record.kind };
  });
  const ids = validateIds(descriptors.map(({ id }) => id), 'nodeDescriptors', true);
  if (!sameArray(ids, expectedNodeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:nodeDescriptors:id-set');
  return descriptors;
}

function validateEdgeDescriptors(input: unknown, expectedEdgeIds: readonly string[], nodeIds: ReadonlySet<string>): ProjectionEdgeDescriptor[] {
  if (!Array.isArray(input)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:type');
  const descriptors = input.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape');
    const record = value as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.source !== 'string' || typeof record.target !== 'string') {
      throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:shape');
    }
    if (!hasOnlyKeys(record, ['id', 'source', 'target'])) {
      throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:unknown-key');
    }
    return { id: record.id, source: record.source, target: record.target };
  });
  const ids = validateIds(descriptors.map(({ id }) => id), 'edgeDescriptors', true);
  if (!sameArray(ids, expectedEdgeIds)) throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:id-set');
  if (!descriptors.every(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))) {
    throw new Error('BROWSER_RENDER_INVALID_MANIFEST:edgeDescriptors:endpoint');
  }
  return descriptors;
}

function validatePreparedProjection<NodeLike>(manifest: ProjectionManifestV2, input: unknown): asserts input is PreparedBrowserProjection<NodeLike> {
  if (!input || typeof input !== 'object') throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:prepared-shape`);
  const prepared = input as Record<string, unknown>;
  if (!Array.isArray(prepared.roots) || !Array.isArray(prepared.nodeIds) || !Array.isArray(prepared.edgeIds) ||
      !Array.isArray(prepared.focusOrderNodeIds) || !Array.isArray(prepared.nodeDescriptors) || !Array.isArray(prepared.edgeDescriptors) ||
      !prepared.nodeIds.every((id) => typeof id === 'string') || !prepared.edgeIds.every((id) => typeof id === 'string') ||
      !prepared.focusOrderNodeIds.every((id) => typeof id === 'string')) {
    throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:metadata`);
  }
  rejectUnknownPreparedDescriptorKeys(prepared.nodeDescriptors, ['id', 'label', 'kind'], manifest.projection, 'nodeDescriptors');
  rejectUnknownPreparedDescriptorKeys(prepared.edgeDescriptors, ['id', 'source', 'target'], manifest.projection, 'edgeDescriptors');
  const nodeDescriptors = validateNodeDescriptors(prepared.nodeDescriptors, manifest.nodeIds);
  const edgeDescriptors = validateEdgeDescriptors(prepared.edgeDescriptors, manifest.edgeIds, new Set(manifest.nodeIds));
  if (prepared.roots.length === 0) throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${manifest.projection}:roots`);
  if (!sameArray(prepared.nodeIds as string[], manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameArray(prepared.edgeIds as string[], manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  if (!sameArray(prepared.focusOrderNodeIds as string[], manifest.focusOrderNodeIds)) throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');
  if (!sameNodeDescriptors(nodeDescriptors, manifest.nodeDescriptors)) throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  if (!sameEdgeDescriptors(edgeDescriptors, manifest.edgeDescriptors)) throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
}

function parseAndValidateThreePayload(manifest: ProjectionManifestV2): CanonicalThreePayload {
  let parsed: unknown;
  try { parsed = JSON.parse(manifest.content); }
  catch (error) { throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:malformed-json', { cause: error }); }
  if (!parsed || typeof parsed !== 'object') throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:shape');
  const payload = parsed as Record<string, unknown>;
  if (typeof payload.scene !== 'string' || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:shape');
  }

  const nodeIds = new Set<string>();
  const focusOrders = new Set<number>();
  const derivedNodes: ProjectionNodeDescriptor[] = [];
  const canonicalNodes: ThreeNodePayload[] = [];
  for (const item of payload.nodes) {
    if (!item || typeof item !== 'object') throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
    const node = item as Record<string, unknown>;
    const position = node.position;
    if (typeof node.id !== 'string' || typeof node.semanticKind !== 'string' || typeof node.label !== 'string' ||
        !position || typeof position !== 'object' || !Number.isSafeInteger(node.focusOrder) || (node.focusOrder as number) <= 0 ||
        !Array.isArray(node.capabilities) || !node.capabilities.every((capability) => typeof capability === 'string')) {
      throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
    }
    const coordinates = position as Record<string, unknown>;
    if (typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number' || typeof coordinates.z !== 'number') {
      throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
    }
    if (nodeIds.has(node.id) || focusOrders.has(node.focusOrder as number)) throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:nodes');
    nodeIds.add(node.id);
    focusOrders.add(node.focusOrder as number);
    derivedNodes.push({ id: node.id, label: node.label, kind: node.semanticKind });
    canonicalNodes.push({
      id: node.id,
      semanticKind: node.semanticKind,
      label: node.label,
      position: { x: coordinates.x, y: coordinates.y, z: coordinates.z },
      focusOrder: node.focusOrder as number,
      capabilities: [...node.capabilities] as string[]
    });
  }

  const edgeIds = new Set<string>();
  const derivedEdges: ProjectionEdgeDescriptor[] = [];
  const canonicalEdges: ThreeEdgePayload[] = [];
  for (const item of payload.edges) {
    if (!item || typeof item !== 'object') throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
    const edge = item as Record<string, unknown>;
    if (typeof edge.id !== 'string' || typeof edge.semanticKind !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string' ||
        edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error('BROWSER_RENDER_INVALID_CONTENT:three:edges');
    }
    edgeIds.add(edge.id);
    derivedEdges.push({ id: edge.id, source: edge.source, target: edge.target });
    canonicalEdges.push({ id: edge.id, semanticKind: edge.semanticKind, source: edge.source, target: edge.target });
  }

  const orderedNodeIds = [...nodeIds].sort(compareCodePoints);
  const orderedEdgeIds = [...edgeIds].sort(compareCodePoints);
  const focusOrderNodeIds = [...canonicalNodes].sort((a, b) => a.focusOrder - b.focusOrder).map(({ id }) => id);
  if (!sameArray(orderedNodeIds, manifest.nodeIds)) throw new Error('BROWSER_RENDER_NODE_IDS_MISMATCH');
  if (!sameArray(orderedEdgeIds, manifest.edgeIds)) throw new Error('BROWSER_RENDER_EDGE_IDS_MISMATCH');
  if (!sameArray(focusOrderNodeIds, manifest.focusOrderNodeIds)) throw new Error('BROWSER_RENDER_FOCUS_ORDER_MISMATCH');
  derivedNodes.sort(byDescriptorId);
  derivedEdges.sort(byDescriptorId);
  if (!sameNodeDescriptors(derivedNodes, manifest.nodeDescriptors)) throw new Error('BROWSER_RENDER_NODE_DESCRIPTORS_MISMATCH');
  if (!sameEdgeDescriptors(derivedEdges, manifest.edgeDescriptors)) throw new Error('BROWSER_RENDER_EDGE_DESCRIPTORS_MISMATCH');
  return { scene: payload.scene, nodes: canonicalNodes, edges: canonicalEdges };
}

function rejectUnknownPreparedDescriptorKeys(
  input: readonly unknown[],
  allowed: readonly string[],
  projection: ProjectionManifestV2['projection'],
  name: string
): void {
  for (const value of input) {
    if (value && typeof value === 'object' && !hasOnlyKeys(value as Record<string, unknown>, allowed)) {
      throw new Error(`BROWSER_RENDER_INVALID_CONTENT:${projection}:${name}:unknown-key`);
    }
  }
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function byDescriptorId(a: { id: string }, b: { id: string }): number { return compareCodePoints(a.id, b.id); }
function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === new Set([...left, ...right]).size; }
function sameNodeDescriptors(left: readonly ProjectionNodeDescriptor[], right: readonly ProjectionNodeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.label === right[index]?.label && value.kind === right[index]?.kind);
}
function sameEdgeDescriptors(left: readonly ProjectionEdgeDescriptor[], right: readonly ProjectionEdgeDescriptor[]): boolean {
  return left.length === right.length && left.every((value, index) => value.id === right[index]?.id && value.source === right[index]?.source && value.target === right[index]?.target);
}
