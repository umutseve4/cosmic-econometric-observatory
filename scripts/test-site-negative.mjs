import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const artifact = resolve(root, 'dist-site');
const manifestPath = resolve(artifact, 'artifact-manifest.json');
const stylePath = resolve(root, 'site/styles.css');
const originalStyle = readFileSync(stylePath);
let passed = 0;

try {
  expectFailure('source SHA mismatch', 'SITE_BUILD_SOURCE_SHA_MISMATCH', 'scripts/build-site.mjs', { SOURCE_SHA: '0'.repeat(40) });
  expectFailure('invalid output target', 'SITE_BUILD_INVALID_OUTPUT', 'scripts/build-site.mjs', { SITE_OUTPUT_DIR: resolve(root, 'unsafe-site-output') });

  writeFileSync(stylePath, Buffer.concat([originalStyle, Buffer.from('\n')]));
  try {
    expectFailure('dirty tracked source', 'SITE_BUILD_DIRTY_SOURCE', 'scripts/build-site.mjs');
  } finally {
    writeFileSync(stylePath, originalStyle);
  }

  resetArtifact();
  const manifest = readManifest();
  writeFileSync(resolve(artifact, manifest.files[0].path), 'tampered');
  expectFailure('artifact digest tamper', 'SITE_VERIFY_DIGEST_MISMATCH', 'scripts/verify-site.mjs');

  resetArtifact();
  writeFileSync(resolve(artifact, 'unexpected.txt'), 'unexpected');
  expectFailure('unexpected artifact file', 'SITE_VERIFY_FILE_SET_DRIFT', 'scripts/verify-site.mjs');

  resetArtifact();
  rmSync(resolve(artifact, 'app.js'));
  symlinkSync('styles.css', resolve(artifact, 'app.js'));
  expectFailure('artifact symlink', 'SITE_VERIFY_UNSAFE_FILE:app.js', 'scripts/verify-site.mjs');

  resetArtifact();
  mutateManifest((value) => { value.files[0].path = '../escape.js'; });
  expectFailure('manifest path traversal', 'SITE_VERIFY_INVALID_ENTRY', 'scripts/verify-site.mjs');

  resetArtifact();
  mutateManifest((value) => { value.lockfileSha256 = '0'.repeat(64); });
  expectFailure('lockfile provenance drift', 'SITE_VERIFY_LOCKFILE_DRIFT', 'scripts/verify-site.mjs');

  console.log(`M3G_SITE_NEGATIVE_TESTS_PASS:${passed}`);
} finally {
  writeFileSync(stylePath, originalStyle);
  rmSync(resolve(root, 'unsafe-site-output'), { recursive: true, force: true });
  resetArtifact();
}

function resetArtifact() {
  rmSync(artifact, { recursive: true, force: true });
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function mutateManifest(mutator) {
  const manifest = readManifest();
  mutator(manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function expectFailure(name, marker, script, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...extraEnvironment },
    encoding: 'utf8'
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0 || !output.includes(marker)) {
    throw new Error(`negative case failed: ${name}; status=${String(result.status)} expected=${marker}\n${output}`);
  }
  passed += 1;
  console.log(`M3G_NEGATIVE_PASS:${name}`);
}
