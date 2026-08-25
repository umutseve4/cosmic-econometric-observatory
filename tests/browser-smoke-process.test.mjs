import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { waitForBrowserExit } from '../scripts/browser-smoke-process.mjs';

class FakeChild extends EventEmitter {
  pid = 123;
  killCalls = 0;
  kill() {
    this.killCalls += 1;
    return true;
  }
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
});

test('shutdown deadline rejects even when a child never closes and kill throws', async () => {
  const child = new FakeChild();
  const started = Date.now();
  await assert.rejects(waitForBrowserExit(child, 'stuck.html', {
    timeoutMs: 5,
    shutdownGraceMs: 10,
    killTree() { throw new Error('kill-failed'); }
  }), /timed out for stuck\.html after 5ms; shutdown grace 10ms/u);
  assert.ok(Date.now() - started < 250);
});

test('sequential cases each receive an independent timeout budget', async () => {
  for (const page of ['first.html', 'second.html']) {
    const child = new FakeChild();
    setTimeout(() => child.emit('close', 0, null), 12);
    assert.deepEqual(await waitForBrowserExit(child, page, { timeoutMs: 20, shutdownGraceMs: 10 }), { code: 0, signal: null });
  }
});
