import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuuSnapshot, Course, CurriculumRelation } from '../src/index.js';
import { canonicalCompilation, canonicalize, compileBuuCurriculum, importBuuSnapshot } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266');
const curriculum = readFileSync(join(fixture, 'program-343-ay33.rows.tsv'), 'utf8');
const offeringText = readFileSync(join(fixture, 'offerings.json'), 'utf8');
const snapshot = importBuuSnapshot(curriculum, JSON.parse(offeringText));

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

test('synthetic insertion preserves every unaffected anchor, coordinate and canonical URL', () => {
  const baseline = compileBuuCurriculum(snapshot);
  const provenance = snapshot.curriculumRelations[0]!.provenance;
  const course: Course = { id: 'course:buu:synthetic-insertion', kind: 'course', canonicalTitle: 'Synthetic Insertion', codeAssignments: [{ value: 'SYN0001', validFrom: '2025-09-01' }], provenance };
  const relation: CurriculumRelation = { id: 'cc-course:buu:synthetic-insertion', kind: 'curriculum-relation', curriculumVersionId: 'curriculum:buu:econometrics:2025-2026', courseId: course.id, semester: 8, status: 'elective', ects: 4, poolId: 'elective-s8', provenance };
  const expanded: BuuSnapshot = { ...snapshot, courses: [...snapshot.courses, course], curriculumRelations: [...snapshot.curriculumRelations, relation] };
  const next = compileBuuCurriculum(expanded, baseline.anchorManifest);
  const nextAnchors = new Map(next.anchorManifest.anchors.map((anchor) => [anchor.nodeId, anchor]));
  const nextRoutes = new Map(next.routeManifest.routes.map((route) => [route.nodeId, route]));
  for (const anchor of baseline.anchorManifest.anchors) assert.deepEqual(nextAnchors.get(anchor.nodeId), anchor);
  for (const route of baseline.routeManifest.routes) assert.equal(nextRoutes.get(route.nodeId)?.canonicalUrl, route.canonicalUrl);
  assert.equal(next.anchorManifest.anchors.length, baseline.anchorManifest.anchors.length + 1);
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

test('duplicate, dangling, missing-provenance and tampered-manifest inputs are fatal', () => {
  assert.throws(() => compileBuuCurriculum({ ...snapshot, courses: [...snapshot.courses, snapshot.courses[0]!] }), /Duplicate course/);
  assert.throws(() => compileBuuCurriculum({ ...snapshot, curriculumRelations: snapshot.curriculumRelations.map((relation, index) => index === 0 ? { ...relation, courseId: 'missing-course' } : relation) }), /Dangling reference/);
  const missingProvenance = { ...snapshot.courses[0]!, provenance: { ...snapshot.courses[0]!.provenance, contentHash: 'sha256:bad' as `sha256:${string}` } };
  assert.throws(() => compileBuuCurriculum({ ...snapshot, courses: [missingProvenance, ...snapshot.courses.slice(1)] }), /Missing provenance/);
  const baseline = compileBuuCurriculum(snapshot);
  const anchorManifest = { ...baseline.anchorManifest, anchors: baseline.anchorManifest.anchors.map((anchor, index) => index === 0 ? { ...anchor, position: { ...anchor.position, x: anchor.position.x + 1 } } : anchor) };
  assert.throws(() => compileBuuCurriculum(snapshot, anchorManifest), /coordinate drift/);
});
