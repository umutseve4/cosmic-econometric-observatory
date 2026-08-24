from pathlib import Path

source_path = Path('src/buu-snapshot.ts')
source = source_path.read_text()
old_call = "  validateReferences(courses, relations, offerings, reconciliations, anomalies);"
new_call = "  validateBuuSnapshotReferences({ courses, curriculumRelations: relations, offerings, reconciliations, anomalies });"
if source.count(old_call) != 1:
    raise SystemExit('expected validateReferences call not found exactly once')
source = source.replace(old_call, new_call)

old_validator = """function validateReferences(courses: Course[], relations: CurriculumRelation[], offerings: Offering[], reconciliations: Reconciliation[], anomalies: Anomaly[]): void {
  const unique = (ids: string[], label: string): Set<string> => { const set = new Set(ids); if (set.size !== ids.length) throw new Error(`Duplicate ${label} id`); return set; };
  const courseIds = unique(courses.map((x) => x.id), 'course'), relationIds = unique(relations.map((x) => x.id), 'relation');
  unique(offerings.map((x) => x.id), 'offering'); unique(anomalies.map((x) => x.id), 'anomaly');
  if (relations.some((x) => !courseIds.has(x.courseId)) || offerings.some((x) => !courseIds.has(x.courseId)) || reconciliations.some((x) => x.canonicalCurriculumRelationId !== null && !relationIds.has(x.canonicalCurriculumRelationId))) throw new Error('Dangling reference');
}
"""
new_validator = """export function validateBuuSnapshotReferences(snapshot: Pick<BuuSnapshot, 'courses' | 'curriculumRelations' | 'offerings' | 'reconciliations' | 'anomalies'>): void {
  const { courses, curriculumRelations: relations, offerings, reconciliations, anomalies } = snapshot;
  const unique = (ids: readonly string[], label: string): Set<string> => { const set = new Set(ids); if (set.size !== ids.length) throw new Error(`Duplicate ${label} id`); return set; };
  const courseIds = unique(courses.map((x) => x.id), 'course'), relationIds = unique(relations.map((x) => x.id), 'relation');
  const offeringIds = unique(offerings.map((x) => x.id), 'offering'), anomalyIds = unique(anomalies.map((x) => x.id), 'anomaly');
  const danglingReconciliation = reconciliations.some((row) =>
    !offeringIds.has(row.offeringId) ||
    (row.canonicalCurriculumRelationId !== null && !relationIds.has(row.canonicalCurriculumRelationId)) ||
    row.candidateCurriculumRelationIds.some((id) => !relationIds.has(id)) ||
    row.anomalyRefs.some((id) => !anomalyIds.has(id))
  );
  if (relations.some((x) => !courseIds.has(x.courseId)) || offerings.some((x) => !courseIds.has(x.courseId)) || danglingReconciliation) throw new Error('Dangling reference');
}
"""
if source.count(old_validator) != 1:
    raise SystemExit('expected validateReferences implementation not found exactly once')
source_path.write_text(source.replace(old_validator, new_validator))

test_path = Path('tests/buu-snapshot.test.ts')
tests = test_path.read_text()
old_import = "import { importBuuSnapshot, parseBuuCurriculumTsv, validateRecord } from '../src/index.js';"
new_import = "import { importBuuSnapshot, parseBuuCurriculumTsv, validateBuuSnapshotReferences, validateRecord } from '../src/index.js';"
if tests.count(old_import) != 1:
    raise SystemExit('expected test import not found exactly once')
tests = tests.replace(old_import, new_import)
tests = tests.replace(
    "const expectedAnomalyProjection: [string, string, string, string[]][] = [",
    "const expectedAnomalyProjection: (readonly [string, string, string, readonly string[]])[] = [",
)
tests = tests.replace(
    ".map((row): [string, string, string, string[]] => [row.offeringId, row.status, row.reason, row.anomalyRefs]);",
    ".map((row): readonly [string, string, string, readonly string[]] => [row.offeringId, row.status, row.reason, row.anomalyRefs]);",
)
anchor = "test('source anomalies remain literal and duplicate rows remain distinct', () => {\n"
inserted = """test('rejects a dangling reconciliation offering reference', () => {
  const reconciliations = snapshot.reconciliations.map((row, index) => index === 0 ? { ...row, offeringId: 'missing-offering' } : row);
  assert.throws(() => validateBuuSnapshotReferences({ ...snapshot, reconciliations }), /Dangling reference/);
});

test('rejects a dangling reconciliation candidate relation reference', () => {
  const reconciliations = snapshot.reconciliations.map((row, index) => index === 0 ? { ...row, candidateCurriculumRelationIds: ['missing-relation'] } : row);
  assert.throws(() => validateBuuSnapshotReferences({ ...snapshot, reconciliations }), /Dangling reference/);
});

test('rejects a dangling reconciliation anomaly reference', () => {
  const target = snapshot.reconciliations.findIndex((row) => row.anomalyRefs.length > 0);
  assert.notEqual(target, -1);
  const reconciliations = snapshot.reconciliations.map((row, index) => index === target ? { ...row, anomalyRefs: ['missing-anomaly'] } : row);
  assert.throws(() => validateBuuSnapshotReferences({ ...snapshot, reconciliations }), /Dangling reference/);
});

""" + anchor
if tests.count(anchor) != 1:
    raise SystemExit('expected test insertion anchor not found exactly once')
test_path.write_text(tests.replace(anchor, inserted))
