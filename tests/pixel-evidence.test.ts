import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PIXEL_EVIDENCE_DEFAULT_MIN_CHANGED_PIXELS,
  bytesEqual,
  countDifferentPixels,
  evaluatePixelEvidence,
  isZeroFilled
} from '../src/pixel-evidence.js';
import type { PixelEvidenceBuffers, PixelEvidenceSignals } from '../src/pixel-evidence.js';

const WIDTH = 2;
const HEIGHT = 2;
const LENGTH = WIDTH * HEIGHT * 4;

/** Builds a buffer of `pixel` repeated across the whole 2x2 surface. */
function fill(pixel: readonly [number, number, number, number]): Uint8Array {
  const buffer = new Uint8Array(LENGTH);
  for (let index = 0; index < LENGTH; index += 4) {
    buffer[index] = pixel[0];
    buffer[index + 1] = pixel[1];
    buffer[index + 2] = pixel[2];
    buffer[index + 3] = pixel[3];
  }
  return buffer;
}

const BLANK = fill([0, 0, 0, 255]);
const SENTINEL = fill([255, 0, 255, 255]);

/** A frame that differs from the blank baseline in exactly one pixel. */
function paintedFrame(): Uint8Array {
  const frame = fill([0, 0, 0, 255]);
  frame[0] = 200;
  frame[1] = 40;
  frame[2] = 10;
  return frame;
}

function buffers(overrides: Partial<PixelEvidenceBuffers> = {}): PixelEvidenceBuffers {
  const frame = paintedFrame();
  return {
    blank: BLANK,
    sentinel: SENTINEL,
    frameOne: frame,
    frameTwo: paintedFrame(),
    ...overrides
  };
}

function signals(overrides: Partial<PixelEvidenceSignals> = {}): PixelEvidenceSignals {
  return {
    width: WIDTH,
    height: HEIGHT,
    contextLost: false,
    completedRender: true,
    timedOut: false,
    glError: 0,
    ...overrides
  };
}

test('default minimum changed pixels is the documented floor of one', () => {
  assert.equal(PIXEL_EVIDENCE_DEFAULT_MIN_CHANGED_PIXELS, 1);
});

test('bytesEqual compares content, not identity', () => {
  assert.equal(bytesEqual(paintedFrame(), paintedFrame()), true);
  assert.equal(bytesEqual(BLANK, SENTINEL), false);
});

test('bytesEqual treats a length mismatch as inequality without throwing', () => {
  assert.equal(bytesEqual(new Uint8Array(4), new Uint8Array(8)), false);
});

test('countDifferentPixels counts whole RGBA pixels', () => {
  assert.equal(countDifferentPixels(BLANK, BLANK), 0);
  assert.equal(countDifferentPixels(paintedFrame(), BLANK), 1);
  assert.equal(countDifferentPixels(SENTINEL, BLANK), WIDTH * HEIGHT);
});

test('countDifferentPixels detects an alpha-only difference', () => {
  const alphaOnly = fill([0, 0, 0, 254]);
  assert.equal(countDifferentPixels(alphaOnly, BLANK), WIDTH * HEIGHT);
});

test('countDifferentPixels ignores a trailing partial pixel', () => {
  assert.equal(countDifferentPixels(new Uint8Array([1, 2, 3]), new Uint8Array([9, 9, 9])), 0);
});

test('isZeroFilled distinguishes a blocked readback from a black frame', () => {
  assert.equal(isZeroFilled(new Uint8Array(LENGTH)), true);
  assert.equal(isZeroFilled(BLANK), false);
});

test('a genuinely painted, deterministic frame passes', () => {
  const report = evaluatePixelEvidence(buffers(), signals());
  assert.equal(report.passed, true);
  assert.equal(report.code, 'PIXEL_EVIDENCE_OK');
  assert.equal(report.changedPixels, 1);
  assert.equal(report.sentinelChangedPixels, WIDTH * HEIGHT);
  assert.equal(report.deterministic, true);
  assert.equal(report.sampledPixels, WIDTH * HEIGHT);
});

