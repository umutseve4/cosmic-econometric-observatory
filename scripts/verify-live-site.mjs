#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';

const EXPECTED_PAYLOAD = Object.freeze([
  'app.js', 'index.html', 'modules/browser-dom-adapter.js',
  'modules/browser-fallback-orchestrator.js', 'modules/browser-node-selection.js',
  'modules/browser-renderer.js', 'modules/browser-three-adapter.js',
  'modules/canonical.js', 'modules/projections.js', 'styles.css',
  'vendor/three.core.js', 'vendor/three.module.js'
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

function settings() {
  const rawUrl = process.env.SITE_URL;
  const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
  assert(rawUrl, 'LIVE_VERIFY_CONFIG:SITE_URL');
  assert(expectedSourceSha && GIT_SHA.test(expectedSourceSha), 'LIVE_VERIFY_CONFIG:EXPECTED_SOURCE_SHA');
  const siteUrl = new URL(rawUrl);
  assert(siteUrl.protocol === 'https:', 'LIVE_VERIFY_CONFIG:SITE_URL_HTTPS');
  assert(!siteUrl.username && !siteUrl.password && !siteUrl.search && !siteUrl.hash, 'LIVE_VERIFY_CONFIG:SITE_URL_SHAPE');
  siteUrl.pathname = `${siteUrl.pathname.replace(/\/+$/u, '')}/`;
  return { siteUrl, expectedSourceSha };
}

function childUrl(base, path, nonce = randomUUID()) {
  assert(isSafeRelative(path), `LIVE_VERIFY_UNSAFE_PATH:${String(path)}`);
  const url = new URL(path, base);
  assert(url.origin === base.origin && url.pathname.startsWith(base.pathname), `LIVE_VERIFY_URL_ESCAPE:${path}`);
  url.searchParams.set('__production_verify', nonce);
  return url;
}

function isSafeRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    !value.startsWith('/') && !value.includes('\\') && !value.includes('?') && !value.includes('#') &&
    !/[\u0000-\u001f\u007f]/u.test(value) && value.split('/').every((part) => part && part !== '.' && part !== '..');
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { accept: '*/*', 'cache-control': 'no-cache, no-store, max-age=0', pragma: 'no-cache' }
  });
  assert(response.status === 200, `HTTP_${response.status}`);
  assert(response.url.startsWith(`${url.origin}${url.pathname}`), `LIVE_VERIFY_REDIRECT:${url.pathname}:${response.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, finalUrl: response.url };
}

async function retry(label, attempts, delayMs, operation) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      lastError = error;
      console.error(`${label} attempt ${attempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`${label}_FAILED`, { cause: lastError });
}

function parseManifest(bytes, expectedSourceSha) {
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { fail('LIVE_VERIFY_MANIFEST_JSON'); }
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'LIVE_VERIFY_MANIFEST_SHAPE');
  assert(manifest.schemaVersion === '1.0.0', 'LIVE_VERIFY_MANIFEST_SCHEMA');
  assert(manifest.sourceSha === expectedSourceSha, `LIVE_VERIFY_SOURCE_SHA:${manifest.sourceSha}`);
  assert(SHA256.test(manifest.lockfileSha256), 'LIVE_VERIFY_LOCKFILE_SHA');
  assert(Array.isArray(manifest.files) && manifest.files.length === 12, 'LIVE_VERIFY_MANIFEST_FILE_COUNT');
  const paths = manifest.files.map((entry) => entry?.path);
  assert(paths.every(isSafeRelative), 'LIVE_VERIFY_MANIFEST_PATH');
  assert(new Set(paths).size === paths.length, 'LIVE_VERIFY_MANIFEST_DUPLICATE');
  assert(paths.every((path, index) => index === 0 || paths[index - 1] < path), 'LIVE_VERIFY_MANIFEST_ORDER');
  assert(paths.every((path, index) => path === EXPECTED_PAYLOAD[index]), `LIVE_VERIFY_MANIFEST_FILESET:${paths.join(',')}`);
  for (const entry of manifest.files) {
    assert(entry && Object.keys(entry).sort().join(',') === 'bytes,path,sha256', `LIVE_VERIFY_MANIFEST_ENTRY_KEYS:${entry?.path}`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `LIVE_VERIFY_MANIFEST_BYTES:${entry.path}`);
    assert(typeof entry.sha256 === 'string' && SHA256.test(entry.sha256), `LIVE_VERIFY_MANIFEST_DIGEST:${entry.path}`);
  }
  return manifest;
}

