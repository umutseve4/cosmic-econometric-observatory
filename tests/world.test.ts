import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeGraph } from '../src/graph.js';
import { canonicalScene, compileScene, project, sceneHash, validateGraph, validateRecord } from '../src/index.js';

const provenance = { sourceId: 'source:buu', snapshotId: 'snapshot:2025-2026', locator: 'fixture:miniworld', observedAt: '2026-08-24T00:00:00Z', contentHash: `sha256:${'a'.repeat(64)}` as const };
const nodes = [
  { id: 'institution:buu', kind: 'institution' as const, label: 'Bursa Uludağ University', provenance },
  { id: 'program:econometrics', kind: 'program' as const, label: 'Econometrics', provenance },
  { id: 'course:micro', kind: 'course' as const, label: 'Microeconomics', provenance },
  { id: 'topic:demand', kind: 'topic' as const, label: 'Demand', provenance },
  { id: 'lab:elasticity', kind: 'laboratory' as const, label: 'Elasticity Observatory', provenance }
];
const edges = [
  { id: 'edge:1', kind: 'CONTAINS' as const, source: 'institution:buu', target: 'program:econometrics', provenance },
  { id: 'edge:2', kind: 'INTRODUCES_CONCEPT' as const, source: 'course:micro', target: 'topic:demand', provenance },
  { id: 'edge:3', kind: 'IMPLEMENTS_IN_LAB' as const, source: 'topic:demand', target: 'lab:elasticity', provenance }
];
const graph: KnowledgeGraph = { nodes, edges };

test('Course, CurriculumRelation and Offering remain separate', () => {
  const course = { id: 'course:micro', kind: 'course', canonicalTitle: 'Microeconomics', codeAssignments: [{ value: 'IKT1001', validFrom: '2025-09-01' }], provenance };
  const relation = { id: 'relation:1', kind: 'curriculum-relation', curriculumVersionId: 'curriculum:2025', courseId: 'course:micro', semester: 1, status: 'required', ects: 6, provenance };
  const offering = { id: 'offering:1', kind: 'offering', courseId: 'course:micro', academicYear: '2025-2026', instructionType: 'primary', section: '1', provenance };
  assert.equal(validateRecord(course).accepted.length, 1);
  assert.equal(validateRecord(relation).accepted.length, 1);
  assert.equal(validateRecord(offering).accepted.length, 1);

  for (const contaminated of [
    { ...course, semester: 1 },
    { ...course, ects: 6 },
    { ...course, section: '1' },
    { ...relation, academicYear: '2025-2026' },
    { ...relation, section: '1' },
    { ...offering, canonicalTitle: 'Microeconomics' },
    { ...offering, semester: 1 }
  ]) assert.equal(validateRecord(contaminated).accepted.length, 0);

  assert.equal(validateRecord({ ...relation, status: undefined }).accepted.length, 0);
  assert.equal(validateRecord({ ...relation, status: 'sometimes' }).accepted.length, 0);
  assert.equal(validateRecord({ ...offering, instructionType: undefined }).accepted.length, 0);
  assert.equal(validateRecord({ ...offering, instructionType: 'night' }).accepted.length, 0);
});

test('records without provenance are rejected rather than repaired', () => {
  const raw = { id: 'course:raw', kind: 'course', canonicalTitle: 'PYHTON UYGULAMALARI', codeAssignments: [] };
  const result = validateRecord(raw);
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected, [raw]);
  assert.equal(result.anomalies[0]?.code, 'MISSING_PROVENANCE');
  assert.equal((result.rejected[0] as { canonicalTitle: string }).canonicalTitle, 'PYHTON UYGULAMALARI');
});

test('duplicate identifiers and dangling graph references fail validation', () => {
  assert.deepEqual(validateGraph(graph), []);
  assert.deepEqual(validateGraph({ nodes: [...nodes, nodes[0]!], edges }), ['DUPLICATE_NODE_ID']);
  assert.deepEqual(validateGraph({ nodes, edges: [...edges, edges[0]!] }), ['DUPLICATE_EDGE_ID']);
  assert.deepEqual(validateGraph({ nodes, edges: [...edges, { ...edges[0]!, id: 'edge:bad', target: 'missing' }] }), ['DANGLING_EDGE:edge:bad']);
});

test('all tested input permutations produce byte-identical Scene IR', () => {
  const withDerivedFrom = (reverse: boolean): KnowledgeGraph => ({
    nodes: (reverse ? [...nodes].reverse() : [...nodes]).map((node) => ({ ...node, provenance: { ...node.provenance, derivedFrom: reverse ? ['evidence:b', 'evidence:a'] : ['evidence:a', 'evidence:b'] } })),
    edges: (reverse ? [...edges].reverse() : [...edges]).map((edge) => ({ ...edge, provenance: { ...edge.provenance, derivedFrom: reverse ? ['evidence:b', 'evidence:a'] : ['evidence:a', 'evidence:b'] } }))
  });
  const baseline = compileScene(withDerivedFrom(false));
  const baselineBytes = canonicalScene(baseline);
  const baselineHash = sceneHash(baseline);
  for (let index = 0; index < 100; index += 1) {
    const candidate = compileScene(withDerivedFrom(index % 2 === 0));
    assert.equal(canonicalScene(candidate), baselineBytes);
    assert.equal(sceneHash(candidate), baselineHash);
  }
});

test('three, SVG and HTML projections preserve semantic parity and keyboard access', () => {
  const scene = compileScene(graph);
  const outputs = (['three', 'svg', 'html'] as const).map((kind) => project(scene, kind));
  for (const output of outputs) {
    assert.deepEqual(output.nodeIds, outputs[0]?.nodeIds);
    assert.deepEqual(output.edgeIds, outputs[0]?.edgeIds);
  }
  assert.match(outputs[1]!.content, /tabindex="0"/);
  assert.match(outputs[2]!.content, /<a href=/);
});
