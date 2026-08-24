import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const fixture = join(root, 'vendor/legacy/eko-rasathane/db8d52f0b29d712c34e8b7487e2299ce9f75c266');
const manifest = JSON.parse(readFileSync(join(fixture, 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('fixture bytes and SHA-256 independently match the committed manifest', () => {
  const curriculum = readFileSync(join(fixture, 'program-343-ay33.rows.tsv'));
  const offerings = readFileSync(join(fixture, 'offerings.json'));
  assert.equal(curriculum.length, manifest.curriculum.bytes);
  assert.equal(sha256(curriculum), manifest.curriculum.sha256);
  assert.equal(offerings.length, manifest.timetable.generatedBytes);
  assert.equal(sha256(offerings), manifest.timetable.generatedSha256);
  assert.equal(manifest.curriculum.relationCount, 144);
  assert.equal(manifest.timetable.offeringCount, 164);
});

test('runtime source has no legacy execution or checkout coupling', () => {
  const sourceFiles = readdirSync(join(root, 'src')).filter((name) => name.endsWith('.ts'));
  for (const name of sourceFiles) {
    const source = readFileSync(join(root, 'src', name), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:eko-rasathane|vendor\/legacy)/u, name);
    assert.doesNotMatch(source, /import\s*\([^)]*(?:eko-rasathane|vendor\/legacy)/u, name);
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/u, name);
    assert.doesNotMatch(source, /node:(?:vm|child_process)/u, name);
  }
});

test('committed M1 evidence contains no symbolic links', () => {
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      assert.equal(lstatSync(target).isSymbolicLink(), false, target);
      if (entry.isDirectory()) visit(target);
    }
  };
  visit(fixture);
});

test('snapshot output is byte-identical across CWD, TZ and LANG changes', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'ceo-m1-'));
  try {
    const moduleUrl = pathToFileURL(join(root, 'dist/src/index.js')).href;
    const curriculumPath = JSON.stringify(join(fixture, 'program-343-ay33.rows.tsv'));
    const offeringsPath = JSON.stringify(join(fixture, 'offerings.json'));
    const code = `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{importBuuSnapshot}from${JSON.stringify(moduleUrl)};const c=readFileSync(${curriculumPath},'utf8');const o=JSON.parse(readFileSync(${offeringsPath},'utf8'));const s=importBuuSnapshot(c,o);process.stdout.write(createHash('sha256').update(JSON.stringify(s)).digest('hex'));`;
    const variants = [
      { cwd: root, TZ: 'UTC', LANG: 'C' },
      { cwd: scratch, TZ: 'Europe/Istanbul', LANG: 'tr_TR.UTF-8' },
      { cwd: tmpdir(), TZ: 'Pacific/Honolulu', LANG: 'en_US.UTF-8' }
    ];
    const hashes = variants.map(({ cwd, TZ, LANG }) => {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { cwd, env: { ...process.env, TZ, LANG }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    });
    assert.equal(new Set(hashes).size, 1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
