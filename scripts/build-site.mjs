import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { generateBrowserArtifact } from './generate-browser-artifact.mjs';

const root = resolve(process.cwd());
const output = resolve(root, process.env.SITE_OUTPUT_DIR || 'dist-site');
const allowedOutputs = new Set([resolve(root, 'dist-site'), resolve(root, '.site-verify-a'), resolve(root, '.site-verify-b')]);
if (!allowedOutputs.has(output)) throw new Error('SITE_BUILD_INVALID_OUTPUT');

const head = git(['rev-parse', 'HEAD']);
if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error('SITE_BUILD_INVALID_SOURCE_SHA');
if (process.env.SOURCE_SHA !== undefined && process.env.SOURCE_SHA !== head) throw new Error('SITE_BUILD_SOURCE_SHA_MISMATCH');
if (git(['status', '--porcelain', '--untracked-files=no']) !== '') throw new Error('SITE_BUILD_DIRTY_SOURCE');

const copies = new Map([
  ['site/index.html', 'index.html'], ['site/app.js', 'app.js'], ['site/styles.css', 'styles.css'],
  ['dist/src/canonical.js', 'modules/canonical.js'], ['dist/src/projections.js', 'modules/projections.js'],
  ['dist/src/direct-relations.js', 'modules/direct-relations.js'],
  ['dist/src/browser-renderer.js', 'modules/browser-renderer.js'],
  ['dist/src/browser-fallback-orchestrator.js', 'modules/browser-fallback-orchestrator.js'],
  ['dist/src/browser-dom-adapter.js', 'modules/browser-dom-adapter.js'],
  ['dist/src/browser-three-adapter.js', 'modules/browser-three-adapter.js'],
  ['dist/src/browser-node-selection.js', 'modules/browser-node-selection.js'],
  ['dist/src/three-viewport-lifecycle.js', 'modules/three-viewport-lifecycle.js'],
  ['dist/src/three-runtime.js', 'modules/three-runtime.js'],
  ['dist/src/three-selection-projection.js', 'modules/three-selection-projection.js'],
  ['dist/src/three-focus-target.js', 'modules/three-focus-target.js'],
  ['node_modules/three/build/three.core.js', 'vendor/three.core.js'],
  ['node_modules/three/build/three.module.js', 'vendor/three.module.js']
]);
const generatedArtifact = 'data/curriculum-observatory.json';

rmSync(output, { recursive: true, force: true });
for (const [sourceRelative, destinationRelative] of copies) {
  assertSafeRelative(sourceRelative); assertSafeRelative(destinationRelative);
  const source = resolve(root, sourceRelative); const info = lstatSync(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`SITE_BUILD_UNSAFE_SOURCE:${sourceRelative}`);
  const destination = resolve(output, destinationRelative);
  mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination);
}
composeSafeDomAdapter();
mkdirSync(dirname(resolve(output, generatedArtifact)), { recursive: true });
generateBrowserArtifact(root, resolve(output, generatedArtifact));

const payloadPaths = [...copies.values(), generatedArtifact].sort(compareCodePoints);
const files = payloadPaths.map((path) => {
  const bytes = readFileSync(resolve(output, path));
  return Object.freeze({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
});
const manifest = { schemaVersion: '1.0.0', sourceSha: head, lockfileSha256: sha256(readFileSync(resolve(root, 'package-lock.json'))), files };
writeFileSync(resolve(output, 'deployment-provenance.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ output: relative(root, output), sourceSha: head, manifestSha256: sha256(readFileSync(resolve(output, 'deployment-provenance.json'))), files: files.length }));

function composeSafeDomAdapter() {
  const destination = resolve(output, 'modules/browser-dom-adapter.js');
  const adapter = readFileSync(destination, 'utf8');
  const validatorSource = readFileSync(resolve(root, 'dist/src/browser-dom-source-validator.js'), 'utf8');
  const prepareSignature = 'function prepare(document, content, kind) {';
  if (adapter.split(prepareSignature).length !== 2) throw new Error('SITE_BUILD_DOM_ADAPTER_SHAPE_DRIFT');
  if (!validatorSource.includes('export function validateSourceAttributes(content, kind)')) throw new Error('SITE_BUILD_SOURCE_VALIDATOR_SHAPE_DRIFT');
  const validator = validatorSource.replaceAll('fail(', 'sourceAttributeFail(').replace('function sourceAttributeFail(kind)', 'function sourceAttributeFail(kind)').replace('export function validateSourceAttributes(content, kind)', 'function validateSourceAttributes(content, kind)');
  if (validator.includes('export function validateSourceAttributes')) throw new Error('SITE_BUILD_SOURCE_VALIDATOR_EXPORT_DRIFT');
  const safeAdapter = adapter.replace(prepareSignature, `${prepareSignature}\n    validateSourceAttributes(content, kind);`);
  writeFileSync(destination, `${safeAdapter.trimEnd()}\n\n${validator.trim()}\n`, 'utf8');
}
function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function assertSafeRelative(value) { if (value.length === 0 || value.startsWith('/') || value.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error(`SITE_BUILD_INVALID_PATH:${value}`); }
function compareCodePoints(a, b) {
  const left = [...a]; const right = [...b];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1; if (right[index] === undefined) return 1;
    const difference = left[index].codePointAt(0) - right[index].codePointAt(0); if (difference !== 0) return difference;
  }
  return 0;
}
