import { spawn } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const passMarker = 'M3D_BROWSER_SMOKE_PASS';
const failMarker = 'M3D_BROWSER_SMOKE_FAIL';
const chrome = process.env.CHROME_BIN || 'google-chrome';
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8']
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const relative = pathname === '/' ? 'tests/real-browser-dom-smoke.html' : decodeURIComponent(pathname.slice(1));
  const file = resolve(root, normalize(relative));
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error('not-file');
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
});

const timeoutMs = 30_000;
let browser;
const timeout = setTimeout(() => {
  browser?.kill('SIGKILL');
  server.close();
  console.error(`real-browser smoke timed out after ${timeoutMs}ms`);
  process.exitCode = 1;
}, timeoutMs);

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('ephemeral port unavailable');
  const url = `http://127.0.0.1:${address.port}/tests/real-browser-dom-smoke.html`;
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--dump-dom', url], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  browser.stdout.setEncoding('utf8');
  browser.stderr.setEncoding('utf8');
  browser.stdout.on('data', (chunk) => { stdout += chunk; });
  browser.stderr.on('data', (chunk) => { stderr += chunk; });
  const result = await new Promise((resolveExit, rejectExit) => {
    browser.once('error', rejectExit);
    browser.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  if (result.code !== 0 || result.signal !== null) {
    throw new Error(`Chrome failed: code=${String(result.code)} signal=${String(result.signal)}\n${stderr}`);
  }
  if (stdout.includes(failMarker)) throw new Error(`browser page reported failure\n${stdout}`);
  if (!stdout.includes(passMarker)) throw new Error(`browser page did not report ${passMarker}\n${stdout}\n${stderr}`);
  console.log(passMarker);
} finally {
  clearTimeout(timeout);
  await new Promise((resolveClose) => server.close(resolveClose));
}
