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
  const r = input as Record<string, unknown>;
  if (!validProvenance(r.provenance)) return rejected(input, 'MISSING_PROVENANCE');
  if (r.kind === 'course' && typeof r.id === 'string' && typeof r.canonicalTitle === 'string' && Array.isArray(r.codeAssignments)) {
    const forbidden = ['semester', 'instructorIds', 'schedule', 'academicYear'];
    if (forbidden.some((k) => k in r)) return rejected(input, 'CONFLICTING_VALUE');
    return { accepted: [input as Course], rejected: [], anomalies: [] };
  }
  if (r.kind === 'curriculum-relation' && typeof r.id === 'string' && typeof r.courseId === 'string' && typeof r.curriculumVersionId === 'string' && Number.isInteger(r.semester) && typeof r.ects === 'number') {
    return { accepted: [input as CurriculumRelation], rejected: [], anomalies: [] };
  }
  if (r.kind === 'offering' && typeof r.id === 'string' && typeof r.courseId === 'string' && typeof r.academicYear === 'string' && typeof r.section === 'string') {
    const forbidden = ['canonicalTitle', 'ects', 'semester'];
    if (forbidden.some((k) => k in r)) return rejected(input, 'CONFLICTING_VALUE');
    return { accepted: [input as Offering], rejected: [], anomalies: [] };
  }
  return rejected(input, 'UNKNOWN_KIND');
}

function validProvenance(value: unknown): value is Provenance {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.sourceId === 'string' && typeof p.snapshotId === 'string' && typeof p.locator === 'string' && typeof p.observedAt === 'string' && typeof p.contentHash === 'string' && p.contentHash.startsWith('sha256:');
}

function rejected(input: unknown, code: Anomaly['code']): ValidationResult<DomainRecord> {
  return { accepted: [], rejected: [input], anomalies: [{ id: `anomaly:${code}`, code, severity: 'error', message: code, entityRefs: [], evidence: [input] }] };
}