async function verifyArtifact(siteUrl, expectedSourceSha) {
  const manifest = await retry('manifest', 12, 10_000, async () => {
    const { bytes } = await fetchBytes(childUrl(siteUrl, 'artifact-manifest.json'));
    return parseManifest(bytes, expectedSourceSha);
  });
  for (const entry of manifest.files) {
    await retry(`payload:${entry.path}`, 3, 2_000, async () => {
      const { bytes } = await fetchBytes(childUrl(siteUrl, entry.path));
      assert(bytes.length === entry.bytes, `LIVE_VERIFY_PAYLOAD_BYTES:${entry.path}:${bytes.length}:${entry.bytes}`);
      const digest = createHash('sha256').update(bytes).digest('hex');
      assert(digest === entry.sha256, `LIVE_VERIFY_PAYLOAD_DIGEST:${entry.path}:${digest}:${entry.sha256}`);
    });
  }
  console.log(`Artifact PASS: source=${manifest.sourceSha}; files=13/13; payload=12/12`);
}

class Cdp {
  constructor(url) { this.url = url; this.pending = new Map(); this.nextId = 1; }
  async open() {
    this.socket = new WebSocket(this.url);
    await Promise.race([once(this.socket, 'open'), sleep(10_000).then(() => fail('CDP_OPEN_TIMEOUT'))]);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP_ERROR:${message.error.message}`)); else pending.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('CDP_CLOSED')); }
      this.pending.clear();
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP_TIMEOUT:${method}`)); }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(); }
}

async function waitForDevtools(port) {
  return retry('devtools', 40, 250, async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) });
    assert(response.ok, `DEVTOOLS_HTTP_${response.status}`);
    return response.json();
  });
}

function hasChromeStopped(chrome) {
  return chrome.exitCode !== null || chrome.signalCode !== null;
}

async function stopChrome(chrome) {
  if (hasChromeStopped(chrome)) return;
  chrome.kill('SIGTERM');
  await Promise.race([once(chrome, 'exit'), sleep(5_000)]);
  if (!hasChromeStopped(chrome)) {
    chrome.kill('SIGKILL');
    await Promise.race([once(chrome, 'exit'), sleep(2_000)]);
  }
  assert(hasChromeStopped(chrome), 'CHROME_CLEANUP_TIMEOUT');
}

