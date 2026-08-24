export type Id = string;

export interface Provenance {
  sourceId: Id;
  snapshotId: Id;
  locator: string;
  observedAt: string;
  contentHash: `sha256:${string}`;
  transformationVersion?: string;
  derivedFrom?: readonly Id[];
}

interface Entity { id: Id; provenance: Provenance; }

export interface Course extends Entity {
  kind: 'course';
  codeAssignments: readonly { value: string; validFrom: string; validTo?: string }[];
  canonicalTitle: string;
}

export interface CurriculumRelation extends Entity {
  kind: 'curriculum-relation';
  curriculumVersionId: Id;
  courseId: Id;
  semester: number;
  status: 'required' | 'elective';
  ects: number;
  poolId?: Id;
}

export interface Offering extends Entity {
  kind: 'offering';
  courseId: Id;
  academicYear: string;
  instructionType: 'primary' | 'secondary';
  section: string;
  instructorIds?: readonly Id[];
  schedule?: readonly { day: number; startsAt: string; endsAt: string; room?: string }[];
}

export type DomainRecord = Course | CurriculumRelation | Offering;

export interface Anomaly {
  id: Id;
  code: 'MISSING_PROVENANCE' | 'DANGLING_REFERENCE' | 'CONFLICTING_VALUE' | 'UNKNOWN_KIND';
  severity: 'warning' | 'error';
  message: string;
  entityRefs: readonly Id[];
  evidence: readonly unknown[];
}

export interface ValidationResult<T> {
  accepted: readonly T[];
  rejected: readonly unknown[];
  anomalies: readonly Anomaly[];
}

export function validateRecord(input: unknown): ValidationResult<DomainRecord> {
  if (!input || typeof input !== 'object') return rejected(input, 'UNKNOWN_KIND');
  const record = input as Record<string, unknown>;
  if (!validProvenance(record.provenance)) return rejected(input, 'MISSING_PROVENANCE');

  if (record.kind === 'course') {
    if (!hasOnlyKeys(record, ['id', 'kind', 'canonicalTitle', 'codeAssignments', 'provenance']) ||
        typeof record.id !== 'string' || typeof record.canonicalTitle !== 'string' ||
        !Array.isArray(record.codeAssignments) || !record.codeAssignments.every(validCodeAssignment)) {
      return rejected(input, 'CONFLICTING_VALUE');
    }
    return { accepted: [input as unknown as Course], rejected: [], anomalies: [] };
  }

  if (record.kind === 'curriculum-relation') {
    if (!hasOnlyKeys(record, ['id', 'kind', 'curriculumVersionId', 'courseId', 'semester', 'status', 'ects', 'poolId']) ||
        typeof record.id !== 'string' || typeof record.curriculumVersionId !== 'string' || typeof record.courseId !== 'string' ||
        !Number.isInteger(record.semester) || (record.status !== 'required' && record.status !== 'elective') ||
        typeof record.ects !== 'number' || !Number.isFinite(record.ects) ||
        (record.poolId !== undefined && typeof record.poolId !== 'string')) {
      return rejected(input, 'CONFLICTING_VALUE');
    }
    return { accepted: [input as unknown as CurriculumRelation], rejected: [], anomalies: [] };
  }

  if (record.kind === 'offering') {
    if (!hasOnlyKeys(record, ['id', 'kind', 'courseId', 'academicYear', 'instructionType', 'section', 'instructorIds', 'schedule']) ||
        typeof record.id !== 'string' || typeof record.courseId !== 'string' || typeof record.academicYear !== 'string' ||
        (record.instructionType !== 'primary' && record.instructionType !== 'secondary') || typeof record.section !== 'string' ||
        (record.instructorIds !== undefined && (!Array.isArray(record.instructorIds) || !record.instructorIds.every((id) => typeof id === 'string'))) ||
        (record.schedule !== undefined && (!Array.isArray(record.schedule) || !record.schedule.every(validScheduleEntry)))) {
      return rejected(input, 'CONFLICTING_VALUE');
    }
    return { accepted: [input as unknown as Offering], rejected: [], anomalies: [] };
  }

  return rejected(input, 'UNKNOWN_KIND');
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set([...allowed, 'provenance']);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function validCodeAssignment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const assignment = value as Record<string, unknown>;
  return hasOnlyKeysWithoutProvenance(assignment, ['value', 'validFrom', 'validTo']) &&
    typeof assignment.value === 'string' && typeof assignment.validFrom === 'string' &&
    (assignment.validTo === undefined || typeof assignment.validTo === 'string');
}

function validScheduleEntry(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return hasOnlyKeysWithoutProvenance(entry, ['day', 'startsAt', 'endsAt', 'room']) &&
    Number.isInteger(entry.day) && typeof entry.startsAt === 'string' && typeof entry.endsAt === 'string' &&
    (entry.room === undefined || typeof entry.room === 'string');
}

function hasOnlyKeysWithoutProvenance(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function validProvenance(value: unknown): value is Provenance {
  if (!value || typeof value !== 'object') return false;
  const provenance = value as Record<string, unknown>;
  return hasOnlyKeysWithoutProvenance(provenance, ['sourceId', 'snapshotId', 'locator', 'observedAt', 'contentHash', 'transformationVersion', 'derivedFrom']) &&
    typeof provenance.sourceId === 'string' && typeof provenance.snapshotId === 'string' && typeof provenance.locator === 'string' &&
    typeof provenance.observedAt === 'string' && typeof provenance.contentHash === 'string' && provenance.contentHash.startsWith('sha256:') &&
    (provenance.transformationVersion === undefined || typeof provenance.transformationVersion === 'string') &&
    (provenance.derivedFrom === undefined || (Array.isArray(provenance.derivedFrom) && provenance.derivedFrom.every((id) => typeof id === 'string')));
}

function rejected(input: unknown, code: Anomaly['code']): ValidationResult<DomainRecord> {
  return { accepted: [], rejected: [input], anomalies: [{ id: `anomaly:${code}`, code, severity: 'error', message: code, entityRefs: [], evidence: [input] }] };
}
