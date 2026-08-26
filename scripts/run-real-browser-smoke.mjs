import { spawn } from 'node:child_process';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { closeServerBounded, usesDetachedProcessGroup, waitForBrowserExit } from './browser-smoke-process.mjs';

const repositoryRoot = resolve(process.cwd());
const chrome = process.env.CHROME_BIN || 'google-chrome';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8']
]);
const allCases = [
  { id: 'm3d-dom', serveRoot: repositoryRoot, page: 'tests/real-browser-dom-smoke.html', pass: 'M3D_BROWSER_SMOKE_PASS', fail: 'M3D_BROWSER_SMOKE_FAIL', flags: ['--disable-gpu'] },
  { id: 'm3f-three', serveRoot: repositoryRoot, page: 'tests/real-browser-three-smoke.html', pass: 'M3F_BROWSER_SMOKE_PASS', fail: 'M3F_BROWSER_SMOKE_FAIL', flags: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  { id: 'm3g-artifact', serveRoot: resolve(repositoryRoot, 'dist-site'), page: 'index.html', pass: 'M3G_SITE_SMOKE_PASS', fail: 'M3G_SITE_SMOKE_FAIL', flags: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
];
const selectedCase = process.env.BROWSER_SMOKE_CASE;
const cases = selectedCase === undefined ? allCases : allCases.filter((testCase) => testCase.id === selectedCase);
if (cases.length === 0) throw new Error(`unknown BROWSER_SMOKE_CASE: ${String(selectedCase)}`);

let activeCase = cases[0];
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  let relative;
  try {
    relative = pathname === '/' ? activeCase.page : decodeURIComponent(pathname.slice(1));
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolve(activeCase.serveRoot, normalize(relative));
  if (file !== activeCase.serveRoot && !file.startsWith(`${activeCase.serveRoot}${sep}`)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const physicalRoot = realpathSync(activeCase.serveRoot);
    const physicalFile = realpathSync(file);
    if (physicalFile !== physicalRoot && !physicalFile.startsWith(`${physicalRoot}${sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (!statSync(physicalFile).isFile()) throw new Error('not-file');
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(physicalFile)) ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    createReadStream(physicalFile).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
});

const timeoutMs = 60_000;
const shutdownGraceMs = 2_000;

async function runCase(testCase, port) {
  activeCase = testCase;
  const url = `http://127.0.0.1:${port}/${testCase.page}`;
  const browser = spawn(chrome, ['--headless=new', '--no-sandbox', ...testCase.flags, '--dump-dom', url], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: usesDetachedProcessGroup
  });
  let stdout = '';
  let stderr = '';
  browser.stdout.setEncoding('utf8');
  browser.stderr.setEncoding('utf8');
  browser.stdout.on('data', (chunk) => { stdout += chunk; });
  browser.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = await waitForBrowserExit(browser, testCase.page, { timeoutMs, shutdownGraceMs });
  if (exit.code !== 0 || exit.signal !== null) throw new Error(`Chrome failed for ${testCase.page}: code=${String(exit.code)} signal=${String(exit.signal)}\n${stderr}`);
  const resultMatch = stdout.match(/<pre\b[^>]*\bid="result"[^>]*>([\s\S]*?)<\/pre>/u);
  if (resultMatch === null) throw new Error(`browser page did not serialize #result for ${testCase.page}\n${stdout}\n${stderr}`);
  const resultText = resultMatch[1]?.trim() ?? '';
  if (resultText.startsWith(testCase.fail)) throw new Error(`browser page reported failure for ${testCase.page}\n${resultText}`);
  if (resultText !== testCase.pass) throw new Error(`browser page reported unexpected result for ${testCase.page}: ${resultText}`);
  console.log(testCase.pass);
}

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('ephemeral port unavailable');
  for (const testCase of cases) await runCase(testCase, address.port);
} finally {
  await closeServerBounded(server, shutdownGraceMs);
}
