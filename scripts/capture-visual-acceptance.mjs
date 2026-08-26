import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, normalize, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const siteRoot = resolve(root, 'dist-site');
const output = resolve(root, process.env.VISUAL_EVIDENCE_DIR || 'visual-acceptance-evidence');
const chrome = process.env.CHROME_BIN || 'google-chrome';
const sourceSha = process.env.SOURCE_SHA ?? '';
if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error('VISUAL_EVIDENCE_INVALID_SOURCE_SHA');
const checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (checkedOutSha !== sourceSha) throw new Error(`VISUAL_EVIDENCE_SOURCE_SHA_MISMATCH:${checkedOutSha}:${sourceSha}`);
const cases = [
  { id: 'VA-M-D', width: 390, height: 844, requestedMode: 'default', query: '' },
  { id: 'VA-M-F', width: 390, height: 844, requestedMode: 'fallback', query: '?force-fallback=true' },
  { id: 'VA-D-D', width: 1440, height: 900, requestedMode: 'default', query: '' },
  { id: 'VA-D-F', width: 1440, height: 900, requestedMode: 'fallback', query: '?force-fallback=true' }
];
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.map', 'application/json; charset=utf-8']
]);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const server = createServer(serveSite);
const profile = mkdtempSync(resolve(tmpdir(), 'cosmic-visual-'));
let browser;
try {
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('VISUAL_EVIDENCE_PORT_UNAVAILABLE');
  browser = await launchBrowser(profile);
  const browserVersion = await getBrowserVersion(browser.httpOrigin);
  const results = [];
  for (const testCase of cases) results.push(await captureCase(testCase, address.port, browser.httpOrigin, browserVersion));
  const evidence = Object.freeze({
    schemaVersion: '1.0.0', sourceSha, generatedAtUtc: new Date().toISOString(), browserVersion,
    canonicalCaseCount: results.length, supportingFullPageCount: results.length, cases: results
  });
  writeFileSync(resolve(output, 'metadata.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(output, 'README.md'), renderReadme(evidence), 'utf8');
  console.log(`VISUAL_ACCEPTANCE_EVIDENCE_PASS:${sourceSha}:4/4`);
} finally {
  if (browser?.child !== undefined) await stopBrowser(browser.child);
  await closeServer(server);
  rmSync(profile, { recursive: true, force: true });
}

function serveSite(request, response) {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  let relative;
  try { relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); }
  catch { response.writeHead(400).end('bad request'); return; }
  const file = resolve(siteRoot, normalize(relative));
  if (file !== siteRoot && !file.startsWith(`${siteRoot}${sep}`)) { response.writeHead(403).end('forbidden'); return; }
  try {
    const physicalRoot = realpathSync(siteRoot); const physicalFile = realpathSync(file);
    if (physicalFile !== physicalRoot && !physicalFile.startsWith(`${physicalRoot}${sep}`)) { response.writeHead(403).end('forbidden'); return; }
    if (!statSync(physicalFile).isFile()) throw new Error('not-file');
    response.writeHead(200, { 'content-type': contentTypes.get(extname(physicalFile)) ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(physicalFile).pipe(response);
  } catch { response.writeHead(404).end('not found'); }
}

async function launchBrowser(profileDirectory) {
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.setEncoding('utf8');
  let stderr = '';
  try {
    return await new Promise((resolveLaunch, rejectLaunch) => {
      const timeout = setTimeout(() => rejectLaunch(new Error(`VISUAL_EVIDENCE_BROWSER_TIMEOUT\n${stderr}`)), 20_000);
      child.once('error', (error) => { clearTimeout(timeout); rejectLaunch(error); });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on ws:\/\/(127\.0\.0\.1|localhost):(\d+)\//u);
        if (match !== null) { clearTimeout(timeout); resolveLaunch({ child, httpOrigin: `http://127.0.0.1:${match[2]}` }); }
      });
      child.once('close', (code, signal) => { clearTimeout(timeout); rejectLaunch(new Error(`VISUAL_EVIDENCE_BROWSER_EXIT:${String(code)}:${String(signal)}\n${stderr}`)); });
    });
  } catch (error) {
    await stopBrowser(child);
    throw error;
  }
}

async function getBrowserVersion(httpOrigin) {
  const response = await fetch(`${httpOrigin}/json/version`);
  if (!response.ok) throw new Error(`VISUAL_EVIDENCE_VERSION_HTTP:${response.status}`);
  const body = await response.json();
  if (typeof body.Browser !== 'string' || body.Browser.length === 0) throw new Error('VISUAL_EVIDENCE_VERSION_MISSING');
  return body.Browser;
}

async function captureCase(testCase, port, httpOrigin, browserVersion) {
  const route = `http://127.0.0.1:${port}/index.html${testCase.query}`;
  const preflight = await fetch(route, { cache: 'no-store' });
  if (preflight.status !== 200) throw new Error(`VISUAL_EVIDENCE_ROUTE_HTTP:${testCase.id}:${preflight.status}`);
  await preflight.arrayBuffer();
  const pageResponse = await fetch(`${httpOrigin}/json/new?about:blank`, { method: 'PUT' });
  if (!pageResponse.ok) throw new Error(`VISUAL_EVIDENCE_PAGE_HTTP:${pageResponse.status}`);
  const page = await pageResponse.json();
  if (typeof page.webSocketDebuggerUrl !== 'string') throw new Error('VISUAL_EVIDENCE_PAGE_SOCKET_MISSING');
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  try {
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Network.enable');
    await cdp.call('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.call('Network.setBypassServiceWorker', { bypass: true });
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: testCase.width, height: testCase.height, deviceScaleFactor: 1, mobile: testCase.width < 600
    });
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const navigation = await cdp.call('Page.navigate', { url: route });
    if (typeof navigation.errorText === 'string' && navigation.errorText.length > 0) throw new Error(`VISUAL_EVIDENCE_NAVIGATION:${testCase.id}:${navigation.errorText}`);
    const state = await cdp.call('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        const deadline = Date.now() + 20000;
        let runtimeMarker = '';
        while (Date.now() < deadline) {
          runtimeMarker = (document.querySelector('#result')?.textContent || '').trim();
          if (runtimeMarker === 'M3G_SITE_SMOKE_PASS') break;
          if (runtimeMarker !== '' && runtimeMarker !== 'RUNNING') throw new Error('runtime:' + runtimeMarker);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (runtimeMarker !== 'M3G_SITE_SMOKE_PASS') throw new Error('runtime-timeout:' + runtimeMarker);
        let fontReady = false;
        await Promise.race([
          document.fonts.ready.then(() => { fontReady = true; }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('font-timeout')), 10000))
        ]);
        const freeze = document.createElement('style');
        freeze.dataset.visualEvidence = 'frozen';
        freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
        document.head.append(freeze);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const visual = document.querySelector('#webgl-universe');
        const viewport = document.querySelector('.viewport-frame');
        const semantic = document.querySelector('#semantic-universe');
        const hero = document.querySelector('.hero');
        const bodyStyle = getComputedStyle(document.body);
        const titleStyle = getComputedStyle(document.querySelector('#hero-title'));
        return {
          finalUrl: location.href, runtimeMarker, observedMode: visual?.dataset.renderMode || null,
          documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
          viewportFrame: viewport ? { width: viewport.getBoundingClientRect().width, height: viewport.getBoundingClientRect().height } : null,
          heroBottom: hero?.getBoundingClientRect().bottom ?? null,
          semanticTop: semantic?.getBoundingClientRect().top ?? null,
          fonts: (() => {
            const requestedFamilies = ['DM Sans', 'Libre Franklin'].map((family) => {
              const faces = Array.from(document.fonts).filter((face) => face.family.replaceAll('"', '') === family);
              return { family, faceCount: faces.length, statuses: faces.map((face) => face.status), checkResult: document.fonts.check('16px "' + family + '"') };
            });
            return { status: document.fonts.status, readyWithin10s: fontReady, renderState: requestedFamilies.every((item) => item.faceCount > 0 && item.statuses.every((status) => status === 'loaded')) ? 'loaded' : 'fallback', requestedFamilies, bodyFamily: bodyStyle.fontFamily, titleFamily: titleStyle.fontFamily };
          })()
        };
      })()`
    }, 35_000);
    if (state.exceptionDetails !== undefined) throw new Error(`VISUAL_EVIDENCE_PAGE_FAILURE:${testCase.id}:${state.exceptionDetails.exception?.description ?? state.exceptionDetails.text ?? 'evaluation'}`);
    const observed = state.result?.value;
    const expectedMode = testCase.requestedMode === 'fallback' ? 'fallback' : 'three';
    if (observed?.finalUrl !== route) throw new Error(`VISUAL_EVIDENCE_FINAL_URL:${testCase.id}:${String(observed?.finalUrl)}`);
    if (observed?.observedMode !== expectedMode) throw new Error(`VISUAL_EVIDENCE_MODE_MISMATCH:${testCase.id}:${String(observed?.observedMode)}`);
    if (observed?.fonts?.status !== 'loaded' || observed.fonts.readyWithin10s !== true) throw new Error(`VISUAL_EVIDENCE_FONT_UNSTABLE:${testCase.id}`);
    if (observed.documentWidth > testCase.width) throw new Error(`VISUAL_EVIDENCE_HORIZONTAL_OVERFLOW:${testCase.id}:${observed.documentWidth}/${testCase.width}`);

    const viewportPng = await screenshot(cdp, false);
    const viewportFile = `${testCase.id}-viewport.png`;
    const viewportPath = resolve(output, viewportFile);
    writeFileSync(viewportPath, viewportPng, { flag: 'wx' });
    const viewportDimensions = pngDimensions(viewportPng);
    if (viewportDimensions.width !== testCase.width || viewportDimensions.height !== testCase.height) throw new Error(`VISUAL_EVIDENCE_VIEWPORT_SIZE:${testCase.id}:${viewportDimensions.width}x${viewportDimensions.height}`);

    const metrics = await cdp.call('Page.getLayoutMetrics');
    const contentWidth = Math.ceil(metrics.cssContentSize.width);
    const contentHeight = Math.ceil(metrics.cssContentSize.height);
    const fullPng = await screenshot(cdp, true, { x: 0, y: 0, width: contentWidth, height: contentHeight, scale: 1 });
    const fullFile = `${testCase.id}-full-page.png`;
    const fullPath = resolve(output, fullFile);
    writeFileSync(fullPath, fullPng, { flag: 'wx' });
    const fullDimensions = pngDimensions(fullPng);
    if (fullDimensions.width !== testCase.width || fullDimensions.height < testCase.height) throw new Error(`VISUAL_EVIDENCE_FULL_SIZE:${testCase.id}:${fullDimensions.width}x${fullDimensions.height}`);

    return Object.freeze({
      id: testCase.id, sourceSha, route: `/index.html${testCase.query}`, finalUrl: observed.finalUrl, httpStatus: preflight.status, requestedMode: testCase.requestedMode,
      observedMode: observed.observedMode, viewport: { width: testCase.width, height: testCase.height, deviceScaleFactor: 1, mobile: testCase.width < 600 },
      capturedAtUtc: new Date().toISOString(), browserVersion, runtimeMarker: observed.runtimeMarker, document: { width: observed.documentWidth, height: observed.documentHeight },
      layout: { viewportFrame: observed.viewportFrame, heroBottom: observed.heroBottom, semanticTop: observed.semanticTop }, fonts: observed.fonts,
      canonicalScreenshot: { file: viewportFile, sha256: sha256(viewportPng), ...viewportDimensions },
      supportingFullPageScreenshot: { file: fullFile, sha256: sha256(fullPng), ...fullDimensions }
    });
  } finally {
    cdp.close();
    await fetch(`${httpOrigin}/json/close/${page.id}`, { method: 'PUT' }).catch(() => undefined);
  }
}

function connectCdp(url) {
  return new Promise((resolveConnect, rejectConnect) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const connectionTimeout = setTimeout(() => {
      socket.close();
      rejectConnect(new Error('VISUAL_EVIDENCE_CDP_CONNECT_TIMEOUT'));
    }, 10_000);
    socket.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
      resolveConnect({
      call(method, params = {}, timeoutMs = 15_000) {
        const id = nextId++;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveCall, rejectCall) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            rejectCall(new Error(`CDP timeout:${method}:${timeoutMs}`));
          }, timeoutMs);
          pending.set(id, {
            method,
            resolveCall(value) { clearTimeout(timer); resolveCall(value); },
            rejectCall(error) { clearTimeout(timer); rejectCall(error); }
          });
        });
      },
        close() { socket.close(); }
      });
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(connectionTimeout);
      rejectConnect(new Error('VISUAL_EVIDENCE_CDP_SOCKET'));
    }, { once: true });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!Number.isInteger(message.id) || !pending.has(message.id)) return;
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error !== undefined) request.rejectCall(new Error(`CDP ${request.method}:${message.error.message}`));
      else request.resolveCall(message.result ?? {});
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) request.rejectCall(new Error(`CDP closed:${request.method}`));
      pending.clear();
    });
  });
}

async function screenshot(cdp, fullPage, clip) {
  const result = await cdp.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: fullPage, ...(clip === undefined ? {} : { clip }) });
  if (typeof result.data !== 'string' || result.data.length === 0) throw new Error('VISUAL_EVIDENCE_SCREENSHOT_MISSING');
  return Buffer.from(result.data, 'base64');
}
function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('VISUAL_EVIDENCE_INVALID_PNG');
  return Object.freeze({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function listen(value) { return new Promise((resolveListen, rejectListen) => { value.once('error', rejectListen); value.listen(0, '127.0.0.1', resolveListen); }); }
function closeServer(value) {
  if (!value.listening) return Promise.resolve();
  return new Promise((resolveClose) => {
    const timeout = setTimeout(() => { value.closeAllConnections(); resolveClose(); }, 2000);
    value.close(() => { clearTimeout(timeout); resolveClose(); });
  });
}
async function stopBrowser(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolveExit) => child.once('close', resolveExit)), new Promise((resolveWait) => setTimeout(resolveWait, 2000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
function renderReadme(evidence) {
  const rows = evidence.cases.map((item) => `| ${item.id} | ${item.viewport.width}×${item.viewport.height} | ${item.requestedMode} | ${item.observedMode} | \`${item.canonicalScreenshot.file}\` | \`${item.supportingFullPageScreenshot.file}\` |`).join('\n');
  return `# Visual acceptance evidence\n\n- Exact source SHA: \`${evidence.sourceSha}\`\n- Generated (UTC): \`${evidence.generatedAtUtc}\`\n- Browser: \`${evidence.browserVersion}\`\n- Canonical captures: \`${evidence.canonicalCaseCount}/4\`\n- Supporting full-page captures: \`${evidence.supportingFullPageCount}/4\`\n\n| ID | Viewport | Requested | Observed | Canonical first fold | Supporting full page |\n|---|---:|---|---|---|---|\n${rows}\n\nEvery PNG digest, capture timestamp, font state, runtime marker, route, layout measurement, and observed render mode is recorded in \`metadata.json\`. Human rubric review remains mandatory; successful capture is not visual acceptance.\n`;
}
