import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { closeServerBounded, waitForBrowserExit } from '../scripts/browser-smoke-process.mjs';

class FakeStream {
  destroyed = false;
  destroy() { this.destroyed = true; }
}

class FakeChild extends EventEmitter {
  pid = 123;
  killCalls = 0;
  unrefCalls = 0;
  stdin = new FakeStream();
  stdout = new FakeStream();
  stderr = new FakeStream();
  kill() {
    this.killCalls += 1;
    return true;
  }
  unref() { this.unrefCalls += 1; }
}

test('browser exit resolves before its case deadline', async () => {
  const child = new FakeChild();
  setTimeout(() => child.emit('close', 0, null), 5);
  assert.deepEqual(await waitForBrowserExit(child, 'ok.html', { timeoutMs: 50, shutdownGraceMs: 10 }), { code: 0, signal: null });
});

test('timeout rejects after requesting process-tree termination', async () => {
  const child = new FakeChild();
  let kills = 0;
  const pending = waitForBrowserExit(child, 'hung.html', {
    timeoutMs: 5,
    shutdownGraceMs: 30,
    killTree() {
      kills += 1;
      setTimeout(() => child.emit('close', null, 'SIGKILL'), 2);
    }
  });
  await assert.rejects(pending, /timed out for hung\.html after 5ms; shutdown grace 30ms/u);
  assert.equal(kills, 1);
  assert.equal(child.unrefCalls, 1);
});

test('shutdown deadline releases handles when a child never closes and kill throws', async () => {
  const child = new FakeChild();
  const started = Date.now();
  await assert.rejects(waitForBrowserExit(child, 'stuck.html', {
    timeoutMs: 5,
    shutdownGraceMs: 10,
    killTree() { throw new Error('kill-failed'); }
  }), /timed out for stuck\.html after 5ms; shutdown grace 10ms/u);
  assert.ok(Date.now() - started < 250);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
  assert.equal(child.unrefCalls, 1);
});

test('real child pipes are released after a failed termination attempt', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => process.stdout.write("alive\\n"), 5)'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  try {
    await assert.rejects(waitForBrowserExit(child, 'real-child.html', {
      timeoutMs: 10,
      shutdownGraceMs: 10,
      killTree() { throw new Error('simulated-denial'); }
    }), /timed out for real-child\.html/u);
    assert.equal(child.stdout.destroyed, true);
    assert.equal(child.stderr.destroyed, true);
  } finally {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
});

test('sequential cases each receive an independent timeout budget', async () => {
  for (const page of ['first.html', 'second.html']) {
    const child = new FakeChild();
    setTimeout(() => child.emit('close', 0, null), 12);
    assert.deepEqual(await waitForBrowserExit(child, page, { timeoutMs: 20, shutdownGraceMs: 10 }), { code: 0, signal: null });
  }
});

test('server shutdown forces open connections at its deadline', async () => {
  const calls = [];
  const server = {
    close(callback) { this.callback = callback; calls.push('close'); },
    closeIdleConnections() { calls.push('idle'); },
    closeAllConnections() { calls.push('all'); }
  };
  const started = Date.now();
  await closeServerBounded(server, 10);
  assert.ok(Date.now() - started < 250);
  assert.deepEqual(calls, ['close', 'idle', 'all']);
});
