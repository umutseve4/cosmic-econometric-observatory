import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileBuuCurriculum, compileScene, compareCodePoints, importBuuSnapshot, validateGraph } from '../dist/src/index.js';

const FIXTURE = 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266';
const CURRICULUM_ID = 'curriculum:buu:econometrics:2025-2026';
const EXPECTED = Object.freeze({
  nodes: 147, edges: 146, curriculum_relations: 144, required: 41, elective: 103,
  duplicate_stable_ids: 0, dangling_edges: 0, missing_required_provenance: 0,
  schema_validation_errors: 0, silent_fallbacks: 0
});

export function buildBrowserArtifact(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const curriculum = readFileSync(join(root, FIXTURE, 'program-343-ay33.rows.tsv'), 'utf8');
  const offerings = JSON.parse(readFileSync(join(root, FIXTURE, 'offerings.json'), 'utf8'));
  const snapshot = importBuuSnapshot(curriculum, offerings);
  const compilation = compileBuuCurriculum(snapshot);
  const graph = compilation.graph;
  const graphErrors = validateGraph(graph);
  if (graphErrors.length !== 0) throw new Error(`BROWSER_ARTIFACT_INVALID_GRAPH:${graphErrors.join(',')}`);

  const nodeIds = graph.nodes.map(({ id }) => id);
  const duplicateStableIds = nodeIds.length - new Set(nodeIds).size;
  const nodeRegistry = new Set(nodeIds);
  const danglingEdges = graph.edges.filter(({ source, target }) => !nodeRegistry.has(source) || !nodeRegistry.has(target)).length;
  const curriculumEdges = graph.edges.filter(({ curriculumRelation }) => curriculumRelation !== undefined);
  const missingRequiredProvenance = [...graph.nodes, ...graph.edges].filter(({ provenance }) =>
    !provenance || !provenance.sourceId || !provenance.snapshotId || !provenance.locator ||
    !provenance.observedAt || !/^sha256:[0-9a-f]{64}$/u.test(provenance.contentHash)
  ).length;
  const oracle = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    curriculum_relations: curriculumEdges.length,
    required: curriculumEdges.filter(({ curriculumRelation }) => curriculumRelation.status === 'required').length,
    elective: curriculumEdges.filter(({ curriculumRelation }) => curriculumRelation.status === 'elective').length,
    duplicate_stable_ids: duplicateStableIds,
    dangling_edges: danglingEdges,
    missing_required_provenance: missingRequiredProvenance,
    schema_validation_errors: graphErrors.length,
    silent_fallbacks: 0
  };
  if (JSON.stringify(oracle) !== JSON.stringify(EXPECTED)) throw new Error(`BROWSER_ARTIFACT_ORACLE_DRIFT:${JSON.stringify(oracle)}`);
  assertConnectedTree(graph.nodes[0]?.id, graph.edges, nodeRegistry);

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const courses = curriculumEdges.map((edge) => {
    const node = nodeById.get(edge.target);
    if (!node || node.kind !== 'course' || !edge.curriculumRelation) throw new Error(`BROWSER_ARTIFACT_COURSE_DRIFT:${edge.id}`);
    const code = node.codeAssignments?.[0]?.value;
    if (!code) throw new Error(`BROWSER_ARTIFACT_MISSING_CODE:${node.id}`);
    return {
      id: node.id,
      code,
      title: node.label,
      semester: edge.curriculumRelation.semester,
      status: edge.curriculumRelation.status,
      ects: edge.curriculumRelation.ects,
      poolId: edge.curriculumRelation.poolId ?? null,
      relationId: edge.curriculumRelation.id,
      provenance: node.provenance
    };
  }).sort((left, right) => compareCodePoints(`${left.code}:${left.id}`, `${right.code}:${right.id}`));

  return {
    schemaVersion: '1.0.0',
    curriculumId: CURRICULUM_ID,
    compilerVersion: graph.compilerVersion,
    graphHash: compilation.anchorManifest.graphHash,
    oracle,
    scene: compileScene(graph, 'buu-econometrics-2025-2026', 'radial-v1'),
    courses
  };
}

export function generateBrowserArtifact(repositoryRoot, destination) {
  const artifact = buildBrowserArtifact(repositoryRoot);
  writeFileSync(destination, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return artifact;
}

function assertConnectedTree(rootId, edges, nodeRegistry) {
  if (!rootId || edges.length !== nodeRegistry.size - 1) throw new Error('BROWSER_ARTIFACT_NOT_TREE');
  const adjacency = new Map([...nodeRegistry].map((id) => [id, []]));
  for (const edge of edges) {
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) for (const next of adjacency.get(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  if (seen.size !== nodeRegistry.size) throw new Error('BROWSER_ARTIFACT_DISCONNECTED');
}
