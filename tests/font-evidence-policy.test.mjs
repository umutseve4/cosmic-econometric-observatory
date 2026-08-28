import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSystemFallbackFontEvidence,
  deriveFontEvidence,
  FONT_POLICY,
} from '../scripts/font-evidence-policy.mjs';

const fallbackFonts = {
  status: 'loaded',
  readyWithin10s: true,
  requestedFamilies: [
    { family: 'DM Sans', faceCount: 0, statuses: [], checkResult: true },
    { family: 'Libre Franklin', faceCount: 0, statuses: [], checkResult: true },
  ],
  bodyFamily: '"DM Sans", system-ui, sans-serif',
  titleFamily: '"Libre Franklin", sans-serif',
};

test('separates readiness from requested-family availability', () => {
  const evidence = deriveFontEvidence(fallbackFonts);

  assert.deepEqual(evidence.readiness, {
    documentStatus: 'loaded',
    readyWithin10s: true,
  });
  assert.equal(evidence.requestedFamiliesAvailable, false);
  assert.equal(evidence.requestedFamilies[0].cssCheckResult, true);
  assert.equal(evidence.requestedFamilies[0].available, false);
  assert.equal(evidence.effectivePolicy, FONT_POLICY);
  assert.doesNotThrow(() => assertSystemFallbackFontEvidence(evidence, 'VA-M-D'));
});

test('fails closed when a requested webfont face is registered', () => {
  const evidence = deriveFontEvidence({
    ...fallbackFonts,
    requestedFamilies: [
      { family: 'DM Sans', faceCount: 1, statuses: ['loaded'], checkResult: true },
      { family: 'Libre Franklin', faceCount: 0, statuses: [], checkResult: true },
    ],
  });

  assert.throws(
    () => assertSystemFallbackFontEvidence(evidence, 'VA-D-D'),
    /FONT_POLICY_NOT_SYSTEM_FALLBACK:VA-D-D/,
  );
});

test('fails closed when document font readiness times out', () => {
  const evidence = deriveFontEvidence({ ...fallbackFonts, readyWithin10s: false });

  assert.throws(
    () => assertSystemFallbackFontEvidence(evidence, 'VA-D-F'),
    /FONT_READINESS_FAILED:VA-D-F/,
  );
});
