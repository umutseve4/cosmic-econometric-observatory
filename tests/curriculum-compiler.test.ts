import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuuSnapshot, Course, CurriculumCompilation, CurriculumRelation } from '../src/index.js';
import { canonicalCompilation, canonicalize, compileBuuCurriculum, importBuuSnapshot } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266');
const curriculum = readFileSync(join(fixture, 'program-343-ay33.rows.tsv'), 'utf8');
const offeringText = readFileSync(join(fixture, 'offerings.json'), 'utf8');
const snapshot = importBuuSnapshot(curriculum, JSON.parse(offeringText));

function expandedSnapshot(): BuuSnapshot {
  const provenance = snapshot.curriculumRelations[0]!.provenance;
  const course: Course = { id: 'course:buu:synthetic-insertion', kind: 'course', canonicalTitle: 'Synthetic Insertion', codeAssignments: [{ value: 'SYN0001', validFrom: '2025-09-01' }], provenance };
  const relation: CurriculumRelation = { id: 'cc-course:buu:synthetic-insertion', kind: 'curriculum-relation', curriculumVersionId: 'curriculum:buu:econometrics:2025-2026', courseId: course.id, semester: 8, status: 'elective', ects: 4, poolId: 'elective-s8', provenance };
  return { ...snapshot, courses: [...snapshot.courses, course], curriculumRelations: [...snapshot.curriculumRelations, relation] };
}

function replacePrevious(previous: CurriculumCompilation, replacement: Partial<CurriculumCompilation>): CurriculumCompilation {
  return { ...previous, ...replacement };
}

test('compiles the exact source-backed M2a curriculum graph', () => {
  const result = compileBuuCurriculum(snapshot);
  const projected = result.graph.edges.filter((edge) => edge.curriculumRelation !== undefined);
  assert.equal(projected.length, 144);
  assert.equal(projected.filter((edge) => edge.curriculumRelation?.status === 'required').length, 41);
  assert.equal(projected.filter((edge) => edge.curriculumRelation?.status === 'elective').length, 103);
  assert.equal(result.graph.nodes.filter((node) => node.kind === 'course').length, 144);
  assert.equal(result.graph.nodes.length, 147);
  assert.equal(result.graph.edges.length, 146);
  assert.equal(result.anchorManifest.anchors.length, 147);
  assert.equal(result.routeManifest.routes.length, 147);
  assert.equal(result.anchorManifest.graphHash, result.routeManifest.graphHash);
  assert.ok(result.graph.anomalies.some((anomaly) => anomaly.id === 'anomaly-curriculum-ay33-total-ects'));
  assert.ok(result.graph.nodes.some((node) => node.label === 'PYHTON UYGULAMALARI'));
});

test('same input and reordered input compile to byte-identical output', () => {
  const baseline = canonicalCompilation(compileBuuCurriculum(snapshot));
  for (let index = 0; index < 20; index += 1) assert.equal(canonicalCompilation(compileBuuCurriculum(snapshot)), baseline);
  const reordered: BuuSnapshot = {
    ...snapshot,
    courses: [...snapshot.courses].reverse(),
    curriculumRelations: [...snapshot.curriculumRelations].reverse(),
    offerings: [...snapshot.offerings].reverse(),
    reconciliations: [...snapshot.reconciliations].reverse(),
    anomalies: [...snapshot.anomalies].reverse()
  };
  assert.equal(canonicalCompilation(compileBuuCurriculum(reordered)), baseline);
});

test('synthetic insertion preserves every unaffected anchor, coordinate and canonical URL byte-for-byte', () => {
  const baseline = compileBuuCurriculum(snapshot);
  const next = compileBuuCurriculum(expandedSnapshot(), baseline);
  const nextAnchors = new Map(next.anchorManifest.anchors.map((anchor) => [anchor.nodeId, anchor]));
  const nextRoutes = new Map(next.routeManifest.routes.map((route) => [route.nodeId, route]));
  for (const anchor of baseline.anchorManifest.anchors) assert.deepEqual(nextAnchors.get(anchor.nodeId), anchor);
  for (const route of baseline.routeManifest.routes) assert.deepEqual(nextRoutes.get(route.nodeId), route);
  assert.equal(next.anchorManifest.anchors.length, baseline.anchorManifest.anchors.length + 1);
  assert.equal(next.routeManifest.routes.length, baseline.routeManifest.routes.length + 1);
});

test('canonical routes use persistent IDs and human course codes are aliases only', () => {
  const result = compileBuuCurriculum(snapshot);
  const course = snapshot.courses.find((item) => item.codeAssignments[0]?.value === 'EKO3310')!;
  const route = result.routeManifest.routes.find((item) => item.nodeId === course.id)!;
  assert.equal(route.canonicalUrl, `/v1/nodes/${encodeURIComponent(course.id)}`);
  assert.deepEqual(route.aliases, [`/v1/courses/eko3310/${encodeURIComponent(course.id)}`]);
});

