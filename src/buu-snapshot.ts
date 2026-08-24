import { createHash } from 'node:crypto';
import type { Anomaly, Course, CurriculumRelation, Offering, Provenance } from './contracts.js';

const CURRICULUM_ID = 'curriculum:buu:econometrics:2025-2026';
const CURRICULUM_HASH = '1a3fb51034a6dcb88cc8f2680cbe560dbfc971be011e1d854d09839b3e289454';
const OFFERINGS_HASH = '701d88adf6c24c0ae4a3e9cc3db98a225b8e9634164c0351bb5dd39fccbd3ca2';
const OBSERVED_AT = '2026-08-23T19:03:28Z';
const VERSION = 'm1-buu-snapshot-v1';

type CourseType = 'required' | 'elective';
export type MappingStatus = 'mapped' | 'mapped-with-anomaly' | 'ambiguous' | 'unmatched';
export type MappingReason = 'code-title-semester-type' | 'multiple-exact-composite-matches' | 'title-semester-type-with-printed-code-mismatch' | 'multiple-title-semester-type-matches' | 'duplicate-code-without-title-match' | 'no-composite-match';
export interface RawOffering {
  id: string; academicYear: string; term: 'spring' | 'fall'; educationType: 'first' | 'second';
  printedCourseCode: string; sourceTitle: string; audience: string; audienceTokens: string[];
  courseType: string; section: string | number; semester: number; instructor: string; classroom: string;
  weekday: string; startTime: string; endTime: string; sourceSnapshotId: string;
  globalSourceOrdinal: number; physicalStartOrdinal: number; sourceRowId: string; rawSourceText: string;
}
export interface Reconciliation {
  offeringId: string; canonicalCurriculumRelationId: string | null; status: MappingStatus; reason: MappingReason;
  candidateCurriculumRelationIds: readonly string[]; anomalyRefs: readonly string[];
  printedCode: string; printedTitle: string;
}
export interface BuuSnapshot {
  courses: readonly Course[]; curriculumRelations: readonly CurriculumRelation[]; offerings: readonly Offering[];
  reconciliations: readonly Reconciliation[]; anomalies: readonly Anomaly[];
  summary: Readonly<Record<'relations'|'required'|'elective'|'offerings'|'spring'|'fall'|'primary'|'secondary'|'mapped'|'mapped-with-anomaly'|'ambiguous'|'unmatched', number>>;
}
interface CurriculumRow { semester: number; courseCode: string; sourceTitle: string; courseType: CourseType; theoryHours: number; practiceHours: number; labHours: number; ects: number; sourceLine: number; }
interface CatalogEntry { row: CurriculumRow; course: Course; relation: CurriculumRelation; anomalyRefs: string[]; }

export function parseBuuCurriculumTsv(text: string): CurriculumRow[] {
  let semester: number | null = null;
  const rows: CurriculumRow[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const heading = line.match(/^(\d+)\. Yarıyıl(?: Seçmeli)? Dersleri$/u);
    if (heading) semester = Number(heading[1]);
    const fields = line.split('\t');
    if (fields.length !== 7 || !fields[0] || (fields[2] !== 'Zorunlu' && fields[2] !== 'Seçmeli')) continue;
    if (semester === null) throw new Error(`Course row before semester heading at line ${index + 1}`);
    const numbers = fields.slice(3).map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) throw new Error(`Invalid numeric field at line ${index + 1}`);
    rows.push({ semester, courseCode: fields[0], sourceTitle: fields[1] ?? '', courseType: fields[2] === 'Zorunlu' ? 'required' : 'elective', theoryHours: numbers[0]!, practiceHours: numbers[1]!, labHours: numbers[2]!, ects: numbers[3]!, sourceLine: index + 1 });
  }
  if (rows.length !== 144 || rows.filter((x) => x.courseType === 'required').length !== 41 || rows.filter((x) => x.courseType === 'elective').length !== 103) throw new Error('Curriculum census drift');
  return rows;
}

