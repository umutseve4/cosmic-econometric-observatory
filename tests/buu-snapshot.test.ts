import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importBuuSnapshot, parseBuuCurriculumTsv, validateRecord } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266');
const curriculum = readFileSync(join(fixture, 'program-343-ay33.rows.tsv'), 'utf8');
const offeringText = readFileSync(join(fixture, 'offerings.json'), 'utf8');
const rawOfferings: unknown = JSON.parse(offeringText);
const snapshot = importBuuSnapshot(curriculum, rawOfferings);

const expectedAnomalyProjection: [string, string, string, string[]][] = [
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-049', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-spring-2025-2026-spring-10-feb-049', 'anomaly-duplicate-course-buu-ay33-s6-elective-ikt3306-1']],
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-050', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-spring-2025-2026-spring-10-feb-050', 'anomaly-duplicate-course-buu-ay33-s6-elective-ikt3306-1']],
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-226', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-spring-2025-2026-spring-10-feb-226']],
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-380', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-spring-2025-2026-spring-10-feb-380']],
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-381', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-spring-2025-2026-spring-10-feb-381']],
  ['offering-2025-2026-spring-2025-2026-spring-10-feb-391', 'mapped-with-anomaly', 'code-title-semester-type', ['anomaly-duplicate-course-buu-ay33-s4-required-eko2004-1']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-011', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-fall-2025-2026-fall-19-sep-011']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-112', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-fall-2025-2026-fall-19-sep-112']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-113', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-fall-2025-2026-fall-19-sep-113']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-369', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-fall-2025-2026-fall-19-sep-369']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-370', 'mapped-with-anomaly', 'title-semester-type-with-printed-code-mismatch', ['offering-printed-code-mismatch:offering-2025-2026-fall-2025-2026-fall-19-sep-370']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-415', 'mapped-with-anomaly', 'code-title-semester-type', ['anomaly-duplicate-course-buu-ay33-s7-required-eko4305-1']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-416', 'mapped-with-anomaly', 'code-title-semester-type', ['anomaly-duplicate-course-buu-ay33-s7-required-eko4305-1']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-417', 'mapped-with-anomaly', 'code-title-semester-type', ['anomaly-duplicate-course-buu-ay33-s7-required-eko4305-1']],
  ['offering-2025-2026-fall-2025-2026-fall-19-sep-418', 'mapped-with-anomaly', 'code-title-semester-type', ['anomaly-duplicate-course-buu-ay33-s7-required-eko4305-1']]
];

test('imports the exact immutable M1 census and partitions', () => {
  assert.deepEqual(snapshot.summary, { relations:144, required:41, elective:103, offerings:164, spring:83, fall:81, primary:108, secondary:56, mapped:129, 'mapped-with-anomaly':15, ambiguous:0, unmatched:20 });
  assert.equal(snapshot.curriculumRelations.length, 144);
  assert.equal(snapshot.offerings.length, 164);
});

test('all domain records pass strict contracts and references are complete', () => {
  for (const record of [...snapshot.courses, ...snapshot.curriculumRelations, ...snapshot.offerings]) assert.equal(validateRecord(record).accepted.length, 1, record.id);
  const courseIds = new Set(snapshot.courses.map((course) => course.id));
  const relationIds = new Set(snapshot.curriculumRelations.map((relation) => relation.id));
  assert.ok(snapshot.curriculumRelations.every((relation) => courseIds.has(relation.courseId)));
  assert.ok(snapshot.offerings.every((offering) => courseIds.has(offering.courseId)));
  assert.ok(snapshot.reconciliations.every((row) => row.canonicalCurriculumRelationId === null || relationIds.has(row.canonicalCurriculumRelationId)));
});

test('complete anomaly projection remains byte-for-byte explicit', () => {
  const actual = snapshot.reconciliations
    .filter((row) => row.anomalyRefs.length > 0)
    .map((row): [string, string, string, string[]] => [row.offeringId, row.status, row.reason, row.anomalyRefs]);
  assert.deepEqual(actual, expectedAnomalyProjection);
});

test('source anomalies remain literal and duplicate rows remain distinct', () => {
  const rows = parseBuuCurriculumTsv(curriculum);
  assert.equal(rows.length, 144);
  for (const code of ['EKO2004','IKT3306','EKO4305']) assert.equal(rows.filter((row) => row.courseCode === code).length, 2);
  for (const title of ['PYHTON UYGULAMALARI','ÖNRAPORLAMA TEKNİKLERİ','DOGAL KAYNAKLAR EKONOMİSİ']) assert.equal(rows.filter((row) => row.sourceTitle === title).length, 1);
  assert.ok(snapshot.anomalies.some((item) => item.id === 'anomaly-curriculum-ay33-total-ects'));
});

test('EKO1202 Mathematics II mismatch is never silently corrected', () => {
  const rows = snapshot.reconciliations.filter((row) => row.printedCode === 'EKO1202' && row.printedTitle.toLocaleUpperCase('tr-TR') === 'MATEMATİK II');
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.status === 'mapped-with-anomaly' && row.reason === 'title-semester-type-with-printed-code-mismatch' && row.anomalyRefs.some((ref) => ref === `offering-printed-code-mismatch:${row.offeringId}`)));
});

test('fixture mutation, correction, omission and deduplication are fatal', () => {
  assert.throws(() => importBuuSnapshot(curriculum.replace('PYHTON UYGULAMALARI', 'PYTHON UYGULAMALARI'), rawOfferings), /SHA-256 mismatch/);
  assert.throws(() => importBuuSnapshot(curriculum.replace(/EKO2004[^\n]*\n/u, ''), rawOfferings), /SHA-256 mismatch/);
  const offerings = structuredClone(rawOfferings) as Record<string, unknown>[];
  offerings[0] = { ...offerings[0], sourceTitle: 'MUTATED' };
  assert.throws(() => importBuuSnapshot(curriculum, offerings), /SHA-256 mismatch/);
  assert.throws(() => importBuuSnapshot(curriculum, offerings.slice(1)), /census drift/);
});

test('input object is not mutated and repeated imports are deterministic', () => {
  const before = JSON.stringify(rawOfferings);
  const again = importBuuSnapshot(curriculum, JSON.parse(offeringText));
  assert.equal(JSON.stringify(rawOfferings), before);
  assert.deepEqual(again.summary, snapshot.summary);
  assert.deepEqual(again.reconciliations, snapshot.reconciliations);
});
