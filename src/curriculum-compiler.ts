import { createHash } from 'node:crypto';
import { canonicalize, compareCodePoints } from './canonical.js';
import type { Anomaly, CurriculumRelation, Provenance } from './contracts.js';
import type { BuuSnapshot } from './buu-snapshot.js';
import { validateBuuSnapshotReferences } from './buu-snapshot.js';
import type { GraphEdge, GraphNode, KnowledgeGraph, NodeKind } from './graph.js';
import { validateGraph } from './graph.js';
import type { Position } from './scene.js';

export const M2_COMPILER_VERSION = 'm2a-curriculum-compiler-v1' as const;
export const ANCHOR_SCHEMA_VERSION = '1.0.0' as const;
export const ROUTE_SCHEMA_VERSION = '1.0.0' as const;
export const ANCHOR_LAYOUT_VERSION = 'content-addressed-slots-v1' as const;

const INSTITUTION_ID = 'institution:buu';
const PROGRAM_ID = 'program:buu:econometrics';
const CURRICULUM_ID = 'curriculum:buu:econometrics:2025-2026';
const MAX_SLOT = 0x0f_ffff_ffff_ffff;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export interface CurriculumRelationProjection {
  id: string;
  semester: number;
  status: CurriculumRelation['status'];
  ects: number;
  poolId?: string;
}

export interface CurriculumGraphNode extends GraphNode {
  codeAssignments?: readonly { value: string; validFrom: string; validTo?: string }[];
}

export interface CurriculumGraphEdge extends GraphEdge {
  curriculumRelation?: CurriculumRelationProjection;
}

export interface CurriculumGraph extends KnowledgeGraph {
  schemaVersion: '1.0.0';
  compilerVersion: typeof M2_COMPILER_VERSION;
  nodes: readonly CurriculumGraphNode[];
  edges: readonly CurriculumGraphEdge[];
  anomalies: readonly Anomaly[];
}

export interface AnchorEntry {
  nodeId: string;
  anchorId: string;
  slot: number;
  position: Position;
}

export interface AnchorManifestV1 {
  schemaVersion: typeof ANCHOR_SCHEMA_VERSION;
  layoutVersion: typeof ANCHOR_LAYOUT_VERSION;
  compilerVersion: typeof M2_COMPILER_VERSION;
  graphHash: `sha256:${string}`;
  anchors: readonly AnchorEntry[];
}

export interface RouteEntry {
  nodeId: string;
  canonicalUrl: string;
  aliases: readonly string[];
}

export interface RouteManifestV1 {
  schemaVersion: typeof ROUTE_SCHEMA_VERSION;
  compilerVersion: typeof M2_COMPILER_VERSION;
  graphHash: `sha256:${string}`;
  routes: readonly RouteEntry[];
}

export interface CurriculumCompilation {
  graph: CurriculumGraph;
  anchorManifest: AnchorManifestV1;
  routeManifest: RouteManifestV1;
}