async function runBrowserCase(siteUrl, testCase, port) {
  const targetUrl = new URL(siteUrl);
  targetUrl.searchParams.set('__production_verify', randomUUID());
  if (testCase.forceFallback) targetUrl.searchParams.set('forceFallback', '1');
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    '--disable-background-networking', '--disable-component-update', '--no-first-run', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; chrome.stderr.setEncoding('utf8'); chrome.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  let browser;
  let page;
  let targetId;
  try {
    const version = await waitForDevtools(port);
    browser = new Cdp(version.webSocketDebuggerUrl); await browser.open();
    const created = await browser.call('Target.createTarget', { url: 'about:blank' });
    targetId = created.targetId;
    const target = await retry('page-target', 20, 100, async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) });
      assert(response.ok, `PAGE_TARGET_HTTP_${response.status}`);
      const targets = await response.json();
      const match = targets.find((candidate) => candidate.id === targetId);
      assert(match?.webSocketDebuggerUrl, 'CDP_PAGE_TARGET');
      return match;
    });
    page = new Cdp(target.webSocketDebuggerUrl); await page.open();
    await page.call('Network.enable'); await page.call('Network.setCacheDisabled', { cacheDisabled: true });
    await page.call('Network.setBypassServiceWorker', { bypass: true });
    await page.call('Emulation.setDeviceMetricsOverride', { width: testCase.width, height: testCase.height, deviceScaleFactor: 1, mobile: testCase.width < 600 });
    await page.call('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.call('Page.enable'); await page.call('Page.navigate', { url: targetUrl.href });
    const expression = `new Promise((resolve, reject) => {
      const deadline = Date.now() + 20000;
      const read = () => {
        const result = document.querySelector('#result')?.textContent?.trim() || '';
        if (result.startsWith('M3G_SITE_SMOKE_FAIL')) return reject(new Error(result));
        if (result === 'M3G_SITE_SMOKE_PASS') {
          const visual = document.querySelector('#webgl-universe');
          const html = document.querySelector('#html-universe');
          const ids = (root, attr) => [...root.querySelectorAll('[' + attr + ']')].map((el) => el.getAttribute(attr));
          return resolve({ result, lang: document.documentElement.lang, title: document.title, bodyText: document.body.innerText, renderMode: visual?.dataset.renderMode || '', overflow: document.documentElement.scrollWidth - ${testCase.width}, htmlNodeIds: ids(html, 'data-node-id'), htmlEdgeIds: ids(html, 'data-edge-id'), visualNodeIds: ids(visual, 'data-node-id'), visualEdgeIds: ids(visual, 'data-edge-id'), canvasCount: visual?.querySelectorAll('canvas[aria-hidden="true"]').length || 0, svgCount: visual?.querySelectorAll('svg').length || 0 });
        }
        if (Date.now() >= deadline) return reject(new Error('RUNTIME_MARKER_TIMEOUT:' + result));
        setTimeout(read, 100);
      }; read();
    })`;
    const evaluated = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!evaluated.exceptionDetails, `BROWSER_EVALUATION:${testCase.name}`);
    const value = evaluated.result.value;
    const unique = (items) => new Set(items).size;
    assert(value.result === 'M3G_SITE_SMOKE_PASS', `BROWSER_MARKER:${testCase.name}`);
    assert(value.lang === 'tr' && value.title === 'Kozmik Ekonometri Rasathanesi' && value.bodyText.includes('Bilgi düğümleri ve ilişkiler'), `BROWSER_TURKISH_SURFACE:${testCase.name}`);
    assert(value.renderMode === testCase.expectedMode, `BROWSER_MODE:${testCase.name}:${value.renderMode}`);
    assert(value.overflow <= 0, `BROWSER_OVERFLOW:${testCase.name}:${value.overflow}`);
    assert(unique(value.htmlNodeIds) === 5 && unique(value.htmlEdgeIds) === 4, `BROWSER_HTML_PARITY:${testCase.name}`);
    if (testCase.expectedMode === 'fallback') assert(unique(value.visualNodeIds) === 5 && unique(value.visualEdgeIds) === 4 && value.svgCount === 1, `BROWSER_FALLBACK_PARITY:${testCase.name}`);
    else assert(value.canvasCount === 1, `BROWSER_THREE_ACCESSIBILITY:${testCase.name}`);
    console.log(`Browser PASS: ${testCase.name}; ${testCase.width}x${testCase.height}; mode=${value.renderMode}; nodes=5; edges=4`);
  } finally {
    try { if (browser && targetId) await browser.call('Target.closeTarget', { targetId }); } catch { /* bounded browser shutdown follows */ }
    page?.close(); browser?.close(); await stopChrome(chrome);
    if (chrome.exitCode && chrome.exitCode !== 0) console.error(stderr);
  }
}

async function verifyBrowser(siteUrl) {
  const cases = [
    { name: 'mobile-default', width: 390, height: 844, forceFallback: false, expectedMode: 'three' },
    { name: 'mobile-fallback', width: 390, height: 844, forceFallback: true, expectedMode: 'fallback' },
    { name: 'desktop-default', width: 1440, height: 900, forceFallback: false, expectedMode: 'three' },
    { name: 'desktop-fallback', width: 1440, height: 900, forceFallback: true, expectedMode: 'fallback' }
  ];
  let port = 9222;
  for (const testCase of cases) { await runBrowserCase(siteUrl, testCase, port); port += 1; }
  console.log('Canonical production browser PASS: 4/4');
}

try {
  const { siteUrl, expectedSourceSha } = settings();
  console.log(`Production verification target: ${siteUrl.href}`);
  await verifyArtifact(siteUrl, expectedSourceSha);
  await verifyBrowser(siteUrl);
  console.log(`LIVE_PRODUCTION_VERIFY_PASS:${expectedSourceSha}`);
} catch (error) {
  console.error(error instanceof Error ? `${error.message}${error.cause ? `\nCaused by: ${error.cause}` : ''}` : String(error));
  process.exitCode = 1;
}
