import assert from 'node:assert/strict';
import test from 'node:test';
import { FRAME_WATCHDOG_DEFAULT_MS, createWatchdogFrameSource } from '../src/frame-scheduler.js';

function createHarness(hidden = false) {
  const animationFrames = new Map<number, (time: number) => void>();
  const timers = new Map<number, () => void>();
  const visibilityListeners = new Set<() => void>();
  let animationSequence = 0;
  let timerSequence = 0;
  let unobserveCount = 0;
  let isHidden = hidden;
  const delays: number[] = [];

  const ports = {
    requestAnimationFrame(callback: (time: number) => void): number {
      animationSequence += 1;
      animationFrames.set(animationSequence, callback);
      return animationSequence;
    },
    cancelAnimationFrame(handle: number): void { animationFrames.delete(handle); },
    setTimeout(callback: () => void, delayMs: number): number {
      timerSequence += 1;
      delays.push(delayMs);
      timers.set(timerSequence, callback);
      return timerSequence;
    },
    clearTimeout(handle: number): void { timers.delete(handle); },
    now(): number { return 1000; },
    isHidden(): boolean { return isHidden; },
    onVisibilityChange(listener: () => void): () => void {
      visibilityListeners.add(listener);
      return () => { unobserveCount += 1; visibilityListeners.delete(listener); };
    }
  };

  return {
    ports,
    delays,
    get liveAnimationFrames() { return animationFrames.size; },
    get liveTimers() { return timers.size; },
    get visibilityListenerCount() { return visibilityListeners.size; },
    get unobserveCount() { return unobserveCount; },
    setHidden(value: boolean) { isHidden = value; },
    fireAnimationFrame(time: number) {
      const [handle, callback] = [...animationFrames][0] ?? [];
      if (handle === undefined || callback === undefined) throw new Error('no animation frame queued');
      animationFrames.delete(handle);
      callback(time);
    },
    fireTimer() {
      const [handle, callback] = [...timers][0] ?? [];
      if (handle === undefined || callback === undefined) throw new Error('no timer queued');
      timers.delete(handle);
      callback();
    },
    emitVisibilityChange() { for (const listener of [...visibilityListeners]) listener(); }
  };
}

test('the animation frame delivers the callback and cancels the watchdog', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  const times: number[] = [];

  source.requestFrame((time) => times.push(time));
  assert.equal(source.state().pending, 1);
  harness.fireAnimationFrame(42);

  assert.deepEqual(times, [42]);
  assert.equal(harness.liveTimers, 0);
  assert.deepEqual(source.state(), { pending: 0, deferred: 0, observingVisibility: false, disposed: false });
});

test('the watchdog delivers the callback when no animation frame ever arrives', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  const times: number[] = [];

  source.requestFrame((time) => times.push(time));
  harness.fireTimer();

  assert.deepEqual(times, [1000]);
  assert.equal(harness.liveAnimationFrames, 0);
  assert.equal(source.state().pending, 0);
});

test('a frame is delivered exactly once when both clocks fire', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  const handle = source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();
  assert.equal(deliveries, 1);

  source.cancelFrame(handle);
  assert.equal(deliveries, 1);
  assert.equal(source.state().pending, 0);
});

test('the default watchdog budget is used when none is injected', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  source.requestFrame(() => {});
  assert.deepEqual(harness.delays, [FRAME_WATCHDOG_DEFAULT_MS]);
  assert.equal(FRAME_WATCHDOG_DEFAULT_MS, 80);
});

test('an injected watchdog budget replaces the default', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports, 250);
  source.requestFrame(() => {});
  assert.deepEqual(harness.delays, [250]);
});

test('a non-finite or negative watchdog budget is rejected', () => {
  const harness = createHarness();
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.throws(() => createWatchdogFrameSource(harness.ports, invalid), /FRAME_SCHEDULER_INVALID_WATCHDOG/u);
  }
  assert.doesNotThrow(() => createWatchdogFrameSource(harness.ports, 0));
});