export function compileBuuCurriculum(snapshot: BuuSnapshot, previous?: CurriculumCompilation): CurriculumCompilation {
  validateBuuSnapshotReferences(snapshot);
  validateCompilerInput(snapshot);
  if (previous !== undefined) validatePreviousCompilation(previous);

  const relations = [...snapshot.curriculumRelations].sort((a, b) => compareCodePoints(a.id, b.id));
  const relationCourseIds = new Set(relations.map((relation) => relation.courseId));
  const courses = [...snapshot.courses]
    .filter((course) => relationCourseIds.has(course.id))
    .sort((a, b) => compareCodePoints(a.id, b.id));
  if (courses.length !== relationCourseIds.size) throw new Error('Curriculum relation references an unavailable course');
  const derivedProvenance = compilerProvenance(relations);

  const nodes: CurriculumGraphNode[] = [
    { id: INSTITUTION_ID, kind: 'institution', label: 'Bursa Uludağ Üniversitesi', provenance: derivedProvenance },
    { id: PROGRAM_ID, kind: 'program', label: 'Ekonometri', provenance: derivedProvenance },
    { id: CURRICULUM_ID, kind: 'curriculum', label: '2025–2026 Ekonometri Müfredatı', provenance: derivedProvenance },
    ...courses.map((course): CurriculumGraphNode => ({
      id: course.id,
      kind: 'course',
      label: course.canonicalTitle,
      provenance: normalizeProvenance(course.provenance),
      codeAssignments: sortCanonical(course.codeAssignments).map((assignment) => ({ ...assignment }))
    }))
  ];
  nodes.sort(compareNodes);

  const edges: CurriculumGraphEdge[] = [
    { id: 'edge:contains:institution:buu:program:econometrics', kind: 'CONTAINS', source: INSTITUTION_ID, target: PROGRAM_ID, provenance: derivedProvenance },
    { id: 'edge:contains:program:econometrics:curriculum:2025-2026', kind: 'CONTAINS', source: PROGRAM_ID, target: CURRICULUM_ID, provenance: derivedProvenance },
    ...relations.map((relation): CurriculumGraphEdge => ({
      id: `edge:contains:${relation.id}`,
      kind: 'CONTAINS',
      source: CURRICULUM_ID,
      target: relation.courseId,
      provenance: normalizeProvenance(relation.provenance),
      curriculumRelation: {
        id: relation.id,
        semester: relation.semester,
        status: relation.status,
        ects: relation.ects,
        ...(relation.poolId === undefined ? {} : { poolId: relation.poolId })
      }
    }))
  ];
  edges.sort((a, b) => compareCodePoints(a.id, b.id));

  const domainIds = new Set<string>([CURRICULUM_ID, ...courses.map((course) => course.id), ...relations.map((relation) => relation.id)]);
  const anomalies = snapshot.anomalies
    .filter((anomaly) => anomaly.entityRefs.length > 0 && anomaly.entityRefs.every((id) => domainIds.has(id)))
    .map(normalizeAnomaly)
    .sort((a, b) => compareCodePoints(a.id, b.id));
  assertUnique(anomalies.map((anomaly) => anomaly.id), 'anomaly');

  const graph: CurriculumGraph = {
    schemaVersion: '1.0.0',
    compilerVersion: M2_COMPILER_VERSION,
    nodes,
    edges,
    anomalies
  };
  const graphErrors = validateGraph(graph);
  if (graphErrors.length > 0) throw new Error(`Invalid curriculum graph: ${graphErrors.join(',')}`);
  validateGraphProjection(graph, relations);
  if (previous !== undefined) assertInsertionOnlyEvolution(previous.graph, graph);

  const graphHash = sha256(canonicalize(graph));
  return {
    graph,
    anchorManifest: allocateAnchors(nodes, graphHash, previous?.anchorManifest),
    routeManifest: compileRoutes(nodes, graphHash)
  };
}

export function canonicalCompilation(compilation: CurriculumCompilation): string {
  return canonicalize(compilation);
}