export function importBuuSnapshot(curriculumTsv: string, inputOfferings: unknown): BuuSnapshot {
  assertHash(Buffer.from(curriculumTsv, 'utf8'), CURRICULUM_HASH, 'curriculum');
  const rawOfferings = validateRawOfferings(inputOfferings);
  assertHash(Buffer.from(`${JSON.stringify(rawOfferings, null, 2)}\n`, 'utf8'), OFFERINGS_HASH, 'offerings');
  const rows = parseBuuCurriculumTsv(curriculumTsv);
  const counts = countBy(rows, (row) => row.courseCode);
  const seen = new Map<string, number>();
  const anomalies: Anomaly[] = [];
  const catalog = rows.map((row): CatalogEntry => {
    const ordinal = (seen.get(row.courseCode) ?? 0) + 1;
    seen.set(row.courseCode, ordinal);
    const duplicate = (counts.get(row.courseCode) ?? 0) > 1;
    const courseId = `course-buu-ay33-s${row.semester}-${row.courseType}-${row.courseCode.toLocaleLowerCase('tr-TR')}${duplicate ? `-${ordinal}` : ''}`;
    const anomalyRefs: string[] = [];
    if (duplicate) {
      const id = `anomaly-duplicate-${courseId}`;
      anomalyRefs.push(id);
      anomalies.push(makeAnomaly(id, `Duplicate official course code ${row.courseCode}; rows remain distinct.`, [courseId], { sourceLine: row.sourceLine, courseCode: row.courseCode, sourceTitle: row.sourceTitle }));
    }
    for (const [code, title, id] of suspiciousSpellings) if (row.courseCode === code && row.sourceTitle === title) {
      anomalyRefs.push(id);
      anomalies.push(makeAnomaly(id, `Suspicious source spelling preserved: ${title}`, [courseId], { sourceLine: row.sourceLine, sourceTitle: title }));
    }
    const provenance = curriculumProvenance(row.sourceLine);
    return {
      row, anomalyRefs,
      course: { id: courseId, kind: 'course', canonicalTitle: row.sourceTitle, codeAssignments: [{ value: row.courseCode, validFrom: '2025-09-01' }], provenance },
      relation: { id: `cc-${courseId}`, kind: 'curriculum-relation', curriculumVersionId: CURRICULUM_ID, courseId, semester: row.semester, status: row.courseType, ects: row.ects, ...(row.courseType === 'elective' ? { poolId: `elective-s${row.semester}` } : {}), provenance }
    };
  });
  anomalies.push(makeAnomaly('anomaly-curriculum-ay33-total-ects', 'Official program metadata reports 240 ECTS while published semester totals sum to 241 ECTS; neither value was repaired.', [CURRICULUM_ID], { programTotalEcts: 240, semesterTotals: [31,30,30,30,30,30,30,30], semesterTotalEcts: 241 }));

  const unresolved = new Map<string, Course>();
  const reconciliations: Reconciliation[] = [];
  const offerings = rawOfferings.map((raw): Offering => {
    const reconciliation = reconcile(raw, catalog);
    reconciliations.push(reconciliation);
    const selected = reconciliation.canonicalCurriculumRelationId ? catalog.find((entry) => entry.relation.id === reconciliation.canonicalCurriculumRelationId) : undefined;
    let courseId = selected?.course.id;
    if (!courseId) {
      const key = [raw.sourceSnapshotId, raw.semester, typeOf(raw.courseType) ?? 'unknown', normalize(raw.printedCourseCode), normalize(raw.sourceTitle)].join('|');
      courseId = `course-buu-timetable-${shortHash(key)}`;
      if (!unresolved.has(courseId)) unresolved.set(courseId, { id: courseId, kind: 'course', canonicalTitle: raw.sourceTitle, codeAssignments: [{ value: raw.printedCourseCode, validFrom: '2025-09-01' }], provenance: offeringProvenance(raw) });
    }
    if (reconciliation.anomalyRefs.includes('offering-printed-code-mismatch')) {
      const id = `offering-printed-code-mismatch:${raw.id}`;
      reconciliation.anomalyRefs = reconciliation.anomalyRefs.map((ref) => ref === 'offering-printed-code-mismatch' ? id : ref);
      anomalies.push(makeAnomaly(id, `Printed code ${raw.printedCourseCode} conflicts with unique title match ${raw.sourceTitle}; printed values were preserved.`, [raw.id, courseId], { sourceRowId: raw.sourceRowId, printedCode: raw.printedCourseCode, printedTitle: raw.sourceTitle }));
    }
    return {
      id: raw.id, kind: 'offering', courseId, academicYear: raw.academicYear,
      instructionType: raw.educationType === 'first' ? 'primary' : 'secondary', section: String(raw.section),
      ...(raw.instructor ? { instructorIds: [`instructor-source:${shortHash(raw.instructor)}`] } : {}),
      schedule: [{ day: weekday(raw.weekday), startsAt: raw.startTime, endsAt: raw.endTime, ...(raw.classroom ? { room: raw.classroom } : {}) }],
      provenance: offeringProvenance(raw)
    };
  });
  const courses = [...catalog.map((entry) => entry.course), ...unresolved.values()];
  const relations = catalog.map((entry) => entry.relation);
  validateReferences(courses, relations, offerings, reconciliations, anomalies);
  const summary = {
    relations: relations.length, required: rows.filter((x) => x.courseType === 'required').length, elective: rows.filter((x) => x.courseType === 'elective').length,
    offerings: rawOfferings.length, spring: rawOfferings.filter((x) => x.term === 'spring').length, fall: rawOfferings.filter((x) => x.term === 'fall').length,
    primary: rawOfferings.filter((x) => x.educationType === 'first').length, secondary: rawOfferings.filter((x) => x.educationType === 'second').length,
    mapped: reconciliations.filter((x) => x.status === 'mapped').length, 'mapped-with-anomaly': reconciliations.filter((x) => x.status === 'mapped-with-anomaly').length,
    ambiguous: reconciliations.filter((x) => x.status === 'ambiguous').length, unmatched: reconciliations.filter((x) => x.status === 'unmatched').length
  } as const;
  const expected = { relations:144,required:41,elective:103,offerings:164,spring:83,fall:81,primary:108,secondary:56,mapped:129,'mapped-with-anomaly':15,ambiguous:0,unmatched:20 };
  if (JSON.stringify(summary) !== JSON.stringify(expected)) throw new Error(`Snapshot partition drift: ${JSON.stringify(summary)}`);
  return Object.freeze({ courses: Object.freeze(courses), curriculumRelations: Object.freeze(relations), offerings: Object.freeze(offerings), reconciliations: Object.freeze(reconciliations), anomalies: Object.freeze(anomalies), summary: Object.freeze(summary) });
}

