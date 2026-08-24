import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { decodeTimetableModule, parseCurriculumRows } from '../scripts/materialize-m1.mjs';

// The decoder intentionally rejects any source not matching the pinned complete-file hash.
test('decoder rejects synthetic or modified legacy modules before parsing', () => {
  const payload = gzipSync(Buffer.from('[]')).toString('base64');
  assert.throws(() => decodeTimetableModule(Buffer.from(`const payload = \`${payload}\`;`)), /SHA-256 mismatch/);
});

test('curriculum parser admits only structurally valid course rows and preserves source spelling', () => {
  const fixture = ['6. Yarıyıl Dersleri', 'Dersin Kodu\tDersin Adı\tDersin Türü\tT1\tU2\tL3\tAKTS', ...Array.from({ length: 144 }, (_, index) => `${index < 41 ? 'Z' : 'S'}${index}\t${index === 41 ? 'PYHTON UYGULAMALARI' : `TITLE ${index}`}\t${index < 41 ? 'Zorunlu' : 'Seçmeli'}\t3\t0\t0\t5`)].join('\n');
  const rows = parseCurriculumRows(fixture);
  assert.equal(rows.length, 144);
  assert.equal(rows[41]?.sourceTitle, 'PYHTON UYGULAMALARI');
  assert.equal(rows.filter((row) => row.courseType === 'required').length, 41);
});