function validateCompilerInput(snapshot: BuuSnapshot): void {
  if (snapshot.curriculumRelations.length === 0) throw new Error('Curriculum relation set is empty');
  const courseIds = assertUnique(snapshot.courses.map((course) => course.id), 'course');
  assertUnique(snapshot.curriculumRelations.map((relation) => relation.id), 'curriculum relation');
  const offeringIds = assertUnique(snapshot.offerings.map((offering) => offering.id), 'offering');
  const anomalyIds = assertUnique(snapshot.anomalies.map((anomaly) => anomaly.id), 'anomaly');
  const knownIds = new Set<string>([INSTITUTION_ID, PROGRAM_ID, CURRICULUM_ID, ...courseIds, ...offeringIds, ...anomalyIds, ...snapshot.curriculumRelations.map((relation) => relation.id)]);
  for (const anomaly of snapshot.anomalies) {
    if (anomaly.entityRefs.some((reference) => !knownIds.has(reference))) throw new Error(`Dangling anomaly reference: ${anomaly.id}`);
  }

  const curriculumIds = new Set(snapshot.curriculumRelations.map((relation) => relation.curriculumVersionId));
  if (curriculumIds.size !== 1 || !curriculumIds.has(CURRICULUM_ID)) throw new Error('Unexpected curriculum identity');
  for (const course of snapshot.courses) assertProvenance(course.provenance, course.id);
  for (const relation of snapshot.curriculumRelations) {
    assertProvenance(relation.provenance, relation.id);
    if (!courseIds.has(relation.courseId)) throw new Error(`Dangling curriculum relation: ${relation.id}`);
  }

  const expectedSource = sourceTuple(snapshot.curriculumRelations[0]!.provenance);
  for (const relation of snapshot.curriculumRelations) {
    if (sourceTuple(relation.provenance) !== expectedSource) throw new Error(`Mixed curriculum source provenance: ${relation.id}`);
  }
  const graphCourseIds = new Set(snapshot.curriculumRelations.map((relation) => relation.courseId));
  for (const course of snapshot.courses) {
    if (graphCourseIds.has(course.id) && sourceTuple(course.provenance) !== expectedSource) throw new Error(`Mixed curriculum source provenance: ${course.id}`);
  }
}

function validatePreviousCompilation(previous: CurriculumCompilation): void {
  if (previous.graph.schemaVersion !== '1.0.0' || previous.graph.compilerVersion !== M2_COMPILER_VERSION) throw new Error('Unsupported previous graph contract');
  const graphErrors = validateGraph(previous.graph);
  if (graphErrors.length > 0) throw new Error(`Invalid previous graph: ${graphErrors.join(',')}`);
  const graphHash = sha256(canonicalize(previous.graph));
  if (previous.anchorManifest.schemaVersion !== ANCHOR_SCHEMA_VERSION || previous.anchorManifest.layoutVersion !== ANCHOR_LAYOUT_VERSION || previous.anchorManifest.compilerVersion !== M2_COMPILER_VERSION) throw new Error('Unsupported previous anchor manifest');
  if (previous.routeManifest.schemaVersion !== ROUTE_SCHEMA_VERSION || previous.routeManifest.compilerVersion !== M2_COMPILER_VERSION) throw new Error('Unsupported previous route manifest');
  if (previous.anchorManifest.graphHash !== graphHash || previous.routeManifest.graphHash !== graphHash) throw new Error('Previous graph/manifests hash mismatch');

  const graphIds = assertUnique(previous.graph.nodes.map((node) => node.id), 'previous graph node');
  const anchorIds = assertUnique(previous.anchorManifest.anchors.map((anchor) => anchor.nodeId), 'previous anchor node');
  const routeIds = assertUnique(previous.routeManifest.routes.map((route) => route.nodeId), 'previous route node');
  assertSameSet(graphIds, anchorIds, 'Previous graph/anchor node-set mismatch');
  assertSameSet(graphIds, routeIds, 'Previous graph/route node-set mismatch');

  const nodeById = new Map(previous.graph.nodes.map((node) => [node.id, node]));
  const occupied = new Set<number>();
  for (const anchor of previous.anchorManifest.anchors) {
    const node = nodeById.get(anchor.nodeId)!;
    if (anchor.anchorId !== anchorId(anchor.nodeId) || !Number.isSafeInteger(anchor.slot) || anchor.slot < 0 || anchor.slot > MAX_SLOT || occupied.has(anchor.slot)) throw new Error(`Invalid previous anchor: ${anchor.nodeId}`);
    occupied.add(anchor.slot);
    if (canonicalize(anchor.position) !== canonicalize(positionFor(node.kind, anchor.slot))) throw new Error(`Previous anchor coordinate drift: ${anchor.nodeId}`);
  }
  for (const route of previous.routeManifest.routes) validatePreviousRoute(nodeById.get(route.nodeId)!, route);
}

