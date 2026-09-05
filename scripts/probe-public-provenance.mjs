#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';

// The exact set of payload files production must serve, in the code-point order
// scripts/build-site.mjs writes them. This is deliberately an independent pin
// rather than something read back from the live manifest: the manifest is the
// artefact under test, so it cannot also be the definition of what is correct.
// Keep this list in step with the `copies` map in scripts/build-site.mjs and
// with EXPECTED_PAYLOAD in scripts/verify-live-site.mjs; the reported total
// below is derived from it, so adding an entry here is the only edit a new
// payload file needs.
const EXPECTED_PAYLOAD = Object.freeze([
  'app.js', 'data/curriculum-observatory.json', 'index.html',
  'modules/browser-dom-adapter.js', 'modules/browser-fallback-orchestrator.js',
  'modules/browser-node-selection.js', 'modules/browser-renderer.js',
  'modules/browser-three-adapter.js', 'modules/canonical.js',
  'modules/direct-relations.js', 'modules/frame-scheduler.js',
  'modules/pixel-evidence.js', 'modules/projections.js',
  'modules/three-focus-target.js', 'modules/three-runtime.js',
  'modules/three-selection-projection.js', 'modules/three-viewport-lifecycle.js',
  'styles.css', 'vendor/three.core.js', 'vendor/three.module.js'
]);
const GIT_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

// A misordered pin would surface as a confusing fileset mismatch against a
// perfectly good deployment, so fail on the pin itself before probing the site.
assert(EXPECTED_PAYLOAD.every((path, index) => index === 0 || EXPECTED_PAYLOAD[index - 1] < path), 'PROVENANCE_CONTINUITY_EXPECTED_PAYLOAD_ORDER');

function settings() {
  const rawUrl = process.env.SITE_URL;
  const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
  assert(rawUrl, 'PROVENANCE_CONTINUITY_CONFIG:SITE_URL');
  assert(expectedSourceSha && GIT_SHA.test(expectedSourceSha), 'PROVENANCE_CONTINUITY_CONFIG:EXPECTED_SOURCE_SHA');
  const siteUrl = new URL(rawUrl);
  assert(siteUrl.protocol === 'https:', 'PROVENANCE_CONTINUITY_CONFIG:SITE_URL_HTTPS');
  assert(!siteUrl.username && !siteUrl.password && !siteUrl.search && !siteUrl.hash, 'PROVENANCE_CONTINUITY_CONFIG:SITE_URL_SHAPE');
  siteUrl.pathname = `${siteUrl.pathname.replace(/\/+$/u, '')}/`;
  return { siteUrl, expectedSourceSha };
}

function provenanceUrl(siteUrl) {
  const url = new URL('deployment-provenance.json', siteUrl);
  assert(url.origin === siteUrl.origin && url.pathname.startsWith(siteUrl.pathname), 'PROVENANCE_CONTINUITY_URL_ESCAPE');
  url.searchParams.set('__continuity_probe', randomUUID());
  return url;
}

async function fetchManifest(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache'
    }
  });
  assert(response.status === 200, `PROVENANCE_CONTINUITY_HTTP_${response.status}`);
  assert(response.url === url.href, `PROVENANCE_CONTINUITY_REDIRECT:${response.url}`);
  try { return JSON.parse(await response.text()); }
  catch { fail('PROVENANCE_CONTINUITY_JSON'); }
}

function validateManifest(manifest, expectedSourceSha) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'PROVENANCE_CONTINUITY_SHAPE');
  assert(Object.keys(manifest).sort().join(',') === 'files,lockfileSha256,schemaVersion,sourceSha', 'PROVENANCE_CONTINUITY_KEYS');
  assert(manifest.schemaVersion === '1.0.0', 'PROVENANCE_CONTINUITY_SCHEMA');
  assert(manifest.sourceSha === expectedSourceSha, `PROVENANCE_CONTINUITY_SOURCE_SHA:${manifest.sourceSha}`);
  assert(typeof manifest.lockfileSha256 === 'string' && SHA256.test(manifest.lockfileSha256), 'PROVENANCE_CONTINUITY_LOCKFILE_SHA');
  assert(Array.isArray(manifest.files) && manifest.files.length === EXPECTED_PAYLOAD.length, `PROVENANCE_CONTINUITY_FILE_COUNT:${Array.isArray(manifest.files) ? manifest.files.length : 'not-an-array'}/${EXPECTED_PAYLOAD.length}`);
  const paths = manifest.files.map((entry) => entry?.path);
  assert(paths.every((path, index) => path === EXPECTED_PAYLOAD[index]), `PROVENANCE_CONTINUITY_FILESET:${paths.join(',')}`);
  for (const entry of manifest.files) {
    assert(entry && Object.keys(entry).sort().join(',') === 'bytes,path,sha256', `PROVENANCE_CONTINUITY_ENTRY_KEYS:${entry?.path}`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `PROVENANCE_CONTINUITY_BYTES:${entry.path}`);
    assert(typeof entry.sha256 === 'string' && SHA256.test(entry.sha256), `PROVENANCE_CONTINUITY_DIGEST:${entry.path}`);
  }
}

async function probe(siteUrl, expectedSourceSha) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const manifest = await fetchManifest(provenanceUrl(siteUrl));
      validateManifest(manifest, expectedSourceSha);
      console.log(`PUBLIC_PROVENANCE_CONTINUITY_PASS:${expectedSourceSha}:attempt=${attempt}:files=${EXPECTED_PAYLOAD.length}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Public provenance continuity attempt ${attempt}/3: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < 3) await sleep(10_000);
    }
  }
  throw new Error('PUBLIC_PROVENANCE_CONTINUITY_FAILED', { cause: lastError });
}

try {
  const { siteUrl, expectedSourceSha } = settings();
  console.log(`Public provenance continuity target: ${siteUrl.href}`);
  await probe(siteUrl, expectedSourceSha);
} catch (error) {
  console.error(error instanceof Error ? `${error.message}${error.cause ? `\nCaused by: ${error.cause}` : ''}` : String(error));
  process.exitCode = 1;
}