test('a hidden document parks the watchdog instead of painting offscreen', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();

  assert.equal(deliveries, 0);
  assert.deepEqual(source.state(), { pending: 1, deferred: 1, observingVisibility: true, disposed: false });
  assert.equal(harness.visibilityListenerCount, 1);
});

test('becoming visible releases a parked frame exactly once', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();
  assert.equal(deliveries, 0);

  harness.setHidden(false);
  harness.emitVisibilityChange();
  assert.equal(deliveries, 0, 'the released frame re-arms the watchdog rather than painting synchronously');
  assert.equal(source.state().deferred, 0);
  assert.equal(harness.visibilityListenerCount, 0, 'the visibility listener is released with the last parked frame');

  harness.fireTimer();
  assert.equal(deliveries, 1);
  assert.equal(source.state().pending, 0);
});

test('a visibility change that leaves the document hidden keeps the frame parked', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);

  source.requestFrame(() => {});
  harness.fireTimer();
  harness.emitVisibilityChange();

  assert.equal(source.state().deferred, 1);
  assert.equal(harness.visibilityListenerCount, 1);
});

test('an animation frame delivered while hidden still settles a parked frame', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();
  assert.equal(source.state().deferred, 1);

  harness.fireAnimationFrame(7);

  assert.equal(deliveries, 1);
  assert.deepEqual(source.state(), { pending: 0, deferred: 0, observingVisibility: false, disposed: false });
  assert.equal(harness.unobserveCount, 1);
});

test('cancelling a parked frame releases the visibility observer', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  const handle = source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();
  source.cancelFrame(handle);

  assert.equal(deliveries, 0);
  assert.deepEqual(source.state(), { pending: 0, deferred: 0, observingVisibility: false, disposed: false });
  assert.equal(harness.liveAnimationFrames, 0);
  assert.equal(harness.liveTimers, 0);
});

test('the visibility observer survives while another frame is still parked', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);

  const first = source.requestFrame(() => {});
  harness.fireTimer();
  source.requestFrame(() => {});
  harness.fireTimer();
  assert.equal(source.state().deferred, 2);

  source.cancelFrame(first);
  assert.equal(source.state().deferred, 1);
  assert.equal(harness.visibilityListenerCount, 1, 'the observer is kept for the frame that is still parked');
});

test('cancelling an unknown or already delivered frame is a no-op', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  const handle = source.requestFrame(() => { deliveries += 1; });
  harness.fireAnimationFrame(1);
  source.cancelFrame(handle);
  source.cancelFrame(9999);

  assert.equal(deliveries, 1);
  assert.equal(source.state().pending, 0);
});

test('concurrent frames are tracked and delivered independently', () => {
  const harness = createHarness();
  const source = createWatchdogFrameSource(harness.ports);
  const delivered: string[] = [];

  source.requestFrame(() => delivered.push('first'));
  source.requestFrame(() => delivered.push('second'));
  assert.equal(source.state().pending, 2);

  harness.fireAnimationFrame(1);
  harness.fireAnimationFrame(2);

  assert.deepEqual(delivered, ['first', 'second']);
  assert.equal(source.state().pending, 0);
  assert.equal(harness.liveTimers, 0);
});

test('dispose cancels every clock, releases the observer and refuses new frames', () => {
  const harness = createHarness(true);
  const source = createWatchdogFrameSource(harness.ports);
  let deliveries = 0;

  source.requestFrame(() => { deliveries += 1; });
  harness.fireTimer();
  assert.equal(source.state().observingVisibility, true);

  source.dispose();

  assert.equal(deliveries, 0);
  assert.deepEqual(source.state(), { pending: 0, deferred: 0, observingVisibility: false, disposed: true });
  assert.equal(harness.liveAnimationFrames, 0);
  assert.equal(harness.liveTimers, 0);
  assert.equal(harness.visibilityListenerCount, 0);
  assert.throws(() => source.requestFrame(() => {}), /FRAME_SCHEDULER_DISPOSED/u);

  source.dispose();
  assert.equal(source.state().disposed, true);
});