function assertInsertionOnlyEvolution(previous: CurriculumGraph, current: CurriculumGraph): void {
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node] as const));
  for (const node of previous.nodes) {
    const retained = currentNodes.get(node.id);
    if (retained === undefined) throw new Error(`Insertion-only history removed node: ${node.id}`);
    if (node.kind === 'course') {
      const retainedAssignments = new Set((retained.codeAssignments ?? []).map((assignment) => canonicalize(assignment)));
      if ((node.codeAssignments ?? []).some((assignment) => !retainedAssignments.has(canonicalize(assignment)))) {
        throw new Error(`Insertion-only history changed course assignment history: ${node.id}`);
      }
    }
    if (canonicalize(immutableNodeSemantics(retained)) !== canonicalize(immutableNodeSemantics(node))) throw new Error(`Insertion-only history changed node: ${node.id}`);
  }

  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge] as const));
  for (const edge of previous.edges) {
    const retained = currentEdges.get(edge.id);
    if (retained === undefined) throw new Error(`Insertion-only history removed edge: ${edge.id}`);
    if (canonicalize(retained) !== canonicalize(edge)) throw new Error(`Insertion-only history changed edge: ${edge.id}`);
  }

  const currentAnomalies = new Map(current.anomalies.map((anomaly) => [anomaly.id, anomaly] as const));
  for (const anomaly of previous.anomalies) {
    const retained = currentAnomalies.get(anomaly.id);
    if (retained === undefined) throw new Error(`Insertion-only history removed anomaly: ${anomaly.id}`);
    if (canonicalize(retained) !== canonicalize(anomaly)) throw new Error(`Insertion-only history changed anomaly: ${anomaly.id}`);
  }
}

function validateGraphProjection(graph: CurriculumGraph, relations: readonly CurriculumRelation[]): void {
  const projected = graph.edges.filter((edge) => edge.curriculumRelation !== undefined);
  if (projected.length !== relations.length) throw new Error('Curriculum relation projection count drift');
  const byId = new Map(projected.map((edge) => [edge.curriculumRelation!.id, edge.curriculumRelation!]));
  if (byId.size !== relations.length) throw new Error('Duplicate curriculum relation projection');
  for (const relation of relations) {
    const actual = byId.get(relation.id);
    const expected: CurriculumRelationProjection = {
      id: relation.id,
      semester: relation.semester,
      status: relation.status,
      ects: relation.ects,
      ...(relation.poolId === undefined ? {} : { poolId: relation.poolId })
    };
    if (canonicalize(actual) !== canonicalize(expected)) throw new Error(`Curriculum relation projection drift: ${relation.id}`);
  }
}

function allocateAnchors(nodes: readonly CurriculumGraphNode[], graphHash: `sha256:${string}`, previous?: AnchorManifestV1): AnchorManifestV1 {
  const occupied = new Set(previous?.anchors.map((anchor) => anchor.slot) ?? []);
  const anchors = new Map(previous?.anchors.map((anchor) => [anchor.nodeId, anchor] as const) ?? []);
  for (const node of [...nodes].sort(compareNodes)) {
    if (anchors.has(node.id)) continue;
    let slot = initialSlot(node.id);
    while (occupied.has(slot)) slot = slot === MAX_SLOT ? 0 : slot + 1;
    occupied.add(slot);
    anchors.set(node.id, { nodeId: node.id, anchorId: anchorId(node.id), slot, position: positionFor(node.kind, slot) });
  }
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    layoutVersion: ANCHOR_LAYOUT_VERSION,
    compilerVersion: M2_COMPILER_VERSION,
    graphHash,
    anchors: [...anchors.values()].sort((a, b) => compareCodePoints(a.nodeId, b.nodeId))
  };
}

function compileRoutes(nodes: readonly CurriculumGraphNode[], graphHash: `sha256:${string}`): RouteManifestV1 {
  const routes = [...nodes].sort(compareNodes).map(routeFor);
  assertUnique(routes.map((route) => route.canonicalUrl), 'canonical route');
  return { schemaVersion: ROUTE_SCHEMA_VERSION, compilerVersion: M2_COMPILER_VERSION, graphHash, routes };
}

