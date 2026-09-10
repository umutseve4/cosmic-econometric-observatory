import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { generateBrowserArtifact } from '../scripts/generate-browser-artifact.mjs';

const root = resolve(process.cwd());

// The variant is chosen to maximise distance from CI's UTC / en-US baseline,
// so that anything local-time or locale dependent has to show itself:
//
//   Pacific/Kiritimati is UTC+14, the largest positive offset in the tz
//   database. Any date formatted through local time lands on a different
//   calendar day than the same instant formatted in UTC.
//
//   tr_TR.UTF-8 is the dotted/dotless-i hazard this repository already
//   documents in `renderAnomalies`, where a locale-aware upper-casing would
//   print IKT3306 as İKT3306 and misquote the source it exists to reproduce.
const HOSTILE = Object.freeze({
  TZ: 'Pacific/Kiritimati',
  LANG: 'tr_TR.UTF-8',
  LC_ALL: 'tr_TR.UTF-8'
});

test('the artifact is byte-identical when built under a hostile locale and timezone', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cosmic-artifact-portability-'));
  try {
    const baselineDirectory = join(temporary, 'baseline');
    const variantDirectory = join(temporary, 'variant');
    mkdirSync(baselineDirectory);
    mkdirSync(variantDirectory);
    const baselinePath = join(baselineDirectory, 'curriculum-observatory.json');
    const variantPath = join(variantDirectory, 'curriculum-observatory.json');

    generateBrowserArtifact(root, baselinePath);

    const child = spawnSync(
      process.execPath,
      [join(root, 'tests', 'support', 'hostile-locale-build.mjs'), root, variantPath],
      { env: { ...process.env, ...HOSTILE }, encoding: 'utf8' }
    );

    assert.equal(
      child.status,
      0,
      `HOSTILE_LOCALE_BUILD_FAILED:status=${child.status}:signal=${child.signal}\n${child.stderr}`
    );

    // Refuse a false pass. If the child was not actually born into the hostile
    // environment, the comparison below would compare CI against CI and report
    // success while measuring nothing.
    const observed = JSON.parse(child.stdout);
    assert.equal(observed.timeZone, HOSTILE.TZ, `HOSTILE_LOCALE_NOT_APPLIED:${child.stdout}`);
    assert.equal(observed.offsetMinutesAtEpoch, -840, `HOSTILE_LOCALE_NOT_APPLIED:${child.stdout}`);
    assert.equal(
      observed.collatorLocale.startsWith('tr'),
      true,
      `HOSTILE_LOCALE_NOT_APPLIED:${child.stdout}`
    );
    assert.notEqual(
      observed.timeZone,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `HOSTILE_LOCALE_NOT_DISTINCT:${child.stdout}`
    );

    assert.deepEqual(
      readFileSync(variantPath),
      readFileSync(baselinePath),
      'HOSTILE_LOCALE_ARTIFACT_DIVERGED: the published artifact depends on the machine that built it'
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
