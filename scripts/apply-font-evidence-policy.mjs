import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertSystemFallbackFontEvidence,
  BLOCKED_FONT_HOSTS,
  deriveFontEvidence,
  FONT_POLICY,
} from './font-evidence-policy.mjs';

const outputDir = path.resolve(process.env.VISUAL_EVIDENCE_DIR ?? 'visual-acceptance-evidence');
const metadataPath = path.join(outputDir, 'metadata.json');
const readmePath = path.join(outputDir, 'README.md');
const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

for (const capture of metadata.cases) {
  const evidence = deriveFontEvidence(capture.fonts);
  assertSystemFallbackFontEvidence(evidence, capture.id);
  capture.fonts = evidence;
}

metadata.schemaVersion = '1.1.0';
metadata.fontEvidencePolicy = {
  requestedPolicy: FONT_POLICY,
  blockedFontHosts: BLOCKED_FONT_HOSTS,
  availabilityRule: 'faceCount>0-and-all-matching-faces-loaded',
  cssCheckResultIsAvailabilityEvidence: false,
};

await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
await fs.appendFile(
  readmePath,
  [
    '',
    '## Deterministic font evidence',
    '',
    `- Effective visual-CI policy: \`${FONT_POLICY}\``,
    `- Blocked font hosts: ${BLOCKED_FONT_HOSTS.map((host) => `\`${host}\``).join(', ')}`,
    '- `document.fonts` readiness is recorded separately from requested-family availability.',
    '- `cssCheckResult` is diagnostic only; fallback glyphs can make `document.fonts.check()` return true.',
    '- Every canonical state fails closed unless no requested webfont faces are registered.',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`FONT_EVIDENCE_POLICY_PASS:${FONT_POLICY}:${metadata.cases.length}/${metadata.cases.length}`);
