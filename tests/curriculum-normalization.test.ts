import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Anomaly, BuuSnapshot, CurriculumCompilation } from '../src/index.js';
import { canonicalCompilation, compileBuuCurriculum, importBuuSnapshot } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266');
const curriculum = readFileSync(join(fixture, 'program-343-ay33.rows.tsv'), 'utf8');
const offeringText = readFileSync(join(fixture, 'offerings.json'), 'utf8');
const snapshot = importBuuSnapshot(curriculum, JSON.parse(offeringText));

function assertByteAndHashEquivalent(left: CurriculumCompilation, right: CurriculumCompilation): void {
  assert.equal(canonicalCompilation(left), canonicalCompilation(right));
  assert.equal(left.anchorManifest.graphHash, right.anchorManifest.graphHash);
  assert.equal(left.routeManifest.graphHash, right.routeManifest.graphHash);
}

function withAnomaly(anomaly: Anomaly): BuuSnapshot {
  return { ...snapshot, anomalies: [...snapshot.anomalies, anomaly] };
}

test('reordered provenance.derivedFrom compiles to byte-identical output and hash', () => {
  const target = snapshot.courses[0]!;
  const derivedFrom = ['source:z', 'source:a'];
  const baseline: BuuSnapshot = {
    ...snapshot,
    courses: snapshot.courses.map((course) => course.id === target.id
      ? { ...course, provenance: { ...course.provenance, derivedFrom } }
      : course)
  };
  const reordered: BuuSnapshot = {
    ...baseline,
    courses: baseline.courses.map((course) => course.id === target.id
      ? { ...course, provenance: { ...course.provenance, derivedFrom: [...derivedFrom].reverse() } }
      : course)
  };

  assertByteAndHashEquivalent(compileBuuCurriculum(baseline), compileBuuCurriculum(reordered));
});

test('reordered anomaly entityRefs compiles to byte-identical output and hash', () => {
  const course = snapshot.courses[0]!;
  const relation = snapshot.curriculumRelations.find((item) => item.courseId === course.id)!;
  const anomaly: Anomaly = {
    id: 'anomaly:test-entity-ref-order',
    code: 'CONFLICTING_VALUE',
    severity: 'warning',
    message: 'Permutation regression fixture',
    entityRefs: [course.id, relation.id],
    evidence: [{ field: 'semester', value: relation.semester }]
  };
  const reordered: Anomaly = { ...anomaly, entityRefs: [...anomaly.entityRefs].reverse() };

  assertByteAndHashEquivalent(compileBuuCurriculum(withAnomaly(anomaly)), compileBuuCurriculum(withAnomaly(reordered)));
});

test('reordered anomaly evidence compiles to byte-identical output and hash', () => {
  const course = snapshot.courses[0]!;
  const anomaly: Anomaly = {
    id: 'anomaly:test-evidence-order',
    code: 'CONFLICTING_VALUE',
    severity: 'warning',
    message: 'Permutation regression fixture',
    entityRefs: [course.id],
    evidence: [
      { source: 'z-source', value: 2 },
      { source: 'a-source', value: 1 }
    ]
  };
  const reordered: Anomaly = { ...anomaly, evidence: [...anomaly.evidence].reverse() };

  assertByteAndHashEquivalent(compileBuuCurriculum(withAnomaly(anomaly)), compileBuuCurriculum(withAnomaly(reordered)));
});
