/**
 * Pixel-level acceptance oracle answering one question: did the renderer
 * actually paint something this frame?
 *
 * The previous acceptance signal was the runtime's own `renderedFrames`
 * counter, which is incremented next to `renderer.render(...)`. That counter
 * proves a code path ran; it cannot prove a pixel changed. A renderer that
 * throws away every draw call, loses its context, or clears and returns still
 * increments it. This module replaces that with evidence read back out of the
 * drawing buffer.
 *
 * Deliberately NOT a golden-checksum comparison. Rasterisation output moves
 * with the Chrome build, the ANGLE/SwiftShader backend, antialiasing and the
 * device pixel ratio, so a checksum pinned in the repository would either be
 * re-pinned on every toolchain bump or silently disabled. Every comparison
 * here is between buffers captured inside a single run on a single context,
 * which is stable by construction.
 *
 * Four captures feed the oracle:
 *  - `blank`     clear-only baseline, using the application's own clear state.
 *  - `sentinel`  a deliberately non-zero fill proven to differ from `blank`.
 *  - `frameOne`  read back synchronously inside the real render callback.
 *  - `frameTwo`  a second render from the same state, for determinism.
 *
 * The load-bearing guarantees, in order of strength:
 *  1. Render causality — `frameOne` is only ever captured from inside the
 *     render callback, so `completedRender === false` (or `timedOut`) means
 *     no render happened at all.
 *  2. Blank difference — the frame must differ from a clear-only buffer,
 *     which fails any renderer that clears and draws nothing.
 *  3. Same-run determinism — two renders of one unchanged state must agree.
 *
 * The sentinel is a supporting signal rather than a load-bearing one: with
 * `preserveDrawingBuffer: false` (the production setting, which tests must not
 * change) the browser may discard the buffer after compositing, so a surviving
 * sentinel is not guaranteed to be observable. It is still checked because
 * when it *is* observable it catches a no-op render immediately, and because
 * proving `sentinel !== blank` is what makes the blank baseline trustworthy.
 */

export const PIXEL_EVIDENCE_DEFAULT_MIN_CHANGED_PIXELS = 1;

export interface PixelEvidenceBuffers {
  readonly blank: Uint8Array;
  readonly sentinel: Uint8Array;
  readonly frameOne: Uint8Array;
  readonly frameTwo: Uint8Array;
}

export interface PixelEvidenceSignals {
  readonly width: number;
  readonly height: number;
  readonly contextLost: boolean;
  readonly completedRender: boolean;
  readonly timedOut: boolean;
  readonly glError: number;
}

export interface PixelEvidenceOptions {
  readonly minChangedPixels?: number;
}

export interface PixelEvidenceReport {
  readonly passed: boolean;
  readonly code: string;
  readonly changedPixels: number;
  readonly sentinelChangedPixels: number;
  readonly deterministic: boolean;
  readonly width: number;
  readonly height: number;
  readonly sampledPixels: number;
}

/** Byte-for-byte equality. Length mismatch is inequality, never a throw. */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Counts RGBA pixels that differ in any channel. Trailing bytes that do not
 * complete a pixel are ignored rather than counted as a partial difference.
 */
export function countDifferentPixels(left: Uint8Array, right: Uint8Array): number {
  const usable = Math.min(left.length, right.length);
  const pixels = Math.floor(usable / 4);
  let different = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    if (
      left[offset] !== right[offset] ||
      left[offset + 1] !== right[offset + 1] ||
      left[offset + 2] !== right[offset + 2] ||
      left[offset + 3] !== right[offset + 3]
    ) {
      different += 1;
    }
  }
  return different;
}

/** True when every byte is zero, which is what a blocked readback returns. */
export function isZeroFilled(buffer: Uint8Array): boolean {
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) return false;
  }
  return true;
}

/**
 * Applies every check in order of diagnostic usefulness: environment problems
 * first so a lost context is never misreported as a blank frame.
 */
export function evaluatePixelEvidence(
  buffers: PixelEvidenceBuffers,
  signals: PixelEvidenceSignals,
  options: PixelEvidenceOptions = {}
): PixelEvidenceReport {
  const minChangedPixels = options.minChangedPixels ?? PIXEL_EVIDENCE_DEFAULT_MIN_CHANGED_PIXELS;
  if (!Number.isInteger(minChangedPixels) || minChangedPixels < 1) {
    throw new Error('PIXEL_EVIDENCE_INVALID_INPUT:minChangedPixels');
  }

  const { blank, sentinel, frameOne, frameTwo } = buffers;
  const sampledPixels = Math.floor(frameOne.length / 4);
  const base = {
    changedPixels: 0,
    sentinelChangedPixels: 0,
    deterministic: false,
    width: signals.width,
    height: signals.height,
    sampledPixels
  };
  const fail = (code: string, extra: Partial<PixelEvidenceReport> = {}): PixelEvidenceReport =>
    Object.freeze({ ...base, ...extra, passed: false, code });

  if (signals.contextLost) return fail('PIXEL_EVIDENCE_CONTEXT_LOST');
  if (!Number.isInteger(signals.width) || !Number.isInteger(signals.height) ||
      signals.width < 1 || signals.height < 1) {
    return fail('PIXEL_EVIDENCE_EMPTY_VIEWPORT');
  }
  if (signals.timedOut) return fail('PIXEL_EVIDENCE_RENDER_TIMEOUT');
  if (!signals.completedRender) return fail('PIXEL_EVIDENCE_NO_RENDER');

  const expected = signals.width * signals.height * 4;
  if (blank.length !== expected || sentinel.length !== expected ||
      frameOne.length !== expected || frameTwo.length !== expected) {
    return fail('PIXEL_EVIDENCE_BUFFER_LENGTH');
  }

  // The sentinel is painted with a provably non-zero colour, so an all-zero
  // read means the readback itself failed (tainted canvas, SecurityError,
  // driver refusal). Reported as a failure, never quietly skipped.
  if (isZeroFilled(sentinel)) return fail('PIXEL_EVIDENCE_READBACK_BLOCKED');

  const sentinelChangedPixels = countDifferentPixels(sentinel, blank);
  if (sentinelChangedPixels === 0) {
    return fail('PIXEL_EVIDENCE_SENTINEL_COLLISION', { sentinelChangedPixels });
  }

  const changedPixels = countDifferentPixels(frameOne, blank);
  const withCounts = { changedPixels, sentinelChangedPixels };

  if (bytesEqual(frameOne, sentinel)) {
    return fail('PIXEL_EVIDENCE_SENTINEL_INTACT', withCounts);
  }
  if (changedPixels < minChangedPixels) {
    return fail('PIXEL_EVIDENCE_BLANK_FRAME', withCounts);
  }

  const deterministic = bytesEqual(frameOne, frameTwo);
  if (!deterministic) {
    return fail('PIXEL_EVIDENCE_NONDETERMINISTIC', withCounts);
  }
  if (signals.glError !== 0) {
    return fail('PIXEL_EVIDENCE_GL_ERROR', { ...withCounts, deterministic });
  }

  return Object.freeze({
    ...base,
    ...withCounts,
    deterministic,
    passed: true,
    code: 'PIXEL_EVIDENCE_OK'
  });
}
