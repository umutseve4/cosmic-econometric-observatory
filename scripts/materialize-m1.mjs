import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGACY_COMMIT = 'db8d52f0b29d712c34e8b7487e2299ce9f75c266';
export const M0_BASE_SHA = '9d481cec439b99cd590e267cc0995c34e8036b36';
const LEGACY_REPOSITORY = 'umutseve4/eko-rasathane';
const VENDOR_ROOT = `vendor/legacy/eko-rasathane/${LEGACY_COMMIT}`;
const EXPECTED_TIMETABLE_SHA256 = '9231d013e3cbbfb24e3ca463582c47cb42e40c2660aaad9b58a3da0afd64f87b';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function decodeTimetableModule(sourceBytes) {
  assert(sha256(sourceBytes) === EXPECTED_TIMETABLE_SHA256, 'Pinned timetable SHA-256 mismatch');
  const source = sourceBytes.toString('utf8');
  const matches = [...source.matchAll(/const payload = `([A-Za-z0-9+/=]+)`;/g)];
  assert(matches.length === 1, `Expected exactly one inert payload literal, found ${matches.length}`);
  const encoded = matches[0]?.[1] ?? '';
  assert(encoded.length > 0 && encoded.length % 4 === 0, 'Invalid base64 payload length');
  const compressed = Buffer.from(encoded, 'base64');
  assert(compressed.toString('base64') === encoded, 'Non-canonical base64 payload');
  const decodedBytes = gunzipSync(compressed);
  const value = JSON.parse(decodedBytes.toString('utf8'));
  assert(Array.isArray(value) && value.length === 164, 'Offering census drift');
  const required = ['id', 'sourceRowId', 'sourceSnapshotId', 'academicYear', 'term', 'educationType', 'semester', 'printedCourseCode', 'sourceTitle'];
  for (const [index, row] of value.entries()) {
    assert(row && typeof row === 'object' && !Array.isArray(row), `Offering ${index} is not an object`);
    for (const key of required) assert(Object.hasOwn(row, key), `Offering ${index} missing ${key}`);
  }
  return { value, encoded, compressed, decodedBytes };
}

export function parseCurriculumRows(sourceText) {
  let semester = null;
  const rows = [];
  for (const [zeroIndex, line] of sourceText.split(/\r?\n/).entries()) {
    const heading = line.match(/^(\d+)\. Yarıyıl(?: Seçmeli)? Dersleri$/u);
    if (heading) semester = Number(heading[1]);
    const fields = line.split('\t');
    if (fields.length !== 7 || !fields[0] || !['Zorunlu', 'Seçmeli'].includes(fields[2] ?? '')) continue;
    assert(semester !== null, `Course row before semester heading at line ${zeroIndex + 1}`);
    rows.push({ semester, courseCode: fields[0], sourceTitle: fields[1], courseType: fields[2] === 'Zorunlu' ? 'required' : 'elective', theoryHours: Number(fields[3]), practiceHours: Number(fields[4]), labHours: Number(fields[5]), ects: Number(fields[6]), sourceLine: zeroIndex + 1 });
  }
  assert(rows.length === 144, `Curriculum census drift: ${rows.length}`);
  assert(rows.filter((row) => row.courseType === 'required').length === 41, 'Required curriculum partition drift');
  assert(rows.filter((row) => row.courseType === 'elective').length === 103, 'Elective curriculum partition drift');
  return rows;
}

export function materialize(sourceRoot, outputRoot) {
  const curriculumPath = join(sourceRoot, 'evidence/program-343-ay33.rows.tsv');
  const timetablePath = join(sourceRoot, 'data/timetable.mjs');
  const curriculumBytes = readFileSync(curriculumPath);
  const timetableBytes = readFileSync(timetablePath);
  const curriculumRows = parseCurriculumRows(curriculumBytes.toString('utf8'));
  const decoded = decodeTimetableModule(timetableBytes);
  const curriculumOut = join(outputRoot, VENDOR_ROOT, 'program-343-ay33.rows.tsv');
  const offeringsOut = join(outputRoot, VENDOR_ROOT, 'offerings.json');
  const manifestOut = join(outputRoot, VENDOR_ROOT, 'manifest.json');
  mkdirSync(dirname(curriculumOut), { recursive: true });
  writeFileSync(curriculumOut, curriculumBytes);
  const offeringBytes = Buffer.from(`${JSON.stringify(decoded.value, null, 2)}\n`, 'utf8');
  writeFileSync(offeringsOut, offeringBytes);
  const scriptBytes = readFileSync(fileURLToPath(import.meta.url));
  const summary = decoded.value.reduce((acc, row) => {
    acc[row.term] = (acc[row.term] ?? 0) + 1;
    acc[row.educationType] = (acc[row.educationType] ?? 0) + 1;
    return acc;
  }, {});
  assert(summary.spring === 83 && summary.fall === 81, 'Offering term partition drift');
  assert(summary.first === 108 && summary.second === 56, 'Offering education partition drift');
  const manifest = {
    schemaVersion: 1,
    m0BaseSha: M0_BASE_SHA,
    materializerSha256: sha256(scriptBytes),
    legacy: { repository: LEGACY_REPOSITORY, commit: LEGACY_COMMIT },
    curriculum: {
      sourcePath: 'evidence/program-343-ay33.rows.tsv',
      sourceGitBlobSha: 'f3336e870287db5cb14e978845ec2474c0be852f',
      bytes: curriculumBytes.length,
      sha256: sha256(curriculumBytes),
      relationCount: curriculumRows.length,
      requiredCount: 41,
      electiveCount: 103,
      academicYear: '2025-2026',
      sourceUrl: 'https://bilgipaketi.uludag.edu.tr/Programlar/Detay/343?AyID=33',
      accessedAt: '2026-08-23T19:03:28Z',
      httpStatus: 200,
      rawHtmlBytes: 108070,
      rawHtmlSha256: '0b72d3ba7919492cce571d697902dff1ca20d6e0ef67dcbdf3f53f5b6acee1c6'
    },
    timetable: {
      sourcePath: 'data/timetable.mjs',
      sourceGitBlobSha: 'bdcf2276edd98c33eddb3ccd2c9b71e962293a61',
      sourceBytes: timetableBytes.length,
      sourceSha256: sha256(timetableBytes),
      payloadGzipBytes: decoded.compressed.length,
      payloadGzipSha256: sha256(decoded.compressed),
      decodedPayloadBytes: decoded.decodedBytes.length,
      decodedPayloadSha256: sha256(decoded.decodedBytes),
      generatedBytes: offeringBytes.length,
      generatedSha256: sha256(offeringBytes),
      offeringCount: decoded.value.length,
      termCounts: { fall: 81, spring: 83 },
      educationTypeCounts: { first: 108, second: 56 },
      snapshots: [
        { id: '2025-2026-spring-10-feb', extractionSha256: '616ae40aa873a90a75938ca6900f05f1977c8b07b0660d2e4a93b6a275cc252a', physicalRecordStarts: 490, acceptedSourceRows: 490, excludedPhysicalOrdinals: [] },
        { id: '2025-2026-fall-19-sep', extractionSha256: '3e2a5c79fd6faaeb3fbc5796ff14ce348ecc2b6bc0423a609014f4cd6aa637ba', physicalRecordStarts: 514, acceptedSourceRows: 512, excludedPhysicalOrdinals: [503, 505] }
      ]
    }
  };
  writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = resolve(process.argv[2] ?? '.legacy');
  const outputRoot = resolve(process.argv[3] ?? '.');
  materialize(sourceRoot, outputRoot);
}
