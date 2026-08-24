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

export interface CurriculumRelationProjection {
  id: string;
  semester: number;
  status: CurriculumRelation['status'];
  ects: number;
  poolId?: string;
}

export interface CurriculumGraphEdge extends GraphEdge {
  curriculumRelation?: CurriculumRelationProjection;
}

export interface CurriculumGraph extends KnowledgeGraph {
  schemaVersion: '1.0.0';
  compilerVersion: typeof M2_COMPILER_VERSION;
  nodes: readonly GraphNode[];
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

export function compileBuuCurriculum(snapshot: BuuSnapshot, previous?: AnchorManifestV1): CurriculumCompilation {
  validateBuuSnapshotReferences(snapshot);
  validateCompilerInput(snapshot);

  const relations = [...snapshot.curriculumRelations].sort((a, b) => compareCodePoints(a.id, b.id));
  const courses = [...snapshot.courses]
    .filter((course) => relations.some((relation) => relation.courseId === course.id))
    .sort((a, b) => compareCodePoints(a.id, b.id));
  const derivedProvenance = compilerProvenance(relations);

  const nodes: GraphNode[] = [
    { id: INSTITUTION_ID, kind: 'institution', label: 'Bursa Uludağ Üniversitesi', provenance: derivedProvenance },
    { id: PROGRAM_ID, kind: 'program', label: 'Ekonometri', provenance: derivedProvenance },
    { id: CURRICULUM_ID, kind: 'curriculum', label: '2025–2026 Ekonometri Müfredatı', provenance: derivedProvenance },
    ...courses.map((course) => ({ id: course.id, kind: 'course' as const, label: course.canonicalTitle, provenance: course.provenance }))
  ].sort(compareNodes);

  const edges: CurriculumGraphEdge[] = [
    { id: 'edge:contains:institution:buu:program:econometrics', kind: 'CONTAINS', source: INSTITUTION_ID, target: PROGRAM_ID, provenance: derivedProvenance },
    { id: 'edge:contains:program:econometrics:curriculum:2025-2026', kind: 'CONTAINS', source: PROGRAM_ID, target: CURRICULUM_ID, provenance: derivedProvenance },
    ...relations.map((relation): CurriculumGraphEdge => ({
      id: `edge:contains:${relation.id}`,
      kind: 'CONTAINS',
      source: CURRICULUM_ID,
      target: relation.courseId,
      provenance: relation.provenance,
      curriculumRelation: {
        id: relation.id,
        semester: relation.semester,
        status: relation.status,
        ects: relation.ects,
        ...(relation.poolId === undefined ? {} : { poolId: relation.poolId })
      }
    }))
  ].sort((a, b) => compareCodePoints(a.id, b.id));

  const domainIds = new Set<string>([CURRICULUM_ID, ...courses.map((course) => course.id), ...relations.map((relation) => relation.id)]);
  const anomalies = snapshot.anomalies
    .filter((anomaly) => anomaly.entityRefs.length > 0 && anomaly.entityRefs.every((id) => domainIds.has(id)))
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

  const graphHash = sha256(canonicalize(graph));
  return {
    graph,
    anchorManifest: allocateAnchors(nodes, graphHash, previous),
    routeManifest: compileRoutes(nodes, snapshot, graphHash)
  };
}

export function canonicalCompilation(compilation: CurriculumCompilation): string {
  return canonicalize(compilation);
}

function validateCompilerInput(snapshot: BuuSnapshot): void {
  if (snapshot.curriculumRelations.length === 0) throw new Error('Curriculum relation set is empty');
  assertUnique(snapshot.courses.map((course) => course.id), 'course');
  assertUnique(snapshot.curriculumRelations.map((relation) => relation.id), 'curriculum relation');
  const curriculumIds = new Set(snapshot.curriculumRelations.map((relation) => relation.curriculumVersionId));
  if (curriculumIds.size !== 1 || !curriculumIds.has(CURRICULUM_ID)) throw new Error('Unexpected curriculum identity');
  for (const course of snapshot.courses) assertProvenance(course.provenance, course.id);
  for (const relation of snapshot.curriculumRelations) assertProvenance(relation.provenance, relation.id);
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

function allocateAnchors(nodes: readonly GraphNode[], graphHash: `sha256:${string}`, previous?: AnchorManifestV1): AnchorManifestV1 {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const occupied = new Set<number>();
  const anchors = new Map<string, AnchorEntry>();

  if (previous !== undefined) {
    if (previous.schemaVersion !== ANCHOR_SCHEMA_VERSION || previous.layoutVersion !== ANCHOR_LAYOUT_VERSION || previous.compilerVersion !== M2_COMPILER_VERSION) throw new Error('Unsupported previous anchor manifest');
    assertUnique(previous.anchors.map((anchor) => anchor.nodeId), 'previous anchor node');
    assertUnique(previous.anchors.map((anchor) => anchor.anchorId), 'previous anchor');
    for (const anchor of previous.anchors) {
      const node = nodeById.get(anchor.nodeId);
      if (node === undefined) throw new Error(`Previous anchor references missing node: ${anchor.nodeId}`);
      if (anchor.anchorId !== anchorId(anchor.nodeId) || !Number.isSafeInteger(anchor.slot) || anchor.slot < 0 || anchor.slot > MAX_SLOT || occupied.has(anchor.slot)) throw new Error(`Invalid previous anchor: ${anchor.nodeId}`);
      if (canonicalize(anchor.position) !== canonicalize(positionFor(node.kind, anchor.slot))) throw new Error(`Previous anchor coordinate drift: ${anchor.nodeId}`);
      occupied.add(anchor.slot);
      anchors.set(anchor.nodeId, anchor);
    }
  }

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

function compileRoutes(nodes: readonly GraphNode[], snapshot: BuuSnapshot, graphHash: `sha256:${string}`): RouteManifestV1 {
  const courses = new Map(snapshot.courses.map((course) => [course.id, course]));
  const routes = [...nodes].sort(compareNodes).map((node): RouteEntry => {
    const course = courses.get(node.id);
    const aliases = course === undefined ? [] : [...new Set(course.codeAssignments.map((assignment) => `/v1/courses/${encodeURIComponent(assignment.value.toLowerCase())}/${encodeURIComponent(node.id)}`))].sort(compareCodePoints);
    return { nodeId: node.id, canonicalUrl: `/v1/nodes/${encodeURIComponent(node.id)}`, aliases };
  });
  assertUnique(routes.map((route) => route.canonicalUrl), 'canonical route');
  return { schemaVersion: ROUTE_SCHEMA_VERSION, compilerVersion: M2_COMPILER_VERSION, graphHash, routes };
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
    derivedFrom: relations.map((relation) => relation.id)
  };
}

function assertProvenance(provenance: Provenance, id: string): void {
  if (!provenance || typeof provenance.sourceId !== 'string' || typeof provenance.snapshotId !== 'string' || typeof provenance.locator !== 'string' || typeof provenance.observedAt !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(provenance.contentHash)) throw new Error(`Missing provenance: ${id}`);
}

function assertUnique(values: readonly (string | number)[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id`);
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
