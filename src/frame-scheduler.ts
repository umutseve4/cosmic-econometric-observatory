export const FRAME_WATCHDOG_DEFAULT_MS = 80;

export interface WatchdogFramePorts {
  requestAnimationFrame(callback: (time: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  now(): number;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): () => void;
}

export interface WatchdogFrameState {
  readonly pending: number;
  readonly deferred: number;
  readonly observingVisibility: boolean;
  readonly disposed: boolean;
}

export interface WatchdogFrameSource {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  state(): WatchdogFrameState;
  dispose(): void;
}

/**
 * A frame source that survives a browser which stops delivering animation frames.
 *
 * `requestAnimationFrame` is the only correct clock for painting, but a throttled,
 * hidden, offscreen or headless document is free to never call it back. Because the
 * single-frame scheduler keeps exactly one frame in flight, one undelivered frame
 * silently freezes every later `invalidate()` — selection, focus and resize would all
 * compute correctly and never reach the screen. A watchdog timer therefore races every
 * animation frame, and whichever clock wins first delivers the callback exactly once.
 *
 * The watchdog is deliberately *visibility aware*. Browsers suspend animation frames in
 * background tabs on purpose, to save battery and GPU work. Forcing a render there would
 * work against that contract, so when the watchdog fires while the document is hidden the
 * frame is parked instead of delivered, and it is released on the next transition back to
 * a visible document. Nothing is dropped and nothing is painted into a tab nobody sees.
 *
 * Every clock is injected, so the whole race is deterministically testable and the
 * timeout budget can be tuned per environment instead of hidden as a literal.
 */
export function createWatchdogFrameSource(ports: WatchdogFramePorts, watchdogMs: number = FRAME_WATCHDOG_DEFAULT_MS): WatchdogFrameSource {
  if (!Number.isFinite(watchdogMs) || watchdogMs < 0) throw new Error('FRAME_SCHEDULER_INVALID_WATCHDOG');

  interface PendingFrame {
    readonly cancel: () => void;
    readonly rearm: () => void;
  }

  const pendingFrames = new Map<number, PendingFrame>();
  const deferredFrames = new Set<number>();
  let unobserveVisibility: (() => void) | null = null;
  let frameSequence = 0;
  let disposed = false;

  const stopObservingVisibility = (): void => {
    if (unobserveVisibility === null || deferredFrames.size > 0) return;
    const unobserve = unobserveVisibility;
    unobserveVisibility = null;
    unobserve();
  };

  const releaseDeferredFrames = (): void => {
    if (disposed || ports.isHidden() || deferredFrames.size === 0) return;
    const released = [...deferredFrames];
    deferredFrames.clear();
    stopObservingVisibility();
    for (const handle of released) pendingFrames.get(handle)?.rearm();
  };

  const startObservingVisibility = (): void => {
    if (disposed || unobserveVisibility !== null) return;
    unobserveVisibility = ports.onVisibilityChange(releaseDeferredFrames);
  };

  return Object.freeze({
    requestFrame(callback: (time: number) => void): number {
      if (disposed) throw new Error('FRAME_SCHEDULER_DISPOSED');
      frameSequence += 1;
      const handle = frameSequence;
      let animationFrame = 0;
      let timer = 0;

      const cancelClocks = (): void => {
        ports.cancelAnimationFrame(animationFrame);
        ports.clearTimeout(timer);
      };
      const settle = (time: number): void => {
        if (!pendingFrames.has(handle)) return;
        pendingFrames.delete(handle);
        deferredFrames.delete(handle);
        cancelClocks();
        stopObservingVisibility();
        callback(time);
      };
      const rearm = (): void => {
        if (!pendingFrames.has(handle)) return;
        timer = ports.setTimeout(() => {
          if (!pendingFrames.has(handle)) return;
          if (ports.isHidden()) {
            deferredFrames.add(handle);
            startObservingVisibility();
            return;
          }
          settle(ports.now());
        }, watchdogMs);
      };

      pendingFrames.set(handle, {
        cancel: () => {
          cancelClocks();
          deferredFrames.delete(handle);
          stopObservingVisibility();
        },
        rearm
      });
      animationFrame = ports.requestAnimationFrame((time) => settle(time));
      rearm();
      return handle;
    },
    cancelFrame(handle: number): void {
      const frame = pendingFrames.get(handle);
      if (frame === undefined) return;
      pendingFrames.delete(handle);
      frame.cancel();
    },
    state(): WatchdogFrameState {
      return Object.freeze({
        pending: pendingFrames.size,
        deferred: deferredFrames.size,
        observingVisibility: unobserveVisibility !== null,
        disposed
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const frames = [...pendingFrames.values()];
      pendingFrames.clear();
      deferredFrames.clear();
      for (const frame of frames) frame.cancel();
      if (unobserveVisibility !== null) {
        const unobserve = unobserveVisibility;
        unobserveVisibility = null;
        unobserve();
      }
    }
  });
}