function reconcile(raw: RawOffering, catalog: CatalogEntry[]): Reconciliation {
  const expectedType = typeOf(raw.courseType);
  const candidates = catalog.filter(({ row }) => row.semester === raw.semester && (!expectedType || row.courseType === expectedType));
  const code = normalize(raw.printedCourseCode), title = normalize(raw.sourceTitle);
  const exact = candidates.filter(({ row }) => normalize(row.courseCode) === code && normalize(row.sourceTitle) === title);
  const titleMatches = candidates.filter(({ row }) => normalize(row.sourceTitle) === title);
  const codeMatches = candidates.filter(({ row }) => normalize(row.courseCode) === code);
  let selected: CatalogEntry | undefined, status: MappingStatus = 'unmatched', reason: MappingReason = 'no-composite-match', anomalyRefs: string[] = [];
  if (exact.length === 1) { selected = exact[0]; anomalyRefs = [...selected!.anomalyRefs]; status = anomalyRefs.length ? 'mapped-with-anomaly' : 'mapped'; reason = 'code-title-semester-type'; }
  else if (exact.length > 1) { status = 'ambiguous'; reason = 'multiple-exact-composite-matches'; }
  else if (titleMatches.length === 1) { selected = titleMatches[0]; status = 'mapped-with-anomaly'; reason = 'title-semester-type-with-printed-code-mismatch'; anomalyRefs = ['offering-printed-code-mismatch', ...selected!.anomalyRefs]; }
  else if (titleMatches.length > 1 || codeMatches.length > 1) { status = 'ambiguous'; reason = titleMatches.length > 1 ? 'multiple-title-semester-type-matches' : 'duplicate-code-without-title-match'; }
  const relevant = exact.length ? exact : titleMatches.length ? titleMatches : codeMatches;
  return { offeringId: raw.id, canonicalCurriculumRelationId: selected?.relation.id ?? null, status, reason, candidateCurriculumRelationIds: relevant.map((entry) => entry.relation.id), anomalyRefs, printedCode: raw.printedCourseCode, printedTitle: raw.sourceTitle };
}