test('a lost context is reported before any pixel comparison', () => {
  const report = evaluatePixelEvidence(buffers(), signals({ contextLost: true }));
  assert.equal(report.passed, false);
  assert.equal(report.code, 'PIXEL_EVIDENCE_CONTEXT_LOST');
});

test('a zero-sized drawing buffer fails', () => {
  const report = evaluatePixelEvidence(buffers(), signals({ width: 0 }));
  assert.equal(report.code, 'PIXEL_EVIDENCE_EMPTY_VIEWPORT');
});

test('a capture that never reached the render callback fails as a timeout', () => {
  const report = evaluatePixelEvidence(
    buffers(),
    signals({ timedOut: true, completedRender: false })
  );
  assert.equal(report.code, 'PIXEL_EVIDENCE_RENDER_TIMEOUT');
});

test('a resolved capture that never rendered fails distinctly from a timeout', () => {
  const report = evaluatePixelEvidence(buffers(), signals({ completedRender: false }));
  assert.equal(report.code, 'PIXEL_EVIDENCE_NO_RENDER');
});

test('buffers that disagree with the reported viewport fail', () => {
  const report = evaluatePixelEvidence(
    buffers({ frameTwo: new Uint8Array(LENGTH + 4) }),
    signals()
  );
  assert.equal(report.code, 'PIXEL_EVIDENCE_BUFFER_LENGTH');
});

test('an all-zero sentinel is reported as a blocked readback, never skipped', () => {
  const report = evaluatePixelEvidence(
    buffers({ sentinel: new Uint8Array(LENGTH) }),
    signals()
  );
  assert.equal(report.passed, false);
  assert.equal(report.code, 'PIXEL_EVIDENCE_READBACK_BLOCKED');
});

test('a sentinel indistinguishable from the blank baseline invalidates the run', () => {
  const report = evaluatePixelEvidence(buffers({ sentinel: BLANK }), signals());
  assert.equal(report.code, 'PIXEL_EVIDENCE_SENTINEL_COLLISION');
});

test('a render that left the sentinel untouched fails', () => {
  const report = evaluatePixelEvidence(
    buffers({ frameOne: fill([255, 0, 255, 255]), frameTwo: fill([255, 0, 255, 255]) }),
    signals()
  );
  assert.equal(report.code, 'PIXEL_EVIDENCE_SENTINEL_INTACT');
});

test('a clear-only render is rejected even though a frame was produced', () => {
  const report = evaluatePixelEvidence(
    buffers({ frameOne: fill([0, 0, 0, 255]), frameTwo: fill([0, 0, 0, 255]) }),
    signals()
  );
  assert.equal(report.passed, false);
  assert.equal(report.code, 'PIXEL_EVIDENCE_BLANK_FRAME');
  assert.equal(report.changedPixels, 0);
});

test('a stricter changed-pixel budget can reject a nearly blank frame', () => {
  const report = evaluatePixelEvidence(buffers(), signals(), { minChangedPixels: 2 });
  assert.equal(report.code, 'PIXEL_EVIDENCE_BLANK_FRAME');
  assert.equal(report.changedPixels, 1);
});

test('two renders of one unchanged state must agree', () => {
  const divergent = paintedFrame();
  divergent[4] = 99;
  const report = evaluatePixelEvidence(buffers({ frameTwo: divergent }), signals());
  assert.equal(report.code, 'PIXEL_EVIDENCE_NONDETERMINISTIC');
  assert.equal(report.deterministic, false);
});

test('a trailing GL error fails a frame that is otherwise convincing', () => {
  const report = evaluatePixelEvidence(buffers(), signals({ glError: 1282 }));
  assert.equal(report.code, 'PIXEL_EVIDENCE_GL_ERROR');
  assert.equal(report.deterministic, true);
});

test('an invalid changed-pixel budget is rejected loudly', () => {
  for (const value of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => evaluatePixelEvidence(buffers(), signals(), { minChangedPixels: value }),
      /PIXEL_EVIDENCE_INVALID_INPUT:minChangedPixels/u
    );
  }
});

test('reports are frozen so a caller cannot rewrite the verdict', () => {
  const report = evaluatePixelEvidence(buffers(), signals());
  assert.equal(Object.isFrozen(report), true);
});