function routeFor(node: CurriculumGraphNode): RouteEntry {
  const aliases = node.kind === 'course'
    ? [...new Set((node.codeAssignments ?? []).map((assignment) => `/v1/courses/${encodeURIComponent(assignment.value.toLowerCase())}/${encodeURIComponent(node.id)}`))].sort(compareCodePoints)
    : [];
  return { nodeId: node.id, canonicalUrl: `/v1/nodes/${encodeURIComponent(node.id)}`, aliases };
}

function validatePreviousRoute(node: CurriculumGraphNode, route: RouteEntry): void {
  if (canonicalize(route) !== canonicalize(routeFor(node))) throw new Error(`Previous route drift: ${route.nodeId}`);
}

function immutableNodeSemantics(node: CurriculumGraphNode): object {
  if (node.kind !== 'course') return node;
  const { label: _label, codeAssignments: _codeAssignments, ...immutable } = node;
  return immutable;
}

function normalizeProvenance(provenance: Provenance): Provenance {
  const normalized = { ...provenance };
  if (provenance.derivedFrom !== undefined) normalized.derivedFrom = [...provenance.derivedFrom].sort(compareCodePoints);
  return normalized;
}

function normalizeAnomaly(anomaly: Anomaly): Anomaly {
  return {
    ...anomaly,
    entityRefs: [...anomaly.entityRefs].sort(compareCodePoints),
    evidence: sortCanonical(anomaly.evidence)
  };
}

function sortCanonical<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => compareCodePoints(canonicalize(a), canonicalize(b)));
}

function compilerProvenance(relations: readonly CurriculumRelation[]): Provenance {
  const source = relations[0]!.provenance;
  return {
    sourceId: source.sourceId,
    snapshotId: source.snapshotId,
    locator: 'compiler:m2a#institution-program-curriculum',
    observedAt: source.observedAt,
    contentHash: source.contentHash,
    transformationVersion: M2_COMPILER_VERSION,
    derivedFrom: [source.snapshotId]
  };
}

function assertProvenance(provenance: Provenance, id: string): void {
  const required = [provenance.sourceId, provenance.snapshotId, provenance.locator, provenance.observedAt, provenance.transformationVersion];
  if (required.some((value) => typeof value !== 'string' || value.trim().length === 0)) throw new Error(`Incomplete provenance: ${id}`);
  if (!SHA256.test(provenance.contentHash)) throw new Error(`Invalid provenance hash: ${id}`);
  if (!Number.isFinite(Date.parse(provenance.observedAt))) throw new Error(`Invalid provenance timestamp: ${id}`);
}

function sourceTuple(provenance: Provenance): string {
  return canonicalize({ sourceId: provenance.sourceId, snapshotId: provenance.snapshotId, observedAt: provenance.observedAt, contentHash: provenance.contentHash, transformationVersion: provenance.transformationVersion });
}

function assertUnique<T extends string | number>(values: readonly T[], label: string): Set<T> {
  const result = new Set(values);
  if (result.size !== values.length) throw new Error(`Duplicate ${label} id`);
  return result;
}

function assertSameSet(expected: ReadonlySet<string>, actual: ReadonlySet<string>, message: string): void {
  if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) throw new Error(message);
}

function compareNodes(a: GraphNode, b: GraphNode): number {
  return compareCodePoints(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`);
}

function initialSlot(nodeId: string): number {
  return Number.parseInt(createHash('sha256').update(nodeId).digest('hex').slice(0, 13), 16);
}

function anchorId(nodeId: string): string {
  return `anchor:v1:${nodeId}`;
}

function positionFor(kind: NodeKind, slot: number): Position {
  const angle = (slot / (MAX_SLOT + 1)) * 2 * Math.PI;
  const ring = ({ institution: 0, program: 2, curriculum: 4, course: 6, topic: 8, laboratory: 10, source: 12 } as Record<NodeKind, number>)[kind];
  return { x: round(ring * Math.cos(angle)), y: round(((slot % 17) - 8) / 8), z: round(ring * Math.sin(angle)) };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
