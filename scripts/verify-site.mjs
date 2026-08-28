import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const canonicalOutput = resolve(root, 'dist-site');
const firstOutput = resolve(root, '.site-verify-a');
const secondOutput = resolve(root, '.site-verify-b');

try {
  verifyManifest(canonicalOutput);
  build(firstOutput);
  build(secondOutput);
  const first = snapshot(firstOutput);
  const second = snapshot(secondOutput);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('SITE_VERIFY_NON_DETERMINISTIC');
  const canonical = snapshot(canonicalOutput);
  if (JSON.stringify(canonical) !== JSON.stringify(first)) throw new Error('SITE_VERIFY_CANONICAL_DRIFT');
  console.log(`M3G_SITE_ARTIFACT_VERIFIED:${sha256(readFileSync(resolve(canonicalOutput, 'deployment-provenance.json')))}`);
} finally {
  rmSync(firstOutput, { recursive: true, force: true });
  rmSync(secondOutput, { recursive: true, force: true });
}

function build(output) {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], {
    cwd: root,
    env: { ...process.env, SITE_OUTPUT_DIR: output },
    stdio: ['ignore', 'pipe', 'inherit']
  });
}
function verifyManifest(output) {
  const manifestPath = resolve(output, 'deployment-provenance.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (manifest.schemaVersion !== '1.0.0' || manifest.sourceSha !== head || !/^[0-9a-f]{64}$/u.test(manifest.lockfileSha256) || !Array.isArray(manifest.files)) throw new Error('SITE_VERIFY_INVALID_MANIFEST');
  const lockHash = sha256(readFileSync(resolve(root, 'package-lock.json')));
  if (manifest.lockfileSha256 !== lockHash) throw new Error('SITE_VERIFY_LOCKFILE_DRIFT');
  for (const entry of manifest.files) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.path !== 'string' || !safeRelative(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/u.test(entry.sha256)) throw new Error('SITE_VERIFY_INVALID_ENTRY');
  }
  const paths = manifest.files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length || paths.some((path, index) => index > 0 && compareCodePoints(paths[index - 1], path) >= 0)) throw new Error('SITE_VERIFY_MANIFEST_ORDER');
  for (const entry of manifest.files) {
    const file = resolve(output, entry.path);
    if (!file.startsWith(`${output}${sep}`)) throw new Error('SITE_VERIFY_PATH_ESCAPE');
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`SITE_VERIFY_UNSAFE_FILE:${entry.path}`);
    const bytes = readFileSync(file);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`SITE_VERIFY_DIGEST_MISMATCH:${entry.path}`);
  }
  const actual = listFiles(output).filter((path) => path !== 'deployment-provenance.json');
  if (JSON.stringify(actual) !== JSON.stringify(paths)) throw new Error('SITE_VERIFY_FILE_SET_DRIFT');
}
function snapshot(output) {
  verifyManifest(output);
  return listFiles(output).map((path) => {
    const bytes = readFileSync(resolve(output, path));
    return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
}
function listFiles(directory, prefix = '') {
  const result = [];
  const currentDirectory = prefix === '' ? directory : resolve(directory, prefix);
  for (const name of readdirSync(currentDirectory).sort(compareCodePoints)) {
    const relativePath = prefix === '' ? name : `${prefix}/${name}`;
    const info = lstatSync(resolve(directory, relativePath));
    if (info.isSymbolicLink()) throw new Error(`SITE_VERIFY_SYMLINK:${relativePath}`);
    if (info.isDirectory()) result.push(...listFiles(directory, relativePath));
    else if (info.isFile()) result.push(relativePath);
    else throw new Error(`SITE_VERIFY_UNSUPPORTED_ENTRY:${relativePath}`);
  }
  return result;
}
function safeRelative(value) {
  return value.length > 0 && !value.startsWith('/') && !value.split('/').some((part) => part === '' || part === '.' || part === '..');
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function compareCodePoints(a, b) {
  const left = [...a]; const right = [...b];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const difference = left[index].codePointAt(0) - right[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return 0;
}