test('compiler does not mutate M1 courses, relations, offerings or reconciliation', () => {
  const before = canonicalize(snapshot);
  const offerings = canonicalize(snapshot.offerings);
  const reconciliations = canonicalize(snapshot.reconciliations);
  compileBuuCurriculum(snapshot);
  assert.equal(canonicalize(snapshot), before);
  assert.equal(canonicalize(snapshot.offerings), offerings);
  assert.equal(canonicalize(snapshot.reconciliations), reconciliations);
  assert.equal(snapshot.offerings.length, 164);
});

test('duplicate, dangling and malformed provenance inputs are fatal', () => {
  assert.throws(() => compileBuuCurriculum({ ...snapshot, courses: [...snapshot.courses, snapshot.courses[0]!] }), /Duplicate course/);
  assert.throws(() => compileBuuCurriculum({ ...snapshot, curriculumRelations: snapshot.curriculumRelations.map((relation, index) => index === 0 ? { ...relation, courseId: 'missing-course' } : relation) }), /Dangling reference/);

  const badHash = { ...snapshot.courses[0]!, provenance: { ...snapshot.courses[0]!.provenance, contentHash: 'sha256:bad' as `sha256:${string}` } };
  assert.throws(() => compileBuuCurriculum({ ...snapshot, courses: [badHash, ...snapshot.courses.slice(1)] }), /Invalid provenance hash/);

  const emptySource = snapshot.curriculumRelations.map((relation, index) => index === 0 ? { ...relation, provenance: { ...relation.provenance, sourceId: '' } } : relation);
  assert.throws(() => compileBuuCurriculum({ ...snapshot, curriculumRelations: emptySource }), /Incomplete provenance/);

  const badTime = snapshot.curriculumRelations.map((relation, index) => index === 0 ? { ...relation, provenance: { ...relation.provenance, observedAt: 'not-a-date' } } : relation);
  assert.throws(() => compileBuuCurriculum({ ...snapshot, curriculumRelations: badTime }), /Invalid provenance timestamp/);

  const mixed = snapshot.curriculumRelations.map((relation, index) => index === 0 ? { ...relation, provenance: { ...relation.provenance, snapshotId: 'snapshot:other' } } : relation);
  assert.throws(() => compileBuuCurriculum({ ...snapshot, curriculumRelations: mixed }), /Mixed curriculum source provenance/);
});

test('dangling anomaly references are fatal while known out-of-domain offering anomalies are excluded', () => {
  const baseAnomaly = snapshot.anomalies[0]!;
  const dangling = { ...baseAnomaly, id: 'anomaly:test-dangling', entityRefs: ['missing-entity'] };
  assert.throws(() => compileBuuCurriculum({ ...snapshot, anomalies: [...snapshot.anomalies, dangling] }), /Dangling anomaly reference/);

  const offeringOnly = { ...baseAnomaly, id: 'anomaly:test-offering-only', entityRefs: [snapshot.offerings[0]!.id] };
  const result = compileBuuCurriculum({ ...snapshot, anomalies: [...snapshot.anomalies, offeringOnly] });
  assert.equal(result.graph.anomalies.some((anomaly) => anomaly.id === offeringOnly.id), false);
});

test('missing or tampered previous graph, anchor and route history is fatal', () => {
  const baseline = compileBuuCurriculum(snapshot);

  const missingAnchor = replacePrevious(baseline, { anchorManifest: { ...baseline.anchorManifest, anchors: baseline.anchorManifest.anchors.slice(1) } });
  assert.throws(() => compileBuuCurriculum(snapshot, missingAnchor), /graph\/anchor node-set mismatch/);

  const changedHash = replacePrevious(baseline, { anchorManifest: { ...baseline.anchorManifest, graphHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' } });
  assert.throws(() => compileBuuCurriculum(snapshot, changedHash), /hash mismatch/);

  const changedGraph = replacePrevious(baseline, { graph: { ...baseline.graph, nodes: baseline.graph.nodes.map((node, index) => index === 0 ? { ...node, label: `${node.label} tampered` } : node) } });
  assert.throws(() => compileBuuCurriculum(snapshot, changedGraph), /hash mismatch/);

  const movedAnchor = replacePrevious(baseline, { anchorManifest: { ...baseline.anchorManifest, anchors: baseline.anchorManifest.anchors.map((anchor, index) => index === 0 ? { ...anchor, position: { ...anchor.position, x: anchor.position.x + 1 } } : anchor) } });
  assert.throws(() => compileBuuCurriculum(snapshot, movedAnchor), /coordinate drift/);

  const missingRoute = replacePrevious(baseline, { routeManifest: { ...baseline.routeManifest, routes: baseline.routeManifest.routes.slice(1) } });
  assert.throws(() => compileBuuCurriculum(snapshot, missingRoute), /graph\/route node-set mismatch/);

  const changedRoute = replacePrevious(baseline, { routeManifest: { ...baseline.routeManifest, routes: baseline.routeManifest.routes.map((route, index) => index === 0 ? { ...route, canonicalUrl: '/tampered' } : route) } });
  assert.throws(() => compileBuuCurriculum(snapshot, changedRoute), /route drift/);
});

test('insertion-only history rejects removal of a previously compiled node', () => {
  const expanded = expandedSnapshot();
  const expandedCompilation = compileBuuCurriculum(expanded);
  assert.throws(() => compileBuuCurriculum(snapshot, expandedCompilation), /removed node/);
});
