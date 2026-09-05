import assert from 'node:assert/strict';
import test from 'node:test';
import { clampThreeZoom, createSingleFrameScheduler, deriveThreeViewport, fitThreeCamera } from '../src/index.js';

test('derives integer CSS viewport dimensions and bounds DPR to [1, 2]', () => {
  assert.deepEqual(deriveThreeViewport(801.9, 600.8, 3), { width: 801, height: 600, aspect: 801 / 600, dpr: 2 });
  assert.deepEqual(deriveThreeViewport(320, 240, 0.5), { width: 320, height: 240, aspect: 4 / 3, dpr: 1 });
  assert.equal(deriveThreeViewport(0, 240, 1), null);
  assert.equal(deriveThreeViewport(Number.NaN, 240, 1), null);
});

test('fits bounds deterministically and validates camera inputs', () => {
  const fit = fitThreeCamera({ minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: -1, maxZ: 1 }, 50, 4 / 3);
  assert.deepEqual(fit.center, { x: 0, y: 0, z: 0 });
  assert.ok(fit.distance > 1);
  assert.ok(fit.near > 0 && fit.far > fit.distance);
  assert.throws(() => fitThreeCamera({ minX: 1, maxX: -1, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }, 50, 1), /THREE_VIEWPORT_INVALID_FIT_INPUT/);
});

test('clamps zoom and rejects invalid ranges', () => {
  assert.equal(clampThreeZoom(2, 4, 12), 4);
  assert.equal(clampThreeZoom(8, 4, 12), 8);
  assert.equal(clampThreeZoom(20, 4, 12), 12);
  assert.throws(() => clampThreeZoom(2, 0, 12), /THREE_VIEWPORT_INVALID_ZOOM_INPUT/);
});

test('keeps at most one frame pending, supports reduced motion, and disposes idempotently', () => {
  let nextHandle = 1;
  const callbacks = new Map<number, (time: number) => void>();
  const cancelled: number[] = [];
  const rendered: number[] = [];
  const scheduler = createSingleFrameScheduler({
    requestFrame(callback) { const handle = nextHandle++; callbacks.set(handle, callback); return handle; },
    cancelFrame(handle) { cancelled.push(handle); callbacks.delete(handle); },
    render(time) { rendered.push(time); }
  });
  scheduler.start();
  scheduler.start();
  scheduler.invalidate();
  assert.equal(callbacks.size, 1);
  const first = [...callbacks.entries()][0]!;
  callbacks.delete(first[0]); first[1](10);
  assert.deepEqual(rendered, [10]);
  assert.equal(callbacks.size, 1);
  scheduler.setReducedMotion(true);
  assert.equal(callbacks.size, 1);
  const reduced = [...callbacks.entries()][0]!;
  callbacks.delete(reduced[0]); reduced[1](20);
  assert.deepEqual(rendered, [10, 20]);
  assert.equal(callbacks.size, 0);
  scheduler.invalidate(); scheduler.invalidate();
  assert.equal(callbacks.size, 1);
  scheduler.dispose(); scheduler.dispose();
  assert.equal(callbacks.size, 0);
  assert.equal(cancelled.length, 2);
  assert.deepEqual(scheduler.state(), { running: false, reducedMotion: true, pending: false, disposed: true });
});