const suspiciousSpellings = [
  ['EKO3310','PYHTON UYGULAMALARI','anomaly-typo-eko3310-pyhton'],
  ['EKO4115','ÖNRAPORLAMA TEKNİKLERİ','anomaly-typo-eko4115-onraporlama'],
  ['IKT3306','DOGAL KAYNAKLAR EKONOMİSİ','anomaly-typo-ikt3306-dogal']
] as const;
function normalize(value: string): string { return value.toLocaleUpperCase('tr-TR').normalize('NFC').replace(/[’']/gu, "'").replace(/[^0-9A-ZÇĞİÖŞÜ']/gu, ' ').replace(/\s+/gu, ' ').trim(); }
function typeOf(value: string): CourseType | null { return value === 'Z' ? 'required' : value === 'S' ? 'elective' : null; }
function shortHash(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 20); }
function assertHash(bytes: Buffer, expected: string, label: string): void { if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`${label} fixture SHA-256 mismatch`); }
function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> { const result = new Map<string, number>(); for (const item of items) result.set(key(item), (result.get(key(item)) ?? 0) + 1); return result; }
function curriculumProvenance(line: number): Provenance { return { sourceId: 'source:buu-program-package', snapshotId: 'snapshot:buu-program-ay33-2026-08-23', locator: `program-343-ay33.rows.tsv#line=${line}`, observedAt: OBSERVED_AT, contentHash: `sha256:${CURRICULUM_HASH}`, transformationVersion: VERSION }; }
function offeringProvenance(row: RawOffering): Provenance { return { sourceId: 'source:buu-timetable', snapshotId: row.sourceSnapshotId, locator: `offerings.json#${row.sourceRowId}`, observedAt: OBSERVED_AT, contentHash: `sha256:${OFFERINGS_HASH}`, transformationVersion: VERSION }; }
function makeAnomaly(id: string, message: string, entityRefs: string[], evidence: unknown): Anomaly { return { id, code: 'CONFLICTING_VALUE', severity: 'warning', message, entityRefs, evidence: [evidence] }; }
function weekday(value: string): number { const days = ['PAZARTESİ','SALI','ÇARŞAMBA','PERŞEMBE','CUMA','CUMARTESİ','PAZAR']; const day = days.indexOf(value); if (day < 0) throw new Error(`Unknown weekday ${value}`); return day + 1; }
function validateRawOfferings(input: unknown): RawOffering[] {
  if (!Array.isArray(input) || input.length !== 164) throw new Error('Offering census drift');
  const required = ['id','academicYear','term','educationType','printedCourseCode','sourceTitle','audience','audienceTokens','courseType','section','semester','instructor','classroom','weekday','startTime','endTime','sourceSnapshotId','globalSourceOrdinal','physicalStartOrdinal','sourceRowId','rawSourceText'];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || required.some((key) => !Object.hasOwn(item, key))) throw new Error(`Invalid offering row ${index}`);
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some((key) => !required.includes(key)) || typeof row.id !== 'string' || typeof row.sourceRowId !== 'string' || !Array.isArray(row.audienceTokens) || !row.audienceTokens.every((x) => typeof x === 'string')) throw new Error(`Invalid offering schema ${index}`);
  }
  return input as RawOffering[];
}
function validateReferences(courses: Course[], relations: CurriculumRelation[], offerings: Offering[], reconciliations: Reconciliation[], anomalies: Anomaly[]): void {
  const unique = (ids: string[], label: string): Set<string> => { const set = new Set(ids); if (set.size !== ids.length) throw new Error(`Duplicate ${label} id`); return set; };
  const courseIds = unique(courses.map((x) => x.id), 'course'), relationIds = unique(relations.map((x) => x.id), 'relation');
  unique(offerings.map((x) => x.id), 'offering'); unique(anomalies.map((x) => x.id), 'anomaly');
  if (relations.some((x) => !courseIds.has(x.courseId)) || offerings.some((x) => !courseIds.has(x.courseId)) || reconciliations.some((x) => x.canonicalCurriculumRelationId !== null && !relationIds.has(x.canonicalCurriculumRelationId))) throw new Error('Dangling reference');
}
