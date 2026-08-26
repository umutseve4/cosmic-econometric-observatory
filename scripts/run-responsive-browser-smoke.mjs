import { spawn } from 'node:child_process';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { closeServerBounded, usesDetachedProcessGroup, waitForBrowserExit } from './browser-smoke-process.mjs';

if (process.env.BROWSER_SMOKE_CASE !== undefined) process.exit(0);

const root = resolve(process.cwd());
const chrome = process.env.CHROME_BIN || 'google-chrome';
const widths = [320, 360, 390, 768, 1440];
const modes = ['default', 'fallback'];
const pass = 'RESPONSIVE_PRODUCT_SMOKE_PASS';
const fail = 'RESPONSIVE_PRODUCT_SMOKE_FAIL';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.map', 'application/json; charset=utf-8']
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  let relative;
  try { relative = pathname === '/' ? 'tests/real-browser-responsive-smoke.html' : decodeURIComponent(pathname.slice(1)); }
  catch { response.writeHead(400).end('bad request'); return; }
  const file = resolve(root, normalize(relative));
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end('forbidden'); return; }
  try {
    const physicalRoot = realpathSync(root); const physicalFile = realpathSync(file);
    if (physicalFile !== physicalRoot && !physicalFile.startsWith(`${physicalRoot}${sep}`)) { response.writeHead(403).end('forbidden'); return; }
    if (!statSync(physicalFile).isFile()) throw new Error('not-file');
    response.writeHead(200, { 'content-type': contentTypes.get(extname(physicalFile)) ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(physicalFile).pipe(response);
  } catch { response.writeHead(404).end('not found'); }
});
const timeoutMs = 60_000; const shutdownGraceMs = 2_000;

async function runCase(width, mode, port) {
  const url = `http://127.0.0.1:${port}/tests/real-browser-responsive-smoke.html?width=${width}&mode=${mode}`;
  const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${Math.max(width, 500)},1000`, '--dump-dom', url], {
    stdio: ['ignore', 'pipe', 'pipe'], detached: usesDetachedProcessGroup
  });
  let stdout = ''; let stderr = '';
  browser.stdout.setEncoding('utf8'); browser.stderr.setEncoding('utf8');
  browser.stdout.on('data', (chunk) => { stdout += chunk; });
  browser.stderr.on('data', (chunk) => { stderr += chunk; });
  const label = `responsive-${mode}-${width}`;
  const exit = await waitForBrowserExit(browser, label, { timeoutMs, shutdownGraceMs });
  if (exit.code !== 0 || exit.signal !== null) throw new Error(`Chrome failed at ${mode}/${width}px: code=${String(exit.code)} signal=${String(exit.signal)}\n${stderr}`);
  const match = stdout.match(/<pre\b[^>]*\bid="result"[^>]*>([\s\S]*?)<\/pre>/u);
  if (match === null) throw new Error(`responsive page did not serialize #result at ${mode}/${width}px`);
  const text = match[1]?.trim() ?? '';
  if (text.startsWith(fail)) throw new Error(`${mode}/${width}px ${text}`);
  if (text !== pass) throw new Error(`${mode}/${width}px unexpected result:${text}`);
  console.log(`${label}:${pass}`);
}

try {
  await new Promise((resolveListen, rejectListen) => { server.once('error', rejectListen); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('ephemeral port unavailable');
  for (const mode of modes) for (const width of widths) await runCase(width, mode, address.port);
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error(`::error title=Responsive product smoke::${escaped}`);
  throw error;
} finally { await closeServerBounded(server, shutdownGraceMs); }
